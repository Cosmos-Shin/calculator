import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_INPUTS } from '../calculator.mjs';
import { loadSettings, mergeValidInputs, saveSettings, STORAGE_KEY } from '../storage.mjs';

const values = { assets: '5300', stopDistancePercent: '2.6', riskPercent: '1' };
function memoryStorage(raw = null) {
  return {
    getItem(key) { assert.equal(key, STORAGE_KEY); return raw; },
    setItem(key, value) { assert.equal(key, STORAGE_KEY); raw = value; },
  };
}

test('최초 실행은 기본값, 저장 후에는 정상 입력 복원', () => {
  const storage = memoryStorage();
  assert.deepEqual(loadSettings(() => storage).values, DEFAULT_INPUTS);
  assert.equal(saveSettings(values, () => storage), true);
  assert.deepEqual(loadSettings(() => storage).values, values);
});

test('손상되거나 유효하지 않은 객체는 전체 기본값으로 복구', () => {
  for (const raw of ['{', 'null', '[]', '123', '{}', JSON.stringify({ ...values, riskPercent: '101' }),
    JSON.stringify({ ...values, assets: 5300 }), JSON.stringify({ ...values, assets: '1e308' })]) {
    const restored = loadSettings(() => memoryStorage(raw));
    assert.deepEqual(restored.values, DEFAULT_INPUTS);
    assert.equal(restored.available, true);
  }
});

test('필드별 마지막 정상값 유지, 공란이나 오류로 덮어쓰지 않음', () => {
  assert.deepEqual(mergeValidInputs(values, { assets: '', stopDistancePercent: '0', riskPercent: '2' }), { ...values, riskPercent: '2' });
  const partial = mergeValidInputs(DEFAULT_INPUTS, { ...DEFAULT_INPUTS, assets: ' 5300 ' });
  assert.deepEqual(partial, { ...DEFAULT_INPUTS, assets: '5300' });
  const storage = memoryStorage();
  assert.equal(saveSettings(partial, () => storage), true);
  assert.deepEqual(loadSettings(() => storage).values, partial);
});

test('너무 큰 계산 결과는 저장하지 않고 마지막 정상 상태 유지', () => {
  assert.deepEqual(mergeValidInputs(values, { ...values, assets: '1e308' }), values);
  assert.equal(saveSettings({ ...values, riskPercent: '0' }, () => memoryStorage()), false);
});

test('저장소 getter, 읽기, 쓰기 실패 모두 예외 전파 없이 처리', () => {
  const denied = () => { throw new Error('SecurityError'); };
  const brokenStorage = () => ({ getItem: denied, setItem: denied });
  for (const getter of [denied, brokenStorage]) {
    assert.deepEqual(loadSettings(getter), { values: { ...DEFAULT_INPUTS }, available: false });
    assert.equal(saveSettings(values, getter), false);
  }
});
