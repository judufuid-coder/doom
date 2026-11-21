const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roller-test-'));
process.env.DATABASE_PATH = path.join(tempDir, 'test.sqlite');
const { db, statements } = require('../src/db');
const { getRollChancePercent, selectRollPrize, totalRollPoints } = require('../src/roller');
const { buildRollerButtons, rollerSetupMessage } = require('../src/roller-ui');

test('prefix roller panel has Basic and Advanced roll buttons', () => {
  const payload = buildRollerButtons();
  assert.equal(payload.embeds[0].data.title, 'Choose a prize roller');
  assert.deepEqual(payload.components[0].components.map(button => button.data.label), ['Basic', 'Advanced']);
  assert.deepEqual(payload.components[0].components.map(button => button.data.custom_id), [
    'roller:basic',
    'roller:advanced'
  ]);
  assert.match(payload.embeds[0].data.description, /manager must add prizes/i);
  assert.match(rollerSetupMessage('basic'), /\/roller add mode:basic prize:/);
});

test('roller points define weighted prize chances and deterministic selection boundaries', () => {
  const prizes = [
    { prize: 'Small prize', points: 1 },
    { prize: 'Big prize', points: 3 }
  ];

  assert.equal(totalRollPoints(prizes), 4);
  assert.equal(getRollChancePercent(1, 4), 25);
  assert.equal(getRollChancePercent(3, 4), 75);
  assert.equal(selectRollPrize(prizes, () => 0), prizes[0]);
  assert.equal(selectRollPrize(prizes, () => 1), prizes[1]);
  assert.equal(selectRollPrize(prizes, () => 3), prizes[1]);
  assert.throws(() => selectRollPrize([], () => 0), /no prizes configured/);
  assert.throws(() => selectRollPrize(prizes, () => 4), /valid prize/);
  assert.throws(() => totalRollPoints([{ points: 0 }]), /valid points/);
});

test('roller prize records stay separate by server and mode', () => {
  assert.equal(statements.addRollerPrize.run('guild-1', 'basic', 'Small prize', 1, 'admin-1').changes, 1);
  assert.equal(statements.addRollerPrize.run('guild-1', 'basic', 'Big prize', 3, 'admin-1').changes, 1);
  assert.equal(statements.addRollerPrize.run('guild-1', 'advanced', 'Small prize', 2, 'admin-1').changes, 1);
  assert.equal(statements.addRollerPrize.run('guild-2', 'basic', 'Small prize', 4, 'admin-2').changes, 1);
  assert.equal(statements.addRollerPrize.run('guild-1', 'basic', 'SMALL PRIZE', 5, 'admin-1').changes, 0);

  assert.equal(statements.listRollerPrizes.all('guild-1', 'basic').length, 2);
  assert.equal(statements.listRollerPrizes.all('guild-1', 'advanced')[0].points, 2);
  assert.equal(statements.listRollerPrizes.all('guild-2', 'basic')[0].points, 4);
  assert.equal(statements.setRollerPrizePoints.run(8, 'guild-1', 'basic', 'Small prize').changes, 1);
  assert.equal(statements.getRollerPrize.get('guild-1', 'basic', 'SMALL PRIZE').points, 8);
  assert.equal(statements.removeRollerPrize.run('guild-1', 'basic', 'Big prize').changes, 1);
  assert.equal(statements.removeRollerPrize.run('guild-1', 'basic', 'Missing prize').changes, 0);
});

test.after(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
