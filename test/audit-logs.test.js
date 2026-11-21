const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAuditLogEmbed,
  findRecentAuditLogEntry,
  auditExecutorFields
} = require('../src/audit-logs');

test('audit log embed includes a timestamp and details without allowing mentions', () => {
  const embed = buildAuditLogEmbed('Member left', 'A member left the server.', [
    { name: 'Username', value: 'example-user' },
    { name: 'User ID', value: '123456789012345678' }
  ]);
  const payload = {
    embeds: [embed],
    allowedMentions: { parse: [] }
  };
  const data = payload.embeds[0].toJSON();

  assert.equal(data.title, 'Member left');
  assert.equal(data.description, 'A member left the server.');
  assert.equal(data.fields[0].value, 'example-user');
  assert.equal(data.fields[1].value, '123456789012345678');
  assert.ok(data.timestamp);
  assert.deepEqual(payload.allowedMentions, { parse: [] });
});

test('audit log embed limits fields to Discord limits', () => {
  const embed = buildAuditLogEmbed(
    'Role updated',
    'A role changed.',
    Array.from({ length: 30 }, (_, index) => ({
      name: `Field ${index}`,
      value: 'x'.repeat(1100)
    }))
  ).toJSON();

  assert.equal(embed.fields.length, 25);
  assert.equal(embed.fields[0].value.length, 1024);
});

test('audit log actor lookup matches the action, target, and recent timestamp', () => {
  const entries = new Map([
    ['wrong-target', {
      action: 10,
      targetId: 'other-channel',
      createdTimestamp: 10_000
    }],
    ['old', {
      action: 10,
      targetId: 'channel-1',
      createdTimestamp: 1_000
    }],
    ['matching', {
      action: 10,
      targetId: 'channel-1',
      createdTimestamp: 40_500,
      executorId: 'user-1',
      executor: { id: 'user-1', username: 'ChannelMaker' },
      reason: 'Requested by staff'
    }]
  ]);
  const entry = findRecentAuditLogEntry(entries, {
    types: [10, 11],
    targetId: 'channel-1',
    eventTimestamp: 40_000,
    now: 41_000
  });

  assert.equal(entry.executor.username, 'ChannelMaker');
  assert.deepEqual(auditExecutorFields(entry, 'Created by'), [
    { name: 'Created by', value: 'ChannelMaker' },
    { name: 'Executor user ID', value: 'user-1' },
    { name: 'Audit log reason', value: 'Requested by staff' }
  ]);
});

test('audit log lookup retries briefly while Discord publishes the matching entry', async () => {
  let fetchCount = 0;
  const expectedEntry = {
    action: 10,
    targetId: 'channel-1',
    createdTimestamp: 50_000
  };
  const guild = {
    async fetchAuditLogs() {
      fetchCount++;
      return { entries: new Map(fetchCount === 1 ? [] : [['entry', expectedEntry]]) };
    }
  };

  const { findRecentAuditLogEntryForEvent } = require('../src/audit-logs');
  const entry = await findRecentAuditLogEntryForEvent(guild, {
    types: 10,
    targetId: 'channel-1',
    eventTimestamp: 50_000,
    now: 50_000
  }, { maxAttempts: 2, retryDelayMs: 0 });

  assert.equal(fetchCount, 2);
  assert.equal(entry, expectedEntry);
});

test('audit log actor lookup ignores future and unrelated entries', () => {
  const entries = new Map([
    ['future', { action: 10, targetId: 'channel-1', createdTimestamp: 50_000 }],
    ['other-action', { action: 12, targetId: 'channel-1', createdTimestamp: 9_500 }]
  ]);

  assert.equal(findRecentAuditLogEntry(entries, {
    types: 10,
    targetId: 'channel-1',
    eventTimestamp: 9_000,
    now: 10_000
  }), null);
});
