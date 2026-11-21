const test = require('node:test');
const assert = require('node:assert/strict');
const { tokenize, getPrefix, parseMemberId } = require('../src/prefix');

test('prefix command tokenizer keeps quoted names together', () => {
  assert.deepEqual(
    tokenize('currency add "Gold Coins" 2.5 💰'),
    ['currency', 'add', 'Gold Coins', '2.5', '💰']
  );
  assert.deepEqual(tokenize(`exchange 2 'Gold Coins'`), ['exchange', '2', 'Gold Coins']);
  assert.deepEqual(tokenize('say "a \\"quoted\\" name"'), ['say', 'a "quoted" name']);
});

test('command prefix defaults and rejects unusable values', () => {
  assert.equal(getPrefix(undefined), '!');
  assert.equal(getPrefix('??'), '??');
  assert.equal(getPrefix(''), '!');
  assert.throws(() => getPrefix('too long'), /COMMAND_PREFIX/);
});

test('member argument accepts Discord mentions and full user IDs', () => {
  assert.equal(parseMemberId('<@12345678901234567>'), '12345678901234567');
  assert.equal(parseMemberId('<@!123456789012345678>'), '123456789012345678');
  assert.equal(parseMemberId('123456789012345678'), '123456789012345678');
  assert.equal(parseMemberId('@some-user'), null);
  assert.equal(parseMemberId('1234'), null);
});
