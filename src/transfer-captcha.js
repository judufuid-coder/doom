const { randomInt } = require('node:crypto');
const { createCanvas } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');

const CAPTCHA_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CAPTCHA_LENGTH = 6;
const CAPTCHA_WIDTH = 420;
const CAPTCHA_HEIGHT = 150;
const CONFETTI_COLORS = ['#e63f82', '#f08c32', '#e3bd38', '#45a86b', '#338bd0', '#7651b5'];
const INK_COLORS = ['#21182b', '#3b2148', '#27252c', '#55264a'];
const ALTERNATE_STYLE_PERCENTAGE = Number(process.env.TRANSFER_CAPTCHA_VARIANT_PERCENT ?? 50);

if (!Number.isInteger(ALTERNATE_STYLE_PERCENTAGE)
  || ALTERNATE_STYLE_PERCENTAGE < 0
  || ALTERNATE_STYLE_PERCENTAGE > 100) {
  throw new Error('TRANSFER_CAPTCHA_VARIANT_PERCENT must be a whole number from 0 to 100.');
}

function generateTransferCaptchaCode() {
  return Array.from({ length: CAPTCHA_LENGTH }, () =>
    CAPTCHA_ALPHABET[randomInt(CAPTCHA_ALPHABET.length)]
  ).join('');
}

function drawCurrentCaptcha(context, code) {
  context.fillStyle = '#fffdf8';
  context.fillRect(0, 0, CAPTCHA_WIDTH, CAPTCHA_HEIGHT);

  for (let index = 0; index < 1800; index++) {
    const radius = 0.5 + Math.random() * 1.8;
    context.beginPath();
    context.arc(randomInt(CAPTCHA_WIDTH), randomInt(CAPTCHA_HEIGHT), radius, 0, Math.PI * 2);
    context.fillStyle = CONFETTI_COLORS[randomInt(CONFETTI_COLORS.length)];
    context.globalAlpha = 0.2 + Math.random() * 0.65;
    context.fill();
  }
  context.globalAlpha = 1;

  for (let index = 0; index < 9; index++) {
    context.beginPath();
    context.moveTo(randomInt(-30, 60), randomInt(-10, CAPTCHA_HEIGHT + 10));
    context.bezierCurveTo(
      randomInt(70, 180),
      randomInt(-40, CAPTCHA_HEIGHT + 40),
      randomInt(230, 350),
      randomInt(-40, CAPTCHA_HEIGHT + 40),
      randomInt(CAPTCHA_WIDTH - 60, CAPTCHA_WIDTH + 30),
      randomInt(-10, CAPTCHA_HEIGHT + 10)
    );
    context.strokeStyle = CONFETTI_COLORS[randomInt(CONFETTI_COLORS.length)];
    context.globalAlpha = 0.45 + Math.random() * 0.3;
    context.lineWidth = 1 + Math.random() * 3;
    context.stroke();
  }
  context.globalAlpha = 1;

  for (let index = 0; index < 44; index++) {
    const radius = 2 + Math.random() * 6;
    context.beginPath();
    context.arc(randomInt(CAPTCHA_WIDTH), randomInt(CAPTCHA_HEIGHT), radius, 0, Math.PI * 2);
    context.fillStyle = index % 3 === 0
      ? INK_COLORS[randomInt(INK_COLORS.length)]
      : CONFETTI_COLORS[randomInt(CONFETTI_COLORS.length)];
    context.globalAlpha = 0.35 + Math.random() * 0.5;
    context.fill();
  }
  context.globalAlpha = 1;

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (let index = 0; index < code.length; index++) {
    const centerX = 48 + index * 65 + randomInt(-11, 12);
    const centerY = 75 + randomInt(-21, 22);
    context.save();
    context.translate(centerX, centerY);
    context.rotate((randomInt(91) - 45) / 100);
    context.font = `${randomInt(2) ? 'italic ' : ''}700 ${43 + randomInt(20)}px sans-serif`;
    context.fillStyle = INK_COLORS[randomInt(INK_COLORS.length)];
    context.fillText(code[index], 0, 0);
    context.restore();
  }

  for (let index = 0; index < 12; index++) {
    context.beginPath();
    context.moveTo(randomInt(-20, CAPTCHA_WIDTH + 20), randomInt(-30, CAPTCHA_HEIGHT + 30));
    context.lineTo(randomInt(-20, CAPTCHA_WIDTH + 20), randomInt(-30, CAPTCHA_HEIGHT + 30));
    context.strokeStyle = INK_COLORS[randomInt(INK_COLORS.length)];
    context.globalAlpha = 0.55 + Math.random() * 0.35;
    context.lineWidth = 2 + Math.random() * 4;
    context.stroke();
  }

  for (let index = 0; index < 720; index++) {
    const radius = 0.5 + Math.random() * 2;
    context.beginPath();
    context.arc(randomInt(CAPTCHA_WIDTH), randomInt(CAPTCHA_HEIGHT), radius, 0, Math.PI * 2);
    context.fillStyle = CONFETTI_COLORS[randomInt(CONFETTI_COLORS.length)];
    context.globalAlpha = 0.25 + Math.random() * 0.6;
    context.fill();
  }
  context.globalAlpha = 1;

  for (let index = 0; index < 16; index++) {
    context.beginPath();
    context.arc(randomInt(CAPTCHA_WIDTH), randomInt(CAPTCHA_HEIGHT), 2 + Math.random() * 7, 0, Math.PI * 2);
    context.fillStyle = index % 2 === 0
      ? INK_COLORS[randomInt(INK_COLORS.length)]
      : CONFETTI_COLORS[randomInt(CONFETTI_COLORS.length)];
    context.globalAlpha = 0.55 + Math.random() * 0.35;
    context.fill();
  }
  context.globalAlpha = 1;
}

function drawAlternateCaptcha(context, code) {
  context.fillStyle = '#fffdf8';
  context.fillRect(0, 0, CAPTCHA_WIDTH, CAPTCHA_HEIGHT);

  for (let index = 0; index < 1500; index++) {
    context.beginPath();
    context.arc(randomInt(CAPTCHA_WIDTH), randomInt(CAPTCHA_HEIGHT), 0.5 + Math.random() * 2, 0, Math.PI * 2);
    context.fillStyle = CONFETTI_COLORS[randomInt(CONFETTI_COLORS.length)];
    context.globalAlpha = 0.25 + Math.random() * 0.65;
    context.fill();
  }
  context.globalAlpha = 1;

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (let index = 0; index < code.length; index++) {
    const centerX = 44 + index * 67 + randomInt(-10, 11);
    const centerY = 76 + randomInt(-22, 23);
    context.save();
    context.translate(centerX, centerY);
    context.rotate((randomInt(111) - 55) / 100);
    context.font = `900 ${57 + randomInt(20)}px sans-serif`;
    context.fillStyle = '#111014';
    context.fillText(code[index], 0, 0);
    context.restore();
  }

  for (let index = 0; index < 15; index++) {
    context.beginPath();
    context.moveTo(randomInt(-30, CAPTCHA_WIDTH + 30), randomInt(-30, CAPTCHA_HEIGHT + 30));
    context.bezierCurveTo(
      randomInt(40, 180),
      randomInt(-45, CAPTCHA_HEIGHT + 45),
      randomInt(240, 370),
      randomInt(-45, CAPTCHA_HEIGHT + 45),
      randomInt(-30, CAPTCHA_WIDTH + 30),
      randomInt(-30, CAPTCHA_HEIGHT + 30)
    );
    context.strokeStyle = index % 4 === 0
      ? CONFETTI_COLORS[randomInt(CONFETTI_COLORS.length)]
      : '#111014';
    context.globalAlpha = index % 4 === 0 ? 0.75 : 0.85;
    context.lineWidth = index % 4 === 0 ? 2 : 3 + Math.random() * 5;
    context.stroke();
  }

  for (let index = 0; index < 28; index++) {
    context.beginPath();
    context.arc(randomInt(CAPTCHA_WIDTH), randomInt(CAPTCHA_HEIGHT), 2 + Math.random() * 7, 0, Math.PI * 2);
    context.fillStyle = index % 2 === 0
      ? '#111014'
      : CONFETTI_COLORS[randomInt(CONFETTI_COLORS.length)];
    context.globalAlpha = 0.5 + Math.random() * 0.45;
    context.fill();
  }
  context.globalAlpha = 1;
}

function buildTransferCaptchaImage(code, style) {
  if (!new RegExp(`^[${CAPTCHA_ALPHABET}]{${CAPTCHA_LENGTH}}$`).test(code)) {
    throw new Error('Invalid transfer verification code.');
  }
  if (style !== undefined && style !== 'current' && style !== 'alternate') {
    throw new Error('Invalid transfer CAPTCHA style.');
  }
  const canvas = createCanvas(CAPTCHA_WIDTH, CAPTCHA_HEIGHT);
  const context = canvas.getContext('2d');
  const selectedStyle = style || (
    randomInt(100) < ALTERNATE_STYLE_PERCENTAGE ? 'alternate' : 'current'
  );
  if (selectedStyle === 'alternate') {
    drawAlternateCaptcha(context, code);
  } else {
    drawCurrentCaptcha(context, code);
  }

  return canvas.toBuffer('image/png');
}

function buildTransferCaptchaPayload(code, style) {
  return {
    content: 'Type the characters shown in this image as your next message in this channel. The image and your answer will be deleted.',
    files: [new AttachmentBuilder(buildTransferCaptchaImage(code, style), { name: 'transfer-captcha.png' })],
    embeds: [{ image: { url: 'attachment://transfer-captcha.png' } }],
    allowedMentions: { parse: [] }
  };
}

module.exports = {
  buildTransferCaptchaImage,
  buildTransferCaptchaPayload,
  generateTransferCaptchaCode
};
