const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'currency-bot-migration-test-'));
const databasePath = path.join(tempDir, 'legacy.sqlite');
const legacyDb = new DatabaseSync(databasePath);
legacyDb.exec(`
  CREATE TABLE currencies (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    price_micros INTEGER NOT NULL,
    emoji TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL
  );
  CREATE TABLE balances (
    user_id TEXT NOT NULL,
    currency_id INTEGER NOT NULL REFERENCES currencies(id),
    amount_minor INTEGER NOT NULL,
    PRIMARY KEY (user_id, currency_id)
  );
  CREATE TABLE items (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    price_minor INTEGER NOT NULL,
    currency_id INTEGER NOT NULL REFERENCES currencies(id),
    emoji TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL
  );
  CREATE TABLE exchange_requests (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    requester_id TEXT NOT NULL,
    from_currency_id INTEGER NOT NULL REFERENCES currencies(id),
    to_currency_id INTEGER NOT NULL REFERENCES currencies(id),
    source_minor INTEGER NOT NULL,
    target_minor INTEGER NOT NULL,
    from_price_micros INTEGER NOT NULL,
    to_price_micros INTEGER NOT NULL,
    status TEXT NOT NULL,
    reviewer_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY,
    user_id TEXT NOT NULL,
    currency_id INTEGER NOT NULL REFERENCES currencies(id),
    amount_minor INTEGER NOT NULL,
    kind TEXT NOT NULL,
    related_user_id TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE guild_shortcuts (
    guild_id TEXT NOT NULL,
    trigger TEXT NOT NULL,
    response TEXT NOT NULL,
    PRIMARY KEY (guild_id, trigger)
  );
  INSERT INTO guild_shortcuts (guild_id, trigger, response)
  VALUES ('guild-1', 'help', 'Use /help');
  INSERT INTO currencies (id, name, price_micros, emoji, created_by)
  VALUES (1, 'Coins', 1000000, '🪙', 'system');
  INSERT INTO balances (user_id, currency_id, amount_minor) VALUES ('member-1', 1, 1250);
  INSERT INTO items (id, name, price_minor, currency_id, emoji, created_by)
  VALUES (1, 'Legacy item', 250, 1, '⭐', 'system');
  INSERT INTO exchange_requests
    (id, guild_id, requester_id, from_currency_id, to_currency_id, source_minor,
     target_minor, from_price_micros, to_price_micros, status)
  VALUES ('legacy-request', 'guild-1', 'member-1', 1, 1, 1250, 2500, 1000000, 2000000, 'pending');
  INSERT INTO transactions (user_id, currency_id, amount_minor, kind)
  VALUES ('member-1', 1, 1250, 'legacy_credit');
`);
legacyDb.close();

process.env.DATABASE_PATH = databasePath;
const { db, BASE_CURRENCY_NAME, statements, getBalance } = require('../src/db');

test('legacy database migrates currencies and keeps prior message shortcuts', () => {
  const currency = statements.getCurrency.get(BASE_CURRENCY_NAME);
  assert.ok(currency);
  assert.equal(currency.id, 1);
  assert.equal(getBalance('member-1', currency.id), 12_500_000n);
  assert.equal(db.prepare('SELECT price_minor FROM items WHERE id = 1').get().price_minor, 2_500_000);
  const request = db.prepare('SELECT source_minor, target_minor FROM exchange_requests WHERE id = ?').get('legacy-request');
  assert.equal(request.source_minor, 12_500_000);
  assert.equal(request.target_minor, 25_000_000);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);
  assert.equal(db.prepare('SELECT kind FROM transactions WHERE user_id = ?').get('member-1').kind, 'legacy_credit');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM currencies WHERE name = ? COLLATE NOCASE').get('Coins').count, 0);
  assert.equal(statements.listShortcuts.all('guild-1')[0].response, 'Use /help');
  assert.equal(statements.listShortcuts.all('guild-1')[0].command_name, '');
});

test.after(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
