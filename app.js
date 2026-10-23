import { calculatePosition, FIELDS, formatAmount } from './calculator.mjs';
import { loadSettings, mergeValidInputs, saveSettings } from './storage.mjs';

const form = document.querySelector('#calculator-form');
const inputs = Object.fromEntries(FIELDS.map((field) => [field, document.getElementById(field)]));
const positionOutput = document.querySelector('#position-amount');
const lossOutput = document.querySelector('#loss-amount');
const resultMessage = document.querySelector('#result-message');
const copyButton = document.querySelector('#copy-button');
const copyFeedback = document.querySelector('#copy-feedback');
const storageStatus = document.querySelector('#storage-status');
const offlineStatus = document.querySelector('#offline-status');
const loaded = loadSettings();
let savedValues = loaded.values;
let result;
let inputRevision = 0;

function showStorageStatus(available) {
  storageStatus.textContent = available ? '' : '이 브라우저에서는 저장할 수 없습니다. 계산은 계속 사용할 수 있습니다.';
}

for (const field of FIELDS) inputs[field].value = savedValues[field];
showStorageStatus(loaded.available);

function render(persist = false) {
  const values = Object.fromEntries(FIELDS.map((field) => [field, inputs[field].value]));
  result = calculatePosition(values);
  inputRevision += 1;
  copyFeedback.textContent = '';
  for (const field of FIELDS) {
    // Empty fields are a normal editing state; the result panel supplies guidance.
    const error = values[field].trim() ? result.errors[field] : '';
    document.getElementById(`${field}-error`).textContent = error || '';
    inputs[field].setAttribute('aria-invalid', error ? 'true' : 'false');
  }
  const valid = result.status === 'valid';
  positionOutput.textContent = valid ? formatAmount(result.positionAmount) : '—';
  lossOutput.textContent = valid ? formatAmount(result.lossAmount) : '—';
  copyButton.disabled = !valid;
  resultMessage.textContent = result.status === 'incomplete'
    ? '총자산, 손절 거리와 위험 비율을 모두 입력해 주세요.'
    : result.message;
  if (persist) {
    const next = mergeValidInputs(savedValues, values);
    if (JSON.stringify(next) !== JSON.stringify(savedValues)) {
      showStorageStatus(saveSettings(next));
      savedValues = next;
    }
  }
}

form.addEventListener('submit', (event) => event.preventDefault());
form.addEventListener('input', () => render(true));
render();

copyButton.addEventListener('click', async () => {
  if (result.status !== 'valid') return;
  const revision = inputRevision;
  const amount = result.positionAmount;
  try {
    await navigator.clipboard.writeText(amount);
    if (revision === inputRevision) copyFeedback.textContent = `${amount} 복사 완료`;
  } catch {
    if (revision === inputRevision) copyFeedback.textContent = '복사하지 못했습니다. 브라우저 권한을 확인하거나 금액을 직접 선택해 주세요.';
  }
});

async function registerOfflineSupport() {
  if (!('serviceWorker' in navigator)) {
    offlineStatus.textContent = '이 브라우저에서는 오프라인 실행을 지원하지 않습니다.';
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
    const showUpdate = () => { offlineStatus.textContent = '새 버전이 준비되었습니다. 앱과 계산기 탭을 모두 닫고 다시 열면 적용됩니다.'; };
    if (registration.waiting) showUpdate();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
        if (worker.state === 'redundant' && !navigator.serviceWorker.controller) {
          offlineStatus.textContent = '오프라인 준비에 실패했습니다. 온라인에서 다시 열어 주세요.';
        }
      });
    });
    await navigator.serviceWorker.ready;
    if (!registration.waiting) offlineStatus.textContent = '오프라인 사용 준비 완료';
  } catch {
    offlineStatus.textContent = '오프라인 준비에 실패했습니다. 온라인에서 다시 열어 주세요.';
  }
}
registerOfflineSupport();
