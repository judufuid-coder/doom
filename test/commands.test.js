const test = require('node:test');
const assert = require('node:assert/strict');
const { ApplicationCommandOptionType } = require('discord.js');
const commands = require('../src/commands');
const { localizeCommandDefinition } = require('../src/localization');

test('slash transfer command only accepts amount in the base currency', () => {
  const transfer = commands.find(command => command.name === 'transfer').toJSON();
  assert.deepEqual(transfer.options.map(option => option.name), ['member', 'amount']);
  assert.equal(transfer.options[1].type, ApplicationCommandOptionType.String);
  assert.equal(transfer.options[1].max_length, 20);
});

test('shop slash commands are not registered', () => {
  assert.equal(commands.some(command => command.name === 'item'), false);
});

test('owner command opens its interactive dashboard', () => {
  const owner = commands.find(command => command.name === 'owner').toJSON();
  assert.deepEqual(owner.options, []);
  assert.equal(owner.dm_permission, false);
});

test('language command is administrator-only and supports English and Arabic', () => {
  const language = commands.find(command => command.name === 'language').toJSON();
  assert.equal(language.default_member_permissions, '8');
  assert.equal(language.dm_permission, false);
  assert.deepEqual(language.options[0].choices.map(({ name, value }) => ({ name, value })), [
    { name: 'English', value: 'en' },
    { name: 'Arabic', value: 'ar' }
  ]);
});

test('slash command descriptions and language choices include Arabic localizations', () => {
  const language = localizeCommandDefinition(
    commands.find(command => command.name === 'language').toJSON()
  );
  assert.equal(language.description_localizations.ar, 'تغيير لغة البوت لهذا الخادم');
  assert.deepEqual(
    language.options[0].choices.map(choice => choice.name_localizations.ar),
    ['الإنجليزية', 'العربية']
  );
});

test('all slash command descriptions have Arabic localizations', () => {
  const containsArabic = text => /[\u0600-\u06FF]/u.test(text);
  const verifyOption = option => {
    assert.ok(containsArabic(option.description_localizations.ar), option.description);
    for (const choice of option.choices || []) {
      assert.ok(containsArabic(choice.name_localizations.ar), choice.name);
    }
    for (const child of option.options || []) verifyOption(child);
  };
  for (const command of commands) {
    const localized = localizeCommandDefinition(command.toJSON());
    assert.ok(containsArabic(localized.description_localizations.ar), localized.description);
    for (const option of localized.options || []) verifyOption(option);
  }
});

test('admin command opens a server-only dashboard and is checked by the bot owner at runtime', () => {
  const admin = commands.find(command => command.name === 'admin').toJSON();
  assert.deepEqual(admin.options, []);
  assert.equal(admin.dm_permission, false);
  assert.equal(admin.default_member_permissions, undefined);
});

test('setup command is administrator-only and accepts an optional text channel', () => {
  const setup = commands.find(command => command.name === 'setup').toJSON();
  assert.equal(setup.default_member_permissions, '8');
  assert.equal(setup.dm_permission, false);
  assert.equal(setup.options[0].name, 'approval_channel');
  assert.equal(setup.options[0].type, 7);
  assert.equal(setup.options[1].name, 'alert_channel');
  assert.equal(setup.options[1].type, 7);
  assert.equal(setup.options.length, 2);
});

test('auditlog command is administrator-only and requires a text channel', () => {
  const auditlog = commands.find(command => command.name === 'auditlog').toJSON();
  assert.equal(auditlog.default_member_permissions, '8');
  assert.equal(auditlog.dm_permission, false);
  assert.equal(auditlog.options[0].name, 'channel');
  assert.equal(auditlog.options[0].type, 7);
  assert.equal(auditlog.options[0].required, true);
});

test('Arabic shortcuts command lets administrators assign aliases to supported commands', () => {
  const shortcuts = commands.find(command => command.name === 'اختصارات').toJSON();
  assert.equal(shortcuts.default_member_permissions, '8');
  assert.deepEqual(shortcuts.options.map(option => option.name), ['add', 'remove', 'list']);
  assert.deepEqual(shortcuts.options[0].options.map(option => option.name), ['trigger', 'command']);
  assert.equal(shortcuts.options[0].options[0].max_length, 100);
  assert.deepEqual(
    shortcuts.options[0].options[1].choices.map(choice => choice.value),
    ['balance', 'profile', 'transfer', 'exchange']
  );
});

test('profile slash command supports an optional member', () => {
  const profile = commands.find(command => command.name === 'profile').toJSON();
  assert.deepEqual(profile.options.map(option => option.name), ['member']);
  assert.equal(profile.dm_permission, false);
});

test('games and community score commands are available in servers', () => {
  const games = commands.find(command => command.name === 'games').toJSON();
  const score = commands.find(command => command.name === 'score').toJSON();
  const leaderboard = commands.find(command => command.name === 'leaderboard').toJSON();
  assert.deepEqual(games.options, []);
  assert.deepEqual(score.options.map(option => option.name), ['member']);
  assert.deepEqual(leaderboard.options, []);
  for (const command of [games, score, leaderboard]) {
    assert.equal(command.dm_permission, false);
  }
});

test('currency grant only accepts a Secrets amount', () => {
  const currency = commands.find(command => command.name === 'currency').toJSON();
  const grant = currency.options.find(option => option.name === 'grant');
  assert.deepEqual(grant.options.map(option => option.name), ['amount']);
  assert.equal(grant.options[0].type, 3);
});

test('giveaway and moderation slash commands serialize as administrator-only guild commands', () => {
  const giveaway = commands.find(command => command.name === 'giveaway').toJSON();
  const moderate = commands.find(command => command.name === 'moderate').toJSON();
  assert.deepEqual(giveaway.options.map(option => option.name), ['create', 'end', 'reroll', 'list']);
  assert.deepEqual(moderate.options.map(option => option.name), [
    'timeout', 'untimeout', 'kick', 'ban', 'unban', 'warn', 'purge', 'role-add', 'role-remove'
  ]);
  for (const command of [giveaway, moderate]) {
    assert.equal(command.default_member_permissions, '8');
    assert.equal(command.dm_permission, false);
  }
});

test('roller slash commands provide separate basic and advanced prize management', () => {
  const roller = commands.find(command => command.name === 'roller').toJSON();
  assert.deepEqual(roller.options.map(option => option.name), ['add', 'points', 'remove', 'list', 'roll']);
  assert.equal(roller.default_member_permissions, undefined);
  assert.equal(roller.dm_permission, false);

  const modes = new Set(['basic', 'advanced']);
  for (const action of roller.options) {
    const mode = action.options.find(option => option.name === 'mode');
    assert.deepEqual(mode.choices.map(choice => choice.value), [...modes]);
  }
  assert.deepEqual(roller.options.find(option => option.name === 'roll').options.map(option => option.name), [
    'mode', 'member'
  ]);
});
