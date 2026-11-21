const test = require('node:test');
const assert = require('node:assert/strict');
const {
  findShortcut,
  normalizeShortcutTrigger,
  validateShortcutCommand
} = require('../src/shortcuts');

test('shortcut triggers are trimmed and normalized case-insensitively', () => {
  assert.equal(normalizeShortcutTrigger('  Balance  '), 'balance');
  assert.equal(normalizeShortcutTrigger('  رصيد  '), 'رصيد');
});

test('shortcut trigger validation enforces Discord message matching bounds', () => {
  assert.throws(() => normalizeShortcutTrigger('   '), /between 1 and 100 characters/);
  assert.throws(() => normalizeShortcutTrigger('x'.repeat(101)), /between 1 and 100 characters/);
});

test('only public commands with matching prefix handlers can be shortcut targets', () => {
  for (const command of ['balance', 'profile', 'transfer', 'exchange']) {
    assert.equal(validateShortcutCommand(command), command);
  }
  assert.throws(() => validateShortcutCommand('setup'), /supported shortcut command/);
});

test('the supported shortcut targets stay limited to the public commands', () => {
  const { SHORTCUT_COMMANDS } = require('../src/shortcuts');
  assert.deepEqual(Object.keys(SHORTCUT_COMMANDS), ['balance', 'profile', 'transfer', 'exchange']);
});

test('shortcut matches exact triggers and preserves command arguments', () => {
  const shortcuts = [
    { trigger: 'bal', command_name: 'balance' },
    { trigger: 'pay', command_name: 'transfer' }
  ];
  assert.deepEqual(findShortcut(shortcuts, ' BAL '), {
    shortcut: shortcuts[0],
    argumentsText: ''
  });
  assert.deepEqual(findShortcut(shortcuts, 'Pay @member 5'), {
    shortcut: shortcuts[1],
    argumentsText: '@member 5'
  });
  assert.equal(findShortcut(shortcuts, 'paying @member 5'), null);
});

test('longer shortcut triggers take precedence over shorter overlapping triggers', () => {
  const shortcuts = [
    { trigger: 'pay', command_name: 'transfer' },
    { trigger: 'pay friend', command_name: 'balance' }
  ];
  assert.equal(findShortcut(shortcuts, 'pay friend').shortcut.command_name, 'balance');
});

test('legacy saved-reply shortcuts remain detectable', () => {
  const legacyShortcut = { trigger: 'help', command_name: '', response: 'Use /help' };
  assert.deepEqual(findShortcut([legacyShortcut], 'help'), {
    shortcut: legacyShortcut,
    argumentsText: ''
  });
  assert.equal(findShortcut([legacyShortcut], 'help me'), null);
});
