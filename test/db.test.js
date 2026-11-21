const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'currency-bot-test-'));
process.env.DATABASE_PATH = path.join(tempDir, 'test.sqlite');
const {
  db,
  MAX_BALANCE_MINOR,
  statements,
  getBalance,
  changeBalance,
  transaction,
  recordTransaction
} = require('../src/db');

test('balances update atomically and failed transactions roll back', () => {
  const currency = statements.getCurrency.get('Secrets');
  assert.ok(currency);

  transaction(() => {
    changeBalance('test-user', currency.id, 1000);
    recordTransaction('test-user', currency.id, 1000, 'test_credit');
  });
  assert.equal(getBalance('test-user', currency.id), 1000n);

  transaction(() => {
    changeBalance('max-balance-user', currency.id, MAX_BALANCE_MINOR);
    recordTransaction('max-balance-user', currency.id, MAX_BALANCE_MINOR, 'admin_grant');
  });
  assert.equal(getBalance('max-balance-user', currency.id), MAX_BALANCE_MINOR);
  assert.throws(
    () => changeBalance('max-balance-user', currency.id, 1n),
    /balance change is not possible/
  );
  const ownerBalances = statements.ownerCurrencyBalances.all(currency.id);
  assert.equal(
    ownerBalances.reduce((total, balance) => total + balance.amount_minor, 0n),
    MAX_BALANCE_MINOR + 1000n
  );
  assert.equal(ownerBalances.length, 2);
  assert.deepEqual(
    statements.ownerCurrencyLeaderboard.all(currency.id).map(holder => holder.user_id),
    ['max-balance-user', 'test-user']
  );
  for (let index = 0; index < 105; index++) {
    statements.setBalance.run(`owner-leaderboard-${index}`, currency.id, index + 2000);
  }
  const topHolders = statements.ownerCurrencyLeaderboard.all(currency.id);
  assert.equal(topHolders.length, 100);
  assert.equal(topHolders[0].user_id, 'max-balance-user');
  assert.equal(topHolders[1].user_id, 'owner-leaderboard-104');
  assert.equal(topHolders[99].user_id, 'owner-leaderboard-6');
  const issued = statements.ownerIssuedCurrencyTransactions.all(currency.id);
  assert.equal(issued.reduce((total, row) => total + row.amount_minor, 0n), MAX_BALANCE_MINOR);
  assert.equal(statements.profileRank.get(currency.id, 'max-balance-user', currency.id).users_ahead, 0);
  assert.equal(statements.profileRank.get(currency.id, 'test-user', currency.id).users_ahead, 106);
  transaction(() => changeBalance('profile-level-user', currency.id, 45_000_000_000n));
  assert.equal(statements.getProfilePeak.get('profile-level-user').highest_secrets_minor, 45_000_000_000n);
  transaction(() => changeBalance('profile-level-user', currency.id, -40_000_000_000n));
  assert.equal(getBalance('profile-level-user', currency.id), 5_000_000_000n);
  assert.equal(statements.getProfilePeak.get('profile-level-user').highest_secrets_minor, 45_000_000_000n);
  transaction(() => changeBalance('profile-level-user', currency.id, 45_000_000_000n));
  assert.equal(statements.getProfilePeak.get('profile-level-user').highest_secrets_minor, 50_000_000_000n);
  transaction(() => {
    changeBalance('secrets-take-source', currency.id, 1000n);
    recordTransaction('secrets-take-source', currency.id, 1000n, 'test_credit');
  });
  transaction(() => {
    changeBalance('secrets-take-source', currency.id, -250n);
    recordTransaction('secrets-take-source', currency.id, -250n, 'owner_transfer_out');
    changeBalance('secrets-take-owner', currency.id, 250n);
    recordTransaction('secrets-take-owner', currency.id, 250n, 'owner_transfer_in');
  });
  assert.equal(getBalance('secrets-take-source', currency.id), 750n);
  assert.equal(getBalance('secrets-take-owner', currency.id), 250n);
  statements.addBlacklistedUser.run('blacklisted-user', 'test-owner');
  assert.equal(statements.getBlacklistedUser.get('blacklisted-user').user_id, 'blacklisted-user');
  statements.addBlacklistedUser.run('blacklisted-user', 'test-owner');
  assert.equal(statements.removeBlacklistedUser.run('blacklisted-user').changes, 1);
  assert.equal(statements.getBlacklistedUser.get('blacklisted-user'), undefined);
  statements.setExchangeApprovalChannel.run('guild-test', 'channel-test');
  assert.equal(
    statements.getExchangeApprovalChannel.get('guild-test').exchange_approval_channel_id,
    'channel-test'
  );
  statements.setScamAlertChannel.run('guild-test', 'public-alert-test');
  assert.equal(
    statements.getScamAlertChannel.get('guild-test').scam_alert_channel_id,
    'public-alert-test'
  );
  statements.setAuditLogChannel.run('guild-test', 'audit-log-test');
  assert.equal(
    statements.getAuditLogChannel.get('guild-test').audit_log_channel_id,
    'audit-log-test'
  );
  statements.setShortcut.run('guild-test', 'balance', 'balance');
  statements.setShortcut.run('guild-test', 'balance', 'profile');
  assert.equal(
    statements.listShortcuts.all('guild-test')[0].command_name,
    'profile'
  );
  assert.equal(statements.listShortcuts.all('guild-test').length, 1);
  assert.equal(statements.deleteShortcut.run('guild-test', 'balance').changes, 1);
  assert.equal(statements.listShortcuts.all('guild-test').length, 0);
  assert.equal(statements.getGuildLanguage.get('guild-test'), undefined);
  statements.setGuildLanguage.run('guild-test', 'ar');
  assert.equal(statements.getGuildLanguage.get('guild-test').language, 'ar');
  statements.setGuildLanguage.run('guild-test', 'en');
  assert.equal(statements.getGuildLanguage.get('guild-test').language, 'en');

  assert.throws(() => transaction(() => {
    changeBalance('test-user', currency.id, -2000);
    recordTransaction('test-user', currency.id, -2000, 'test_debit');
  }), /balance change is not possible/);
  assert.equal(getBalance('test-user', currency.id), 1000n);

  assert.throws(() => transaction(() => {
    changeBalance('test-user', currency.id, 500);
    throw new Error('forced rollback');
  }), /forced rollback/);
  assert.equal(getBalance('test-user', currency.id), 1000n);
});

test.after(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
