const test = require('node:test');
const assert = require('node:assert/strict');
const { HELP_SECTIONS, buildHelpHome, buildHelpSection } = require('../src/help-ui');

test('help home introduces the complete command guide and links every section', () => {
  const help = buildHelpHome('member-1', '!');
  assert.equal(help.embeds[0].data.title, 'All bot commands are here');
  assert.match(help.embeds[0].data.description, /!help/);
  assert.match(help.embeds[0].data.description, /\/setup/);
  const sectionButtons = help.components.slice(0, -1).flatMap(row => row.components);
  assert.equal(sectionButtons.length, HELP_SECTIONS.length);
  assert.deepEqual(
    sectionButtons.map(button => button.data.label),
    HELP_SECTIONS.map(section => section.label)
  );
  assert.equal(help.components.at(-1).components[0].data.disabled, true);
});

test('help sections show relevant commands and provide a return button', () => {
  const expectedTitles = {
    wallet: 'Wallet & transfers',
    exchange: 'Exchanges',
    giveaways: 'Giveaways',
    rollers: 'Prize rollers',
    moderation: 'Administrator moderation',
    currency: 'Currency administration',
    community: 'Games & server scores',
    setup: 'Bot setup'
  };
  for (const section of HELP_SECTIONS) {
    const help = buildHelpSection('member-1', section.id, '!');
    assert.equal(help.embeds[0].data.title, expectedTitles[section.id]);
    assert.match(help.components.at(-1).components[0].data.custom_id, /member-1:home$/);
    assert.equal(help.components.at(-1).components[0].data.disabled, false);
  }

  const exchangeHelp = buildHelpSection('member-1', 'exchange', '!').embeds[0].data.description;
  assert.match(exchangeHelp, /!exchange/);
  assert.match(exchangeHelp, /how much of the To currency you want to receive/);
  assert.match(buildHelpSection('member-1', 'giveaways', '!').embeds[0].data.description, /\/giveaway create/);
  assert.match(buildHelpSection('member-1', 'rollers', '!').embeds[0].data.description, /!roller/);
  assert.match(buildHelpSection('member-1', 'rollers', '!').embeds[0].data.description, /\/roller points/);
  assert.match(buildHelpSection('member-1', 'rollers', '!').embeds[0].data.description, /percentage chance/);
  assert.match(buildHelpSection('member-1', 'moderation', '!').embeds[0].data.description, /\/moderate purge/);
  assert.match(buildHelpSection('member-1', 'currency', '!').embeds[0].data.description, /!ex/);
  assert.match(buildHelpSection('member-1', 'currency', '!').embeds[0].data.description, /\/currency set-price/);
  assert.match(buildHelpSection('member-1', 'community', '!').embeds[0].data.description, /every 20 messages/i);
  assert.match(buildHelpSection('member-1', 'community', '!').embeds[0].data.description, /!ai <message>/);
  assert.match(buildHelpSection('member-1', 'community', '!').embeds[0].data.description, /!ai reset/);
  assert.match(buildHelpSection('member-1', 'setup', '!').embeds[0].data.description, /approval[_ -]channel/);
  assert.equal(HELP_SECTIONS.some(section => section.id.startsWith('shop')), false);
  assert.throws(() => buildHelpSection('member-1', 'unknown', '!'), /section does not exist/);
});
