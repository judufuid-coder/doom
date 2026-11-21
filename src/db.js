const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { MAX_MINOR: MAX_SAFE_MINOR, MAX_BALANCE_MINOR } = require('./money');
const BASE_CURRENCY_NAME = 'Secrets';
const databasePath = process.env.DATABASE_PATH || './data/currency.sqlite';
const resolvedDatabasePath = path.resolve(databasePath);
fs.mkdirSync(path.dirname(resolvedDatabasePath), { recursive: true });

const db = new DatabaseSync(resolvedDatabasePath);
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');

function prepareBigIntStatement(sql) {
  const statement = db.prepare(sql);
  statement.setReadBigInts(true);
  return statement;
}

const amountScaleMigration = 1;
const currentDatabaseVersion = db.prepare('PRAGMA user_version').get().user_version;
db.exec(`
  CREATE TABLE IF NOT EXISTS currencies (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    price_micros INTEGER NOT NULL CHECK (price_micros > 0),
    emoji TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_by TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS balances (
    user_id TEXT NOT NULL,
    currency_id INTEGER NOT NULL REFERENCES currencies(id),
    amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
    PRIMARY KEY (user_id, currency_id)
  );
  CREATE TABLE IF NOT EXISTS profile_progress (
    user_id TEXT PRIMARY KEY,
    highest_secrets_minor INTEGER NOT NULL CHECK (highest_secrets_minor >= 0)
  );
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    price_minor INTEGER NOT NULL CHECK (price_minor > 0),
    currency_id INTEGER NOT NULL REFERENCES currencies(id),
    emoji TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_by TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS exchange_requests (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    requester_id TEXT NOT NULL,
    from_currency_id INTEGER NOT NULL REFERENCES currencies(id),
    to_currency_id INTEGER NOT NULL REFERENCES currencies(id),
    source_minor INTEGER NOT NULL CHECK (source_minor > 0),
    target_minor INTEGER NOT NULL CHECK (target_minor > 0),
    from_price_micros INTEGER NOT NULL,
    to_price_micros INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewer_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY,
    user_id TEXT NOT NULL,
    currency_id INTEGER NOT NULL REFERENCES currencies(id),
    amount_minor INTEGER NOT NULL,
    kind TEXT NOT NULL,
    related_user_id TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    exchange_approval_channel_id TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS guild_scam_settings (
    guild_id TEXT PRIMARY KEY,
    scam_alert_channel_id TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS guild_audit_settings (
    guild_id TEXT PRIMARY KEY,
    audit_log_channel_id TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS guild_shortcuts (
    guild_id TEXT NOT NULL,
    trigger TEXT NOT NULL,
    response TEXT NOT NULL DEFAULT '',
    command_name TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (guild_id, trigger)
  );
  CREATE TABLE IF NOT EXISTS guild_languages (
    guild_id TEXT PRIMARY KEY,
    language TEXT NOT NULL CHECK (language IN ('en', 'ar'))
  );
  CREATE TABLE IF NOT EXISTS user_blacklist (
    user_id TEXT PRIMARY KEY,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS giveaways (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL UNIQUE,
    prize TEXT NOT NULL,
    winner_count INTEGER NOT NULL CHECK (winner_count > 0),
    ends_at TEXT NOT NULL,
    entry_emoji TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'ended')),
    winner_ids TEXT NOT NULL DEFAULT '[]',
    created_by TEXT NOT NULL,
    ended_at TEXT
  );
  CREATE TABLE IF NOT EXISTS roller_prizes (
    id INTEGER PRIMARY KEY,
    guild_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('basic', 'advanced')),
    prize TEXT NOT NULL COLLATE NOCASE,
    points INTEGER NOT NULL CHECK (points > 0 AND points <= 1000000),
    created_by TEXT NOT NULL,
    UNIQUE (guild_id, mode, prize)
  );
  CREATE TABLE IF NOT EXISTS giveaway_entries (
    giveaway_id TEXT NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    PRIMARY KEY (giveaway_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS community_scores (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0),
    points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS ticket_claims (
    channel_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    prompt_message_id TEXT,
    claimed_by TEXT,
    claimed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_transactions_user_created
    ON transactions(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_community_scores_leaderboard
    ON community_scores(guild_id, points DESC, message_count DESC);
`);

const shortcutColumns = db.prepare('PRAGMA table_info(guild_shortcuts)').all();
if (!shortcutColumns.some(column => column.name === 'command_name')) {
  db.exec("ALTER TABLE guild_shortcuts ADD COLUMN command_name TEXT NOT NULL DEFAULT ''");
}

if (currentDatabaseVersion < amountScaleMigration) {
    const maximumLegacyAmount = Math.floor(MAX_SAFE_MINOR / 10_000);
    const amountColumns = [
      ['balances', 'amount_minor'],
      ['items', 'price_minor'],
      ['exchange_requests', 'source_minor'],
      ['exchange_requests', 'target_minor'],
      ['transactions', 'amount_minor']
    ];
    for (const [table, column] of amountColumns) {
      const unsafe = db.prepare(`SELECT 1 AS found FROM ${table} WHERE ${column} > ? OR ${column} < ? LIMIT 1`)
        .get(maximumLegacyAmount, -maximumLegacyAmount);
      if (unsafe) {
        throw new Error(`Cannot migrate ${table}.${column} to six-decimal amounts because an existing value exceeds the safe storage limit.`);
      }
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const [table, column] of amountColumns) {
        db.exec(`UPDATE ${table} SET ${column} = ${column} * 10000`);
      }
      db.exec(`PRAGMA user_version = ${amountScaleMigration}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
}

const legacyBaseCurrency = db.prepare('SELECT id FROM currencies WHERE name = ? COLLATE NOCASE').get('Coins');
const existingBaseCurrency = db.prepare('SELECT id FROM currencies WHERE name = ? COLLATE NOCASE').get(BASE_CURRENCY_NAME);
if (legacyBaseCurrency && existingBaseCurrency && legacyBaseCurrency.id !== existingBaseCurrency.id) {
  throw new Error('Cannot migrate the base currency from Coins to Secrets because a separate Secrets currency already exists.');
}
if (legacyBaseCurrency) {
  db.prepare('UPDATE currencies SET name = ? WHERE id = ?').run(BASE_CURRENCY_NAME, legacyBaseCurrency.id);
} else if (!existingBaseCurrency) {
  db.prepare(`
    INSERT INTO currencies (name, price_micros, emoji, created_by)
    VALUES (?, 1000000, '🪙', 'system')
  `).run(BASE_CURRENCY_NAME);
}
db.prepare('UPDATE currencies SET price_micros = 1000000, active = 1 WHERE name = ? COLLATE NOCASE')
  .run(BASE_CURRENCY_NAME);
db.prepare(`
  INSERT INTO profile_progress (user_id, highest_secrets_minor)
  SELECT user_id, amount_minor FROM balances
  WHERE currency_id = (SELECT id FROM currencies WHERE name = ? COLLATE NOCASE)
  ON CONFLICT(user_id) DO UPDATE SET highest_secrets_minor =
    MAX(profile_progress.highest_secrets_minor, excluded.highest_secrets_minor)
`).run(BASE_CURRENCY_NAME);

const statements = {
  getCurrency: db.prepare('SELECT * FROM currencies WHERE name = ? COLLATE NOCASE AND active = 1'),
  getCurrencyAny: db.prepare('SELECT * FROM currencies WHERE name = ? COLLATE NOCASE'),
  listCurrencies: db.prepare('SELECT * FROM currencies WHERE active = 1 ORDER BY name COLLATE NOCASE'),
  insertCurrency: db.prepare(`
    INSERT INTO currencies (name, price_micros, emoji, created_by) VALUES (?, ?, ?, ?)
  `),
  reactivateCurrency: db.prepare(`
    UPDATE currencies SET price_micros = ?, emoji = ?, active = 1, created_by = ? WHERE id = ?
  `),
  setCurrencyPrice: db.prepare('UPDATE currencies SET price_micros = ? WHERE id = ? AND active = 1'),
  deactivateCurrency: db.prepare('UPDATE currencies SET active = 0 WHERE id = ? AND active = 1'),
  getBalance: prepareBigIntStatement('SELECT amount_minor FROM balances WHERE user_id = ? AND currency_id = ?'),
  getProfilePeak: prepareBigIntStatement('SELECT highest_secrets_minor FROM profile_progress WHERE user_id = ?'),
  recordProfilePeak: db.prepare(`
    INSERT INTO profile_progress (user_id, highest_secrets_minor) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET highest_secrets_minor =
      MAX(profile_progress.highest_secrets_minor, excluded.highest_secrets_minor)
  `),
  getBaseCurrencyId: db.prepare('SELECT id FROM currencies WHERE name = ? COLLATE NOCASE'),
  setBalance: db.prepare(`
    INSERT INTO balances (user_id, currency_id, amount_minor) VALUES (?, ?, ?)
    ON CONFLICT(user_id, currency_id) DO UPDATE SET amount_minor = excluded.amount_minor
  `),
  insertTransaction: db.prepare(`
    INSERT INTO transactions (user_id, currency_id, amount_minor, kind, related_user_id, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  insertItem: db.prepare(`
    INSERT INTO items (name, price_minor, currency_id, emoji, created_by) VALUES (?, ?, ?, ?, ?)
  `),
  getItemAny: db.prepare('SELECT * FROM items WHERE name = ? COLLATE NOCASE'),
  reactivateItem: db.prepare(`
    UPDATE items SET price_minor = ?, currency_id = ?, emoji = ?, active = 1, created_by = ? WHERE id = ?
  `),
  getItem: db.prepare(`
    SELECT items.*, currencies.name AS currency_name, currencies.emoji AS currency_emoji
    FROM items JOIN currencies ON currencies.id = items.currency_id
    WHERE items.name = ? COLLATE NOCASE AND items.active = 1 AND currencies.active = 1
  `),
  listItems: db.prepare(`
    SELECT items.*, currencies.name AS currency_name, currencies.emoji AS currency_emoji
    FROM items JOIN currencies ON currencies.id = items.currency_id
    WHERE items.active = 1 AND currencies.active = 1
    ORDER BY items.name COLLATE NOCASE
  `),
  insertRequest: db.prepare(`
    INSERT INTO exchange_requests
      (id, guild_id, requester_id, from_currency_id, to_currency_id,
       source_minor, target_minor, from_price_micros, to_price_micros, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `),
  getRequest: db.prepare('SELECT * FROM exchange_requests WHERE id = ?'),
  getExchangeApprovalChannel: db.prepare('SELECT exchange_approval_channel_id FROM guild_settings WHERE guild_id = ?'),
  setExchangeApprovalChannel: db.prepare(`
    INSERT INTO guild_settings (guild_id, exchange_approval_channel_id) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET exchange_approval_channel_id = excluded.exchange_approval_channel_id
  `),
  getScamAlertChannel: db.prepare(`
    SELECT scam_alert_channel_id FROM guild_scam_settings WHERE guild_id = ?
  `),
  getAuditLogChannel: db.prepare(`
    SELECT audit_log_channel_id FROM guild_audit_settings WHERE guild_id = ?
  `),
  getGuildLanguage: db.prepare('SELECT language FROM guild_languages WHERE guild_id = ?'),
  setGuildLanguage: db.prepare(`
    INSERT INTO guild_languages (guild_id, language) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET language = excluded.language
  `),
  setScamAlertChannel: db.prepare(`
    INSERT INTO guild_scam_settings (guild_id, scam_alert_channel_id) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET scam_alert_channel_id = excluded.scam_alert_channel_id
  `),
  setAuditLogChannel: db.prepare(`
    INSERT INTO guild_audit_settings (guild_id, audit_log_channel_id) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET audit_log_channel_id = excluded.audit_log_channel_id
  `),
  listShortcuts: db.prepare('SELECT trigger, command_name, response FROM guild_shortcuts WHERE guild_id = ? ORDER BY trigger COLLATE NOCASE'),
  setShortcut: db.prepare(`
    INSERT INTO guild_shortcuts (guild_id, trigger, command_name, response) VALUES (?, ?, ?, '')
    ON CONFLICT(guild_id, trigger) DO UPDATE SET command_name = excluded.command_name, response = ''
  `),
  deleteShortcut: db.prepare('DELETE FROM guild_shortcuts WHERE guild_id = ? AND trigger = ?'),
  insertGiveaway: db.prepare(`
    INSERT INTO giveaways
      (id, guild_id, channel_id, message_id, prize, winner_count, ends_at, entry_emoji, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `),
  deleteGiveaway: db.prepare('DELETE FROM giveaways WHERE id = ? AND guild_id = ?'),
  getGiveaway: db.prepare('SELECT * FROM giveaways WHERE id = ? AND guild_id = ?'),
  getGiveawayByMessage: db.prepare('SELECT * FROM giveaways WHERE message_id = ? AND status = ?'),
  listActiveGiveaways: db.prepare(`
    SELECT * FROM giveaways WHERE guild_id = ? AND status = 'active' ORDER BY ends_at
  `),
  listDueGiveaways: db.prepare(`
    SELECT id, guild_id FROM giveaways WHERE status = 'active' AND ends_at <= ?
  `),
  addRollerPrize: db.prepare(`
    INSERT INTO roller_prizes (guild_id, mode, prize, points, created_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, mode, prize) DO NOTHING
  `),
  getRollerPrize: db.prepare(`
    SELECT * FROM roller_prizes WHERE guild_id = ? AND mode = ? AND prize = ? COLLATE NOCASE
  `),
  removeRollerPrize: db.prepare(`
    DELETE FROM roller_prizes WHERE guild_id = ? AND mode = ? AND prize = ? COLLATE NOCASE
  `),
  setRollerPrizePoints: db.prepare(`
    UPDATE roller_prizes SET points = ? WHERE guild_id = ? AND mode = ? AND prize = ? COLLATE NOCASE
  `),
  listRollerPrizes: db.prepare(`
    SELECT prize, points FROM roller_prizes
    WHERE guild_id = ? AND mode = ?
    ORDER BY prize COLLATE NOCASE
  `),
  addGiveawayEntry: db.prepare('INSERT OR IGNORE INTO giveaway_entries (giveaway_id, user_id) VALUES (?, ?)'),
  removeGiveawayEntry: db.prepare('DELETE FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?'),
  removeUserGiveawayEntries: db.prepare('DELETE FROM giveaway_entries WHERE user_id = ?'),
  listGiveawayEntries: db.prepare('SELECT user_id FROM giveaway_entries WHERE giveaway_id = ? ORDER BY user_id'),
  finishGiveaway: db.prepare(`
    UPDATE giveaways SET status = 'ended', winner_ids = ?, ended_at = CURRENT_TIMESTAMP
    WHERE id = ? AND guild_id = ? AND status = 'active'
  `),
  updateGiveawayWinners: db.prepare(`
    UPDATE giveaways SET winner_ids = ? WHERE id = ? AND guild_id = ? AND status = 'ended'
  `),
  finishRequest: db.prepare(`
    UPDATE exchange_requests SET status = ?, reviewer_id = ?
    WHERE id = ? AND status = 'pending'
  `),
  countOutstandingCurrency: db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM balances WHERE currency_id = ? AND amount_minor > 0) +
      (SELECT COUNT(*) FROM exchange_requests
       WHERE status = 'pending' AND (from_currency_id = ? OR to_currency_id = ?)) AS count
  `),
  ownerCurrencyBalances: prepareBigIntStatement(`
    SELECT amount_minor
    FROM balances
    WHERE currency_id = ? AND amount_minor > 0
  `),
  ownerCurrencyLeaderboard: prepareBigIntStatement(`
    SELECT user_id, amount_minor
    FROM balances
    WHERE currency_id = ? AND amount_minor > 0
    ORDER BY amount_minor DESC, user_id ASC
    LIMIT 100
  `),
  profileRank: db.prepare(`
    SELECT COUNT(*) AS users_ahead
    FROM balances
    WHERE currency_id = ? AND amount_minor > 0
      AND amount_minor > (
        SELECT COALESCE(amount_minor, 0)
        FROM balances
        WHERE user_id = ? AND currency_id = ?
      )
  `),
  getBlacklistedUser: db.prepare('SELECT user_id FROM user_blacklist WHERE user_id = ?'),
  addBlacklistedUser: db.prepare(`
    INSERT INTO user_blacklist (user_id, created_by) VALUES (?, ?)
    ON CONFLICT(user_id) DO NOTHING
  `),
  removeBlacklistedUser: db.prepare('DELETE FROM user_blacklist WHERE user_id = ?'),
  ownerIssuedCurrencyTransactions: prepareBigIntStatement(`
    SELECT amount_minor
    FROM transactions
    WHERE currency_id = ? AND kind = 'admin_grant' AND amount_minor > 0
  `),
  recordCommunityMessage: db.prepare(`
    INSERT INTO community_scores (guild_id, user_id, message_count, points)
    VALUES (?, ?, 1, 0)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      points = points + CASE WHEN (message_count + 1) % 20 = 0 THEN 1 ELSE 0 END,
      message_count = message_count + 1
  `),
  getCommunityScore: db.prepare(`
    SELECT message_count, points FROM community_scores WHERE guild_id = ? AND user_id = ?
  `),
  communityLeaderboard: db.prepare(`
    SELECT user_id, message_count, points
    FROM community_scores
    WHERE guild_id = ?
    ORDER BY points DESC, message_count DESC, user_id ASC
    LIMIT 10
  `),
  addCommunityPoints: db.prepare(`
    INSERT INTO community_scores (guild_id, user_id, message_count, points)
    VALUES (?, ?, 0, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET points = points + excluded.points
  `),
  registerTicket: db.prepare(`
    INSERT OR IGNORE INTO ticket_claims (channel_id, guild_id) VALUES (?, ?)
  `),
  getTicket: db.prepare('SELECT * FROM ticket_claims WHERE channel_id = ? AND guild_id = ?'),
  setTicketPrompt: db.prepare(`
    UPDATE ticket_claims SET prompt_message_id = ? WHERE channel_id = ? AND guild_id = ?
  `),
  claimTicket: db.prepare(`
    UPDATE ticket_claims SET claimed_by = ?, claimed_at = CURRENT_TIMESTAMP
    WHERE channel_id = ? AND guild_id = ? AND claimed_by IS NULL
  `)
};

function getBalance(userId, currencyId) {
  return statements.getBalance.get(userId, currencyId)?.amount_minor || 0n;
}

function transaction(callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function changeBalance(userId, currencyId, deltaMinor) {
  const delta = typeof deltaMinor === 'bigint'
    ? deltaMinor
    : Number.isSafeInteger(deltaMinor) ? BigInt(deltaMinor) : null;
  if (delta === null) {
    throw new Error('That balance change is not possible. Check the available balance and amount.');
  }
  const updated = getBalance(userId, currencyId) + delta;
  if (updated < 0n || updated > MAX_BALANCE_MINOR) {
    throw new Error('That balance change is not possible. Check the available balance and amount.');
  }
  statements.setBalance.run(userId, currencyId, updated);
  const baseCurrencyId = statements.getBaseCurrencyId.get(BASE_CURRENCY_NAME)?.id;
  if (currencyId === baseCurrencyId) statements.recordProfilePeak.run(userId, updated);
  return updated;
}

function recordTransaction(userId, currencyId, amountMinor, kind, relatedUserId = null, note = null) {
  statements.insertTransaction.run(userId, currencyId, amountMinor, kind, relatedUserId, note);
}

function recordCommunityMessage(guildId, userId) {
  statements.recordCommunityMessage.run(guildId, userId);
  return statements.getCommunityScore.get(guildId, userId);
}

module.exports = {
  db,
  MAX_BALANCE_MINOR,
  BASE_CURRENCY_NAME,
  statements,
  getBalance,
  changeBalance,
  recordTransaction,
  recordCommunityMessage,
  transaction
};
