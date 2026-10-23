import { calculatePosition, DEFAULT_INPUTS, FIELDS, validateField } from './calculator.mjs';

export const STORAGE_KEY = 'position-size-calculator:settings:v1';

function isValidSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!FIELDS.every((field) => typeof value[field] === 'string' &&
    ((field !== 'riskPercent' && value[field] === '') || validateField(field, value[field]) === null))) return false;
  return calculatePosition(value).status !== 'invalid';
}

// Access storage inside try: even obtaining window.localStorage may throw.
export function loadSettings(getStorage = () => window.localStorage) {
  try {
    const raw = getStorage().getItem(STORAGE_KEY);
    if (raw === null) return { values: { ...DEFAULT_INPUTS }, available: true };
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
    return {
      values: isValidSettings(parsed)
        ? Object.fromEntries(FIELDS.map((field) => [field, parsed[field]]))
        : { ...DEFAULT_INPUTS },
      available: true,
    };
  } catch {
    return { values: { ...DEFAULT_INPUTS }, available: false };
  }
}

/** Keep each field's last valid value, including while other fields are empty. */
export function mergeValidInputs(previous, inputs) {
  const next = { ...previous };
  for (const field of FIELDS) {
    if (validateField(field, inputs[field]) === null) next[field] = inputs[field].trim();
  }
  return isValidSettings(next) ? next : { ...previous };
}

export function saveSettings(values, getStorage = () => window.localStorage) {
  if (!isValidSettings(values)) return false;
  try {
    getStorage().setItem(STORAGE_KEY, JSON.stringify(values));
    return true;
  } catch {
    return false;
  }
}
