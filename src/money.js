const MAX_MINOR = Number.MAX_SAFE_INTEGER;
const MAX_BALANCE_MINOR = 9_223_372_036_854_775_807n;
const AMOUNT_SCALE = 1_000_000;

function parseMinor(value) {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(String(value).trim());
  if (!match) {
    throw new Error('Enter a positive amount with no more than six decimal places.');
  }
  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] || '').padEnd(6, '0') || '0');
  const minor = whole * BigInt(AMOUNT_SCALE) + fraction;
  if (minor <= 0n) throw new Error('Enter a positive amount.');
  if (minor > MAX_BALANCE_MINOR) {
    throw new Error('Amount exceeds the maximum supported balance.');
  }
  return minor;
}

function toMinor(amount) {
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_MINOR / AMOUNT_SCALE) {
    throw new Error('Enter a positive amount within the supported limit.');
  }
  const scaledAmount = amount * AMOUNT_SCALE;
  const minor = Math.round(scaledAmount);
  if (Math.abs(scaledAmount - minor) > 1e-5 || !Number.isSafeInteger(minor)) {
    throw new Error('Amounts must have no more than six decimal places.');
  }
  return minor;
}

function toMicros(price) {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Enter a positive price.');
  }
  const scaledPrice = price * 1_000_000;
  if (!Number.isFinite(scaledPrice) || scaledPrice > Number.MAX_SAFE_INTEGER) {
    throw new Error('Price exceeds the supported storage precision.');
  }
  const micros = Math.round(scaledPrice);
  if (Math.abs(scaledPrice - micros) > 1e-5 || !Number.isSafeInteger(micros)) {
    throw new Error('Prices must have no more than six decimal places.');
  }
  return micros;
}

function sourceMinorForTarget(targetMinor, fromPriceMicros, toPriceMicros) {
  if (!Number.isSafeInteger(targetMinor) || targetMinor <= 0 ||
      !Number.isSafeInteger(fromPriceMicros) || fromPriceMicros <= 0 ||
      !Number.isSafeInteger(toPriceMicros) || toPriceMicros <= 0) {
    throw new Error('Invalid exchange amount or currency price.');
  }
  const numerator = BigInt(targetMinor) * BigInt(toPriceMicros);
  const denominator = BigInt(fromPriceMicros);
  const sourceMinor = (numerator + denominator - 1n) / denominator;
  if (sourceMinor > BigInt(MAX_MINOR)) {
    throw new Error('The required exchange amount exceeds the maximum supported balance.');
  }
  return Number(sourceMinor);
}

function formatMinor(minor) {
  const value = BigInt(minor);
  const scale = BigInt(AMOUNT_SCALE);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(6, '0').replace(/0+$/, '');
  return `${whole.toLocaleString('en-US')}${fraction ? `.${fraction}` : ''}`;
}

function formatPrice(micros) {
  const value = BigInt(micros);
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${whole.toLocaleString('en-US')}${fraction ? `.${fraction}` : ''}`;
}

module.exports = {
  MAX_MINOR,
  MAX_BALANCE_MINOR,
  AMOUNT_SCALE,
  parseMinor,
  toMinor,
  toMicros,
  sourceMinorForTarget,
  formatMinor,
  formatPrice
};
