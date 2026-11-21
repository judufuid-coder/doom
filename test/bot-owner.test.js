const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isConfiguredBotOwner,
  parseConfiguredBotOwnerIds,
  requireBotOwner
} = require('../src/bot-owner');

const existingOwnerId = '12345678901234567';
const additionalOwnerId = '1473545170065559704';

test('parses a single owner ID and remains backward compatible', () => {
  assert.deepEqual(parseConfiguredBotOwnerIds(existingOwnerId), [existingOwnerId]);
  assert.equal(isConfiguredBotOwner(existingOwnerId, existingOwnerId), true);
});

test('allows every configured owner in a comma-separated list', () => {
  const configuredIds = `${existingOwnerId}, ${additionalOwnerId}`;
  assert.deepEqual(parseConfiguredBotOwnerIds(configuredIds), [existingOwnerId, additionalOwnerId]);
  assert.equal(isConfiguredBotOwner(existingOwnerId, configuredIds), true);
  assert.equal(isConfiguredBotOwner(additionalOwnerId, configuredIds), true);
  assert.doesNotThrow(() => requireBotOwner(additionalOwnerId, configuredIds));
});

test('rejects invalid or partially malformed owner lists', () => {
  assert.equal(parseConfiguredBotOwnerIds(''), null);
  assert.equal(parseConfiguredBotOwnerIds(`${existingOwnerId},invalid`), null);
  assert.equal(isConfiguredBotOwner(additionalOwnerId, `${existingOwnerId},invalid`), false);
  assert.throws(() => requireBotOwner(additionalOwnerId, existingOwnerId), /Only the configured bot owner/);
});
