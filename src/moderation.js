const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

function parseTimeoutDuration(value) {
  const match = value.trim().match(/^(\d+)\s*(m|h|d)$/i);
  if (!match) throw new Error('Timeout duration must use minutes, hours, or days (for example 30m, 4h, or 2d).');
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  const duration = amount * multiplier;
  if (!Number.isSafeInteger(amount) || duration < 60_000 || duration > MAX_TIMEOUT_MS) {
    throw new Error('Timeout duration must be from 1 minute to 28 days.');
  }
  return duration;
}

module.exports = { MAX_TIMEOUT_MS, parseTimeoutDuration };
