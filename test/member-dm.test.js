const test = require('node:test');
const assert = require('node:assert/strict');
const { memberDmPayload } = require('../src/member-dm');

test('member DM starts with a mention of its recipient', () => {
  assert.deepEqual(memberDmPayload('123456789012345678', 'Your exchange is pending.'), {
    content: '<@123456789012345678>\nYour exchange is pending.',
    allowedMentions: {
      users: ['123456789012345678'],
      parse: []
    }
  });
});

test('member DM rejects invalid recipient IDs', () => {
  assert.throws(() => memberDmPayload('not-a-user', 'Hello'), /valid member ID/);
});
