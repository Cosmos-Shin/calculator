import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const workerSource = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const scope = 'https://example.github.io/calculator/';

function workerHarness() {
  const listeners = {};
  const stores = new Map();
  const cachedUrls = [];
  let online = true;
  let claimed = false;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async addAll(requests) {
          for (const request of requests) {
            assert.equal(request.cache, 'reload');
            cachedUrls.push(request.url);
            entries.set(request.url, new Response(`cached:${request.url}`));
          }
        },
        async match(request) { return entries.get(typeof request === 'string' ? request : request.url)?.clone(); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(key) { return stores.delete(key); },
  };
  vm.runInNewContext(workerSource, {
    URL, Request, caches,
    fetch: async () => { if (!online) throw new Error('offline'); return new Response('network'); },
    self: {
      registration: { scope },
      clients: { async claim() { claimed = true; } },
      addEventListener(name, handler) { listeners[name] = handler; },
    },
  });
  return {
    stores, cachedUrls,
    setOffline() { online = false; },
    get claimed() { return claimed; },
    async lifecycle(name) { let pending; listeners[name]({ waitUntil(promise) { pending = promise; } }); await pending; },
    async request(url, mode = 'cors', method = 'GET') {
      let response;
      listeners.fetch({ request: { url, mode, method }, respondWith(promise) { response = promise; } });
      return response;
    },
  };
}

test('프로젝트 하위 경로의 앱 파일을 모두 캐시하고 오프라인 응답', async () => {
  const worker = workerHarness();
  await worker.lifecycle('install');
  worker.setOffline();
  assert.equal(worker.cachedUrls.length, 9);
  for (const url of worker.cachedUrls) {
    assert.ok(url.startsWith(scope));
    const relative = url.slice(scope.length) || 'index.html';
    assert.ok((await readFile(new URL(`../${relative}`, import.meta.url))).length > 0);
    assert.match(await (await worker.request(url)).text(), /^cached:/);
  }
  for (const path of ['', 'index.html', '?installed=1']) {
    assert.equal(await (await worker.request(scope + path, 'navigate')).text(), `cached:${scope}index.html`);
  }
});

test('캐시 업데이트는 현재 앱의 이전 버전만 제거', async () => {
  const worker = workerHarness();
  const old = `position-size-calculator:${scope}:v0`;
  const otherApp = 'position-size-calculator:https://example.github.io/other/:v0';
  worker.stores.set(old, new Map());
  worker.stores.set(otherApp, new Map());
  worker.stores.set('unrelated-app-v1', new Map());
  await worker.lifecycle('install');
  await worker.lifecycle('activate');
  assert.equal(worker.stores.has(old), false);
  assert.equal(worker.stores.has(otherApp), true);
  assert.equal(worker.stores.has('unrelated-app-v1'), true);
  assert.equal(worker.claimed, true);
});

test('다른 앱·외부 요청·POST·없는 페이지를 가로채지 않음', async () => {
  const worker = workerHarness();
  for (const [url, mode, method] of [
    ['https://example.github.io/other/', 'navigate', 'GET'],
    ['https://external.example/file', 'cors', 'GET'],
    [scope, 'cors', 'POST'],
    [scope + 'missing.html', 'navigate', 'GET'],
  ]) assert.equal(await worker.request(url, mode, method), undefined);
});

test('manifest의 상대 경로, standalone 및 실제 PNG 아이콘 크기', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ['192x192', '512x512']);
  for (const icon of manifest.icons) {
    const data = await readFile(new URL(`../${icon.src}`, import.meta.url));
    assert.equal(data.subarray(1, 4).toString(), 'PNG');
    assert.equal(`${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`, icon.sizes);
  }
});
