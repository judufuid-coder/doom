const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { formatMinor } = require('./money');

const PROFILE_WIDTH = 1200;
const PROFILE_HEIGHT = 420;
const BASE_SECRETS_PER_LEVEL = 30_000_000_000n;
const SECRETS_PER_LEVEL_INCREMENT = 10_000_000_000n;

function getProfileProgress(balance) {
  let progress = BigInt(balance);
  let level = 1;
  let nextLevelAt = BASE_SECRETS_PER_LEVEL;
  while (progress >= nextLevelAt) {
    progress -= nextLevelAt;
    level += 1;
    nextLevelAt += SECRETS_PER_LEVEL_INCREMENT;
  }
  return {
    level,
    progress,
    nextLevelAt,
    progressPercent: Number(progress * 10000n / nextLevelAt) / 100
  };
}

async function buildProfileCard(user, balance, rank, language = 'en', progressionBalance = balance) {
  const avatarResponse = await fetch(user.displayAvatarURL({ extension: 'png', size: 256 }));
  if (!avatarResponse.ok) {
    throw new Error(`Could not load the profile avatar (HTTP ${avatarResponse.status}).`);
  }
  const avatar = await loadImage(Buffer.from(await avatarResponse.arrayBuffer()));
  const canvas = createCanvas(PROFILE_WIDTH, PROFILE_HEIGHT);
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, PROFILE_WIDTH, PROFILE_HEIGHT);
  gradient.addColorStop(0, '#111827');
  gradient.addColorStop(0.55, '#1e293b');
  gradient.addColorStop(1, '#312e2b');
  context.fillStyle = gradient;
  context.fillRect(0, 0, PROFILE_WIDTH, PROFILE_HEIGHT);

  context.fillStyle = '#d6a84f';
  context.beginPath();
  context.roundRect(0, 0, PROFILE_WIDTH, 12, 6);
  context.fill();

  context.save();
  context.beginPath();
  context.roundRect(58, 84, 252, 252, 42);
  context.clip();
  context.drawImage(avatar, 58, 84, 252, 252);
  context.restore();

  context.strokeStyle = '#d6a84f';
  context.lineWidth = 5;
  context.beginPath();
  context.roundRect(58, 84, 252, 252, 42);
  context.stroke();

  const progress = getProfileProgress(progressionBalance);
  const displayName = user.username;
  context.textBaseline = 'alphabetic';
  context.fillStyle = '#f8fafc';
  context.font = '700 48px sans-serif';
  context.fillText(displayName, 356, 138, 780);

  context.fillStyle = '#aab4c3';
  context.font = '600 19px sans-serif';
  context.fillText(language === 'ar' ? 'ملف SECRETS' : 'SECRETS PROFILE', 360, 82);
  context.fillText(language === 'ar' ? `المستوى ${progress.level}` : `LEVEL ${progress.level}`, 360, 208);
  context.fillText('SECRETS', 710, 208);
  context.fillText(language === 'ar' ? 'الترتيب العالمي' : 'GLOBAL RANK', 960, 208);

  context.fillStyle = '#ffffff';
  context.font = '700 38px sans-serif';
  context.fillText(`${formatMinor(balance)}`, 710, 258, 230);
  context.fillText(
    rank === null ? (language === 'ar' ? 'غير مصنف' : 'Unranked') : `#${rank}`,
    960,
    258,
    190
  );

  const barX = 360;
  const barY = 300;
  const barWidth = 760;
  const barHeight = 18;
  context.fillStyle = '#374151';
  context.beginPath();
  context.roundRect(barX, barY, barWidth, barHeight, 9);
  context.fill();
  if (progress.progressPercent > 0) {
    context.fillStyle = '#d6a84f';
    context.beginPath();
    context.roundRect(
      barX,
      barY,
      Math.max(12, barWidth * progress.progressPercent / 100),
      barHeight,
      9
    );
    context.fill();
  }

  context.fillStyle = '#aab4c3';
  context.font = '500 18px sans-serif';
  context.fillText(
    language === 'ar'
      ? `${formatMinor(progress.progress)} / ${formatMinor(progress.nextLevelAt)} Secrets للوصول إلى المستوى التالي`
      : `${formatMinor(progress.progress)} / ${formatMinor(progress.nextLevelAt)} Secrets to next level`,
    barX,
    356,
    barWidth
  );
  context.fillStyle = '#64748b';
  context.font = '500 16px sans-serif';
  context.fillText(`${language === 'ar' ? 'معرّف المستخدم' : 'USER ID'}  ${user.id}`, 360, 390, 760);

  return canvas.toBuffer('image/png');
}

module.exports = {
  BASE_SECRETS_PER_LEVEL,
  SECRETS_PER_LEVEL_INCREMENT,
  getProfileProgress,
  buildProfileCard
};
