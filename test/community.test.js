const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'currency-bot-community-test-'));
process.env.DATABASE_PATH = path.join(tempDir, 'community.sqlite');
const { db, statements, recordCommunityMessage, transaction } = require('../src/db');
const { isTicketChannel, resolveGameResult } = require('../src/community');

test('message scores award one point for each complete 20-message milestone', () => {
  for (let messageNumber = 1; messageNumber <= 20; messageNumber++) {
    recordCommunityMessage('guild-1', 'member-1');
  }
  let score = statements.getCommunityScore.get('guild-1', 'member-1');
  assert.equal(score.message_count, 20);
  assert.equal(score.points, 1);

  for (let messageNumber = 21; messageNumber <= 40; messageNumber++) {
    recordCommunityMessage('guild-1', 'member-1');
  }
  score = statements.getCommunityScore.get('guild-1', 'member-1');
  assert.equal(score.message_count, 40);
  assert.equal(score.points, 2);
  assert.equal(statements.getCommunityScore.get('guild-2', 'member-1'), undefined);
});

test('ticket claims are one-time and a successful claim can award one point', () => {
  statements.registerTicket.run('ticket-channel', 'guild-1');
  const firstClaim = transaction(() => {
    const result = statements.claimTicket.run('admin-1', 'ticket-channel', 'guild-1');
    if (result.changes) statements.addCommunityPoints.run('guild-1', 'admin-1', 1);
    return result.changes;
  });
  const duplicateClaim = statements.claimTicket.run('admin-2', 'ticket-channel', 'guild-1');

  assert.equal(firstClaim, 1);
  assert.equal(duplicateClaim.changes, 0);
  assert.equal(statements.getTicket.get('ticket-channel', 'guild-1').claimed_by, 'admin-1');
  assert.equal(statements.getCommunityScore.get('guild-1', 'admin-1').points, 1);
  assert.equal(statements.getCommunityScore.get('guild-1', 'admin-2'), undefined);
});

test('ticket detection recognizes channel and parent category names', () => {
  assert.equal(isTicketChannel({ name: 'ticket-alex', parent: null }), true);
  assert.equal(isTicketChannel({ name: 'alex-123', parent: { name: 'Tickets' } }), true);
  assert.equal(isTicketChannel({ name: 'alex-123', parent: { name: 'Support Tickets' } }), true);
  assert.equal(isTicketChannel({ name: 'general-chat', parent: { name: 'Community' } }), false);
});

test('mini games determine wins, losses, and ties correctly', () => {
  assert.equal(resolveGameResult('rps', 'rock', 'scissors'), 'win');
  assert.equal(resolveGameResult('rps', 'rock', 'paper'), 'loss');
  assert.equal(resolveGameResult('rps', 'paper', 'paper'), 'tie');
  assert.equal(resolveGameResult('coinflip', 'heads', 'heads'), 'win');
  assert.equal(resolveGameResult('coinflip', 'tails', 'heads'), 'loss');
  assert.throws(() => resolveGameResult('rps', 'heads', 'tails'), /not valid/);
});

test.after(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
