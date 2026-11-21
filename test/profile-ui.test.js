const test = require('node:test');
const assert = require('node:assert/strict');
const { createCanvas } = require('@napi-rs/canvas');
const { getProfileProgress, buildProfileCard } = require('../src/profile-ui');

test('each profile level requires 10,000 more Secrets than the previous level', () => {
  assert.deepEqual(getProfileProgress(0n), {
    level: 1,
    progress: 0n,
    nextLevelAt: 30_000_000_000n,
    progressPercent: 0
  });
  assert.equal(getProfileProgress(29_999_999_999n).level, 1);
  assert.deepEqual(getProfileProgress(30_000_000_000n), {
    level: 2,
    progress: 0n,
    nextLevelAt: 40_000_000_000n,
    progressPercent: 0
  });
  assert.deepEqual(getProfileProgress(70_000_000_000n), {
    level: 3,
    progress: 0n,
    nextLevelAt: 50_000_000_000n,
    progressPercent: 0
  });
  assert.equal(getProfileProgress(95_000_000_000n).progressPercent, 50);
});

test('profile card renders a PNG with avatar, balance, level and rank', async () => {
  const avatarCanvas = createCanvas(32, 32);
  const avatarContext = avatarCanvas.getContext('2d');
  avatarContext.fillStyle = '#d6a84f';
  avatarContext.fillRect(0, 0, 32, 32);
  const avatarUrl = `data:image/png;base64,${avatarCanvas.toBuffer('image/png').toString('base64')}`;

  const image = await buildProfileCard({
    id: 'user-123',
    username: 'Mahmo',
    displayAvatarURL: () => avatarUrl
  }, 45_000_000_000n, 3);
  const arabicImage = await buildProfileCard({
    id: 'user-123',
    username: 'Mahmo',
    displayAvatarURL: () => avatarUrl
  }, 45_000_000_000n, 3, 'ar');

  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(image.length > 1000);
  assert.equal(arabicImage.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(arabicImage.length > 1000);
});
