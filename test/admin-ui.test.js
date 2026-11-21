const test = require('node:test');
const assert = require('node:assert/strict');
const commands = require('../src/commands');
const { ADMIN_COMMANDS, buildAdminDashboard, getAdminCommand } = require('../src/admin-ui');

test('admin dashboard has a button for every slash command, slash subcommand, and prefix command', () => {
  const expectedSlashActions = commands.flatMap(command => {
    const data = command.toJSON();
    const subcommands = data.options?.filter(option => option.type === 1) || [];
    return subcommands.length
      ? subcommands.map(subcommand => `/${data.name} ${subcommand.name}`)
      : [`/${data.name}`];
  });
  const labels = ADMIN_COMMANDS.map(command => command.label);
  for (const action of expectedSlashActions) assert.ok(labels.includes(action), `${action} has a button`);
  for (const name of ['!help', '!up', '!تشهير', '!b', '!ex', '!roller', '!ai', '!admin']) {
    assert.ok(labels.includes(name), `${name} has a button`);
  }
  assert.equal(new Set(ADMIN_COMMANDS.map(command => command.key)).size, ADMIN_COMMANDS.length);
});

test('admin dashboard paginates with requester-bound buttons', () => {
  const firstPage = buildAdminDashboard('12345678901234567', 0);
  const prefixPage = buildAdminDashboard(
    '12345678901234567',
    Math.floor(commands.flatMap(command => {
      const data = command.toJSON();
      const subcommands = data.options?.filter(option => option.type === 1) || [];
      return subcommands.length ? subcommands : [data];
    }).length / 20),
    '?'
  );
  assert.equal(firstPage.embeds[0].data.title, 'Bot admin command dashboard');
  assert.ok(firstPage.components.flatMap(row => row.components).every(button =>
    button.data.custom_id.includes(':12345678901234567:')
  ));
  assert.ok(prefixPage.components.flatMap(row => row.components).some(button =>
    button.data.label.startsWith('?')
  ));

  const pageCount = Math.ceil(ADMIN_COMMANDS.length / 20);
  assert.ok(pageCount > 1);
  assert.throws(() => buildAdminDashboard('12345678901234567', pageCount), /page does not exist/);
});

test('dashboard command lookups reject unknown actions', () => {
  assert.equal(getAdminCommand('slash-help').commandName, 'help');
  assert.equal(getAdminCommand('slash-moderate-ban').subcommand, 'ban');
  assert.equal(getAdminCommand('unknown-command'), undefined);
});
