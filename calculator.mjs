export const DEFAULT_INPUTS = Object.freeze({
  assets: '',
  stopDistancePercent: '',
  riskPercent: '1',
});
export const FIELDS = Object.freeze(Object.keys(DEFAULT_INPUTS));
const LABELS = { assets: '총자산', stopDistancePercent: '손절 거리', riskPercent: '위험 비율' };
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const MAX_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

// Use decimal fractions so floor(0.29 * 100) cannot accidentally become 28.
// BigInt is built into JavaScript; no intermediate rounding or library is needed.
function fraction(value) {
  const [mantissa, exponent = '0'] = value.trim().toLowerCase().replace(/^\+/, '').split('e');
  const [whole, decimals = ''] = mantissa.split('.');
  const coefficient = BigInt((whole || '0') + decimals);
  const scale = decimals.length - Number(exponent);
  return scale >= 0
    ? [coefficient, 10n ** BigInt(scale)]
    : [coefficient * 10n ** BigInt(-scale), 1n];
}

/** Returns a short Korean error, or null for a valid numeric input string. */
export function validateField(field, value) {
  const label = LABELS[field];
  if (typeof value !== 'string') return `${label}: 숫자를 입력해 주세요.`;
  const text = value.trim();
  if (!text) return `${label} 값을 입력해 주세요.`;
  if (!DECIMAL.test(text) || !Number.isFinite(Number(text))) {
    return `${label}: 유한한 숫자를 입력해 주세요.`;
  }
  if (Number(text) <= 0) return `${label}: 0보다 큰 값을 입력해 주세요.`;
  if (field === 'riskPercent') {
    const [n, d] = fraction(text);
    if (n > 100n * d) return '위험 비율은 100% 이하여야 합니다.';
  }
  return null;
}

function centsToString(cents) {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}

/** Pure calculation. Valid amounts are decimal strings, without grouping commas. */
export function calculatePosition(inputs = DEFAULT_INPUTS) {
  const errors = {};
  let invalid = false;
  for (const field of FIELDS) {
    const value = inputs?.[field];
    const error = validateField(field, value);
    if (error) {
      errors[field] = error;
      if (typeof value !== 'string' || value.trim() !== '') invalid = true;
    }
  }
  if (Object.keys(errors).length) {
    return { status: invalid ? 'invalid' : 'incomplete', errors, message: '입력값을 확인해 주세요.' };
  }

  const [a, ad] = fraction(inputs.assets);
  const [r, rd] = fraction(inputs.riskPercent);
  const [d, dd] = fraction(inputs.stopDistancePercent);
  const lossNumerator = a * r;
  const lossDenominator = ad * rd * 100n;
  // (A × R / 100) / (D / 100) = A × R / D.
  const positionNumerator = a * r * dd;
  const positionDenominator = ad * rd * d;

  // Conservative bound: both amounts must be safe at cent precision.
  if (lossNumerator * 100n > MAX_CENTS * lossDenominator ||
      positionNumerator * 100n > MAX_CENTS * positionDenominator) {
    return { status: 'invalid', errors: {}, message: '계산 결과가 안전하게 표시할 수 있는 범위를 초과합니다. 입력값을 줄여 주세요.' };
  }
  const positionCents = positionNumerator * 100n / positionDenominator;
  const lossCents = (lossNumerator * 200n + lossDenominator) / (lossDenominator * 2n);
  return {
    status: 'valid',
    errors: {},
    positionAmount: centsToString(positionCents),
    lossAmount: centsToString(lossCents),
    message: positionCents === 0n ? '진입 금액이 0.01 USDT 미만입니다. 소수 둘째 자리까지 내림합니다.' : '진입 금액은 소수 둘째 자리까지 내림합니다.',
  };
}

export function formatAmount(amount) {
  const [whole, decimals] = amount.split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${decimals}`;
}
