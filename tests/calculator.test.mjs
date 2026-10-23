import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePosition, DEFAULT_INPUTS, FIELDS, formatAmount } from '../calculator.mjs';

const example = { assets: '5300', stopDistancePercent: '2.6', riskPercent: '1' };

test('기획서 예시: 2,038.46 USDT / 53.00 USDT', () => {
  const result = calculatePosition(example);
  assert.equal(result.status, 'valid');
  assert.equal(formatAmount(result.positionAmount), '2,038.46');
  assert.equal(result.lossAmount, '53.00');
});

test('위험 비율을 변경하면 두 결과가 즉시 바뀌는 계산', () => {
  const result = calculatePosition({ ...example, riskPercent: '0.5' });
  assert.equal(result.positionAmount, '1019.23');
  assert.equal(result.lossAmount, '26.50');
});

test('진입 금액은 반올림하지 않고 소수 둘째 자리까지 내림', () => {
  assert.equal(calculatePosition({ assets: '1', stopDistancePercent: '6', riskPercent: '1' }).positionAmount, '0.16');
});

test('소수 0.29의 이진 부동소수점 내림 오차 방지', () => {
  const result = calculatePosition({ assets: '0.29', stopDistancePercent: '100', riskPercent: '100' });
  assert.equal(result.positionAmount, '0.29');
  assert.equal(result.lossAmount, '0.29');
});

test('손실을 중간 반올림하지 않고 진입 금액 계산; 손실 표시는 반올림', () => {
  const result = calculatePosition({ assets: '1.005', stopDistancePercent: '3', riskPercent: '100' });
  assert.equal(result.positionAmount, '33.50');
  assert.equal(result.lossAmount, '1.01');
});

test('기본값 및 입력 중 공란에는 결과가 없음', () => {
  assert.deepEqual(DEFAULT_INPUTS, { assets: '', stopDistancePercent: '', riskPercent: '1' });
  for (const field of FIELDS) {
    const result = calculatePosition({ ...example, [field]: '  ' });
    assert.equal(result.status, 'incomplete');
    assert.equal(result.positionAmount, undefined);
    assert.ok(result.errors[field]);
  }
});

for (const field of FIELDS) {
  test(`${field}: 잘못된 값은 계산하지 않음`, () => {
    for (const value of ['0', '-0', '-1', 'Infinity', '-Infinity', 'NaN', 'abc', '1abc', '1,000', '0x10', '.', '1e309', '1e-400', null, undefined, 1, {}, []]) {
      const result = calculatePosition({ ...example, [field]: value });
      assert.equal(result.status, 'invalid', String(value));
      assert.ok(result.errors[field], String(value));
      assert.equal(result.positionAmount, undefined);
      assert.equal(result.lossAmount, undefined);
    }
  });
}

test('위험 비율의 정확한 상한은 100; 손절 거리는 100 초과 가능', () => {
  assert.equal(calculatePosition({ ...example, riskPercent: '100' }).status, 'valid');
  for (const value of ['100.01', '100.00000000000000001', '101']) {
    assert.equal(calculatePosition({ ...example, riskPercent: value }).status, 'invalid');
  }
  assert.equal(calculatePosition({ ...example, stopDistancePercent: '150' }).status, 'valid');
});

test('양수 소수와 지수 표기, 입력 앞뒤 공백 지원', () => {
  const result = calculatePosition({ assets: ' 5.3e3 ', stopDistancePercent: '2.6', riskPercent: '+.5' });
  assert.equal(result.positionAmount, '1019.23');
});

test('센트 단위 안전 범위 초과와 무한대가 될 결과는 오류', () => {
  for (const values of [
    { ...example, assets: '1e308' },
    { ...example, stopDistancePercent: '5e-324' },
    { assets: '90071992547409.92', stopDistancePercent: '100', riskPercent: '100' },
  ]) {
    const result = calculatePosition(values);
    assert.equal(result.status, 'invalid');
    assert.match(result.message, /범위/);
    assert.equal(result.positionAmount, undefined);
  }
  const boundary = calculatePosition({ assets: '90071992547409.91', stopDistancePercent: '100', riskPercent: '100' });
  assert.equal(boundary.positionAmount, '90071992547409.91');
});

test('매우 작은 양수는 0.00으로 표시하고 안내', () => {
  const result = calculatePosition({ assets: '5e-324', stopDistancePercent: '1', riskPercent: '1' });
  assert.equal(result.status, 'valid');
  assert.equal(result.positionAmount, '0.00');
  assert.match(result.message, /미만/);
});

test('다양한 값에서 내림한 포지션이 계획 손실을 초과하지 않음', () => {
  for (const assetCents of [1n, 29n, 1005n, 530000n]) {
    for (const distanceHundredths of [1n, 3n, 260n, 10000n]) {
      for (const riskHundredths of [1n, 100n, 10000n]) {
        const result = calculatePosition({
          assets: (Number(assetCents) / 100).toFixed(2),
          stopDistancePercent: (Number(distanceHundredths) / 100).toFixed(2),
          riskPercent: (Number(riskHundredths) / 100).toFixed(2),
        });
        const cents = BigInt(result.positionAmount.replace('.', ''));
        assert.ok(cents * distanceHundredths <= assetCents * riskHundredths);
        assert.ok((cents + 1n) * distanceHundredths > assetCents * riskHundredths);
      }
    }
  }
});
