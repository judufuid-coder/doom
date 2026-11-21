const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWalletPayload } = require('../src/wallet-ui');

test('wallet displays the user and Secrets balance on one message line', () => {
  const payload = buildWalletPayload(
    {
      id: 'user-123',
      username: 'Mahmo',
      globalName: 'Mahmo'
    },
    { name: 'Secrets', emoji: '🪙' },
    1_234_560_000n
  );

  assert.equal(payload.content, '<@user-123> has **1,234.56 Secrets**.');
  assert.deepEqual(payload.allowedMentions, { parse: [] });
});

test('wallet displays its balance in Arabic when Arabic is selected', () => {
  const payload = buildWalletPayload(
    { id: 'user-123' },
    { name: 'Secrets', emoji: '🪙' },
    1_234_560_000n,
    'ar'
  );

  assert.equal(payload.content, '<@user-123> لديه **1,234.56 Secrets**.');
});
