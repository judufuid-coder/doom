const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_MINOR,
  MAX_BALANCE_MINOR,
  parseMinor,
  toMinor,
  toMicros,
  sourceMinorForTarget,
  formatMinor,
  formatPrice
} = require('../src/money');

test('amounts and prices are converted at their supported precision', () => {
  assert.equal(toMinor(12.34), 12_340_000);
  assert.equal(toMinor(0.000001), 1);
  assert.equal(toMicros(1.25), 1_250_000);
  assert.equal(toMicros(1_000_001), 1_000_001_000_000);
  assert.throws(() => toMinor(1.0000001), /six decimal places/);
  assert.throws(() => toMicros(0.0000001), /six decimal places/);
  assert.throws(() => toMicros(Number.MAX_VALUE), /supported storage precision/);
});

test('exchange source amount is rounded up to cover the requested target amount', () => {
  assert.equal(sourceMinorForTarget(333_000_000, 1_000_000, 123_000_000), 40_959_000_000);
  assert.equal(sourceMinorForTarget(1, 3, 2), 1);
  assert.equal(sourceMinorForTarget(1_333_333, 2_000_000, 3_000_000), 2_000_000);
  assert.throws(() => sourceMinorForTarget(MAX_MINOR, 1, Number.MAX_SAFE_INTEGER), /maximum supported balance/);
});

test('currency values use readable decimal formatting', () => {
  assert.equal(formatMinor(1_000_000), '1');
  assert.equal(formatMinor(1_500_000), '1.5');
  assert.equal(formatMinor(1_010_000), '1.01');
  assert.equal(formatMinor(1_234_560_000), '1,234.56');
  assert.equal(formatMinor(1), '0.000001');
  assert.equal(formatPrice(1_000_000), '1');
  assert.equal(formatPrice(1_250_000), '1.25');
  assert.equal(formatMinor(MAX_MINOR), '9,007,199,254.740991');
  assert.equal(formatPrice(Number.MAX_SAFE_INTEGER), '9,007,199,254.740991');
});

test('owner grant amount parser preserves six decimals up to SQLite integer capacity', () => {
  assert.equal(parseMinor('9007199254.740992'), 9_007_199_254_740_992n);
  assert.equal(parseMinor('1.000001'), 1_000_001n);
  assert.equal(parseMinor('9223372036854.775807'), MAX_BALANCE_MINOR);
  assert.throws(() => parseMinor('9223372036854.775808'), /maximum supported balance/);
  assert.throws(() => parseMinor('1.0000001'), /six decimal places/);
  assert.throws(() => parseMinor('0'), /positive amount/);
});

test('string amounts support values beyond JavaScript safe integer precision', () => {
  assert.equal(parseMinor('9007199254.740992'), 9_007_199_254_740_992n);
});
