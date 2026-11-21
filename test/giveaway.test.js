const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'giveaway-test-'));
process.env.DATABASE_PATH = path.join(tempDir, 'test.sqlite');
const { db, statements } = require('../src/db');
const {
  chooseGiveawayWinners,
  endGiveawayRecord,
  parseGiveawayDuration,
  rerollGiveawayRecord
} = require('../src/giveaway');
const {
  buildGiveawaySetupButton,
  buildGiveawaySetupModal,
  normalizeGiveawayEmoji
} = require('../src/giveaway-ui');
const { parseTimeoutDuration } = require('../src/moderation');

test('giveaway and timeout durations enforce their supported bounds', () => {
  assert.equal(parseGiveawayDuration('1m'), 60_000);
  assert.equal(parseGiveawayDuration('90d'), 90 * 24 * 60 * 60 * 1000);
  assert.throws(() => parseGiveawayDuration('30s'), /minutes, hours, or days/);
  assert.throws(() => parseGiveawayDuration('0m'), /1 minute to 90 days/);
  assert.throws(() => parseGiveawayDuration('91d'), /1 minute to 90 days/);
  assert.equal(parseTimeoutDuration('28d'), 28 * 24 * 60 * 60 * 1000);
  assert.throws(() => parseTimeoutDuration('29d'), /1 minute to 28 days/);
});

test('giveaway setup has a private modal and normalizes custom emoji mentions', () => {
  const button = buildGiveawaySetupButton('admin-1');
  assert.equal(button.components[0].components[0].data.custom_id, 'giveaway-setup:admin-1');

  const modal = buildGiveawaySetupModal('admin-1', 'guild-1', 'channel-1').toJSON();
  assert.equal(modal.custom_id, 'giveaway-create:admin-1:guild-1:channel-1');
  assert.equal(modal.components.length, 4);
  assert.equal(normalizeGiveawayEmoji('🎉'), '🎉');
  assert.equal(normalizeGiveawayEmoji('<a:dance:123456789012345678>'), '123456789012345678');
  assert.throws(() => normalizeGiveawayEmoji(''), /valid Unicode emoji/);
});

test('giveaway winner selection is unique and rerolls exclude previous winners', () => {
  const winners = chooseGiveawayWinners(['one', 'two', 'three'], 2);
  assert.equal(winners.length, 2);
  assert.equal(new Set(winners).size, 2);
  const rerolled = chooseGiveawayWinners(['one', 'two', 'three'], 1, winners);
  assert.equal(rerolled.length, 1);
  assert.equal(winners.includes(rerolled[0]), false);
});

test('ending and rerolling a giveaway persist unique winners', () => {
  const giveawayId = 'giveaway-test-id';
  statements.insertGiveaway.run(
    giveawayId,
    'guild-test',
    'channel-test',
    'message-test',
    'Test prize',
    1,
    new Date(Date.now() + 60_000).toISOString(),
    '🎉',
    'admin-test'
  );
  for (const userId of ['entrant-1', 'entrant-2', 'entrant-3']) {
    statements.addGiveawayEntry.run(giveawayId, userId);
  }

  const result = endGiveawayRecord('guild-test', giveawayId, true);
  assert.equal(result.winners.length, 1);
  assert.equal(statements.getGiveaway.get(giveawayId, 'guild-test').status, 'ended');

  const reroll = rerollGiveawayRecord('guild-test', giveawayId);
  assert.notEqual(reroll.winner, result.winners[0]);
  assert.equal(reroll.winners.length, 2);
  assert.throws(() => rerollGiveawayRecord('other-guild', giveawayId), /not found/);
});

test.after(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
