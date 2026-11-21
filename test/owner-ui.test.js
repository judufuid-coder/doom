const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildOwnerHome,
  buildOwnerTakeSecretsModal,
  buildOwnerBlacklistModal,
  buildOwnerServersPage,
  buildOwnerLeaderboardPage
} = require('../src/owner-ui');

test('owner dashboard has buttons for every owner tool', () => {
  const home = buildOwnerHome('owner-1');
  assert.equal(home.embeds[0].data.title, 'Bot owner dashboard');
  assert.deepEqual(
    home.components[0].components.map(button => button.data.label),
    ['Servers', 'Secrets leaderboard', 'Currency admin', 'Take Secrets', 'Blacklist user']
  );
  assert.equal(home.components[1].components[0].data.label, 'Unblacklist user');
  assert.ok(home.components.flatMap(row => row.components).every(button =>
    button.data.custom_id.includes('owner-1')));
});

test('owner tools have forms for taking Secrets and changing blacklist status', () => {
  const takeSecrets = buildOwnerTakeSecretsModal('owner-1').toJSON();
  assert.equal(takeSecrets.custom_id, 'owner-take-secrets:owner-1');
  assert.deepEqual(takeSecrets.components.map(row => row.components[0].custom_id), ['user_id', 'amount']);
  assert.equal(buildOwnerBlacklistModal('owner-1', 'blacklist').toJSON().custom_id, 'owner-blacklist:owner-1');
  assert.equal(buildOwnerBlacklistModal('owner-1', 'unblacklist').toJSON().custom_id, 'owner-unblacklist:owner-1');
  assert.throws(() => buildOwnerBlacklistModal('owner-1', 'invalid'), /invalid/);
});

test('owner server list shows owner and invite and paginates', () => {
  const guilds = Array.from({ length: 25 }, (_, index) => ({
    id: `guild-${index}`,
    name: `Guild ${index}`,
    memberCount: index + 1,
    ownerId: `owner-${index}`,
    ownerName: `Owner ${index}`,
    inviteUrl: `https://discord.gg/invite-${index}`
  }));
  const page = buildOwnerServersPage(guilds.slice(10, 20), guilds.length, 1, 'dashboard-owner');
  assert.match(page.embeds[0].data.title, /25/);
  assert.match(page.embeds[0].data.description, /guild-10/);
  assert.match(page.embeds[0].data.description, /Owner: <@owner-10> \(Owner 10\)/);
  assert.match(page.embeds[0].data.description, /\[Permanent invite\]\(https:\/\/discord\.gg\/invite-10\)/);
  assert.equal(page.components[0].components[0].data.disabled, false);
  assert.equal(page.components[0].components[1].data.disabled, false);
  assert.equal(page.components[1].components[0].data.label, 'Owner dashboard');
  const lastPage = buildOwnerServersPage(guilds.slice(20), guilds.length, 2, 'dashboard-owner');
  assert.equal(lastPage.components[0].components[1].data.disabled, true);
  assert.throws(
    () => buildOwnerServersPage(guilds.slice(20), guilds.length, 3, 'dashboard-owner'),
    /page does not exist/
  );
});

test('owner leaderboard shows total current balances and ranks holders', () => {
  const currency = { id: 1, name: 'Secrets', emoji: '🪙' };
  const result = buildOwnerLeaderboardPage(
    currency,
    { total_minor: 3_500_000n, holder_count: 2n, issued_minor: 7_000_000n },
    [
      { user_id: 'user-1', amount_minor: 2_500_000n },
      { user_id: 'user-2', amount_minor: 1_000_000n }
    ],
    0,
    'owner-1'
  );
  assert.match(result.embeds[0].data.fields[0].value, /3\.5 Secrets/);
  assert.match(result.embeds[0].data.fields[2].value, /7 Secrets/);
  assert.match(result.embeds[0].data.description, /1\. <@user-1> — 2\.5 Secrets/);
  assert.match(result.embeds[0].data.description, /2\. <@user-2> — 1 Secrets/);
  assert.equal(result.components[0].components[0].data.label, 'Owner dashboard');
  assert.deepEqual(result.allowedMentions, { parse: [] });
});
