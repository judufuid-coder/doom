const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildTransferCaptchaImage,
  buildTransferCaptchaPayload,
  generateTransferCaptchaCode
} = require('../src/transfer-captcha');

test('transfer captcha uses a six-character alphanumeric code', () => {
  const code = generateTransferCaptchaCode();
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
});

test('both transfer captcha styles render valid PNG images', () => {
  for (const style of ['current', 'alternate']) {
    const image = buildTransferCaptchaImage('A2BC34', style);
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  }
  assert.throws(() => buildTransferCaptchaImage('A2BC34', 'unknown'), /Invalid transfer CAPTCHA style/);
});

test('transfer captcha is sent as an image with instructions to answer in-channel', () => {
  const payload = buildTransferCaptchaPayload('A2BC34', 'alternate');
  assert.match(payload.content, /as your next message in this channel/);
  assert.equal(payload.files[0].name, 'transfer-captcha.png');
  assert.equal(payload.embeds[0].image.url, 'attachment://transfer-captcha.png');
  assert.throws(() => buildTransferCaptchaImage('bad'), /Invalid transfer verification code/);
});
