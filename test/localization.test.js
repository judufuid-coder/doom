const test = require('node:test');
const assert = require('node:assert/strict');
const { MessagePayload } = require('discord.js');
const { buildGamesHome } = require('../src/community-ui');
const { buildScorePayload } = require('../src/community-ui');
const { buildGiveawaySetupModal } = require('../src/giveaway-ui');
const { buildHelpHome, buildHelpSection } = require('../src/help-ui');
const { localizeCommandDefinition, localizePayload, translateText } = require('../src/localization');
const commands = require('../src/commands');
const { buildTransferCaptchaPayload } = require('../src/transfer-captcha');

test('localizes embeds and interactive buttons in Arabic', () => {
  const payload = localizePayload(buildGamesHome('user-123'), 'ar');

  assert.equal(payload.embeds[0].title, 'ألعاب قصيرة');
  assert.equal(payload.embeds[0].description, 'اختر لعبة أدناه. تمنحك كل مرة تفوز فيها نقطة واحدة في لوحة الصدارة.');
  assert.equal(payload.components[0].components[0].label, 'حجر ورقة مقص');
  assert.equal(payload.components[0].components[1].label, 'رمي العملة');
});

test('localizes help copy while preserving command syntax', () => {
  const payload = localizePayload(buildHelpHome('user-123', '!'), 'ar');

  assert.equal(payload.embeds[0].title, 'جميع أوامر البوت هنا');
  assert.match(payload.embeds[0].description, /استخدم `\/help` أو `!help`/);
  assert.match(payload.embeds[0].description, /`\/language`/);
});

test('localizes AI help while preserving prefix command syntax', () => {
  const help = localizePayload(buildHelpSection('user-123', 'community', '!'), 'ar');

  assert.match(help.embeds[0].description, /`!ai <message>`/);
  assert.match(help.embeds[0].description, /تحدث مع Groq AI/);
  assert.match(help.embeds[0].description, /امسح سجل محادثة الذكاء الاصطناعي/);
});

test('keeps English copy unchanged when English is selected', () => {
  assert.equal(translateText('Mini games', 'en'), 'Mini games');
});

test('localizes transfer shortcut member mention validation', () => {
  assert.equal(
    translateText(
      'Mention a server member using a real Discord mention (for example, @member). Use !help for syntax.',
      'ar'
    ),
    'يرجى الإشارة إلى عضو في الخادم باستخدام إشارة فعلية في Discord (اختر العضو من قائمة الإشارات). استخدم !help لمعرفة الصيغة.'
  );
});

test('localizes insufficient transfer balance', () => {
  assert.equal(
    translateText('You do not have enough balance to make this transfer.', 'ar'),
    'لا تمتلك رصيدًا كافيًا لإتمام هذا التحويل.'
  );
});

test('localizes the separate audit-log channel option', () => {
  const auditlog = commands.find(command => command.name === 'auditlog').toJSON();
  const localized = localizeCommandDefinition(auditlog);

  assert.equal(
    localized.options.find(option => option.name === 'channel').description_localizations.ar,
    'قناة نصية لإرسال سجلات إجراءات الخادم'
  );
});

test('localizes dynamic messages, score embeds, and modal fields', () => {
  assert.equal(
    translateText('Transferred 🪙 **12 Secrets** to <@123>.', 'ar'),
    'تم تحويل 🪙 **12 Secrets** إلى <@123>.'
  );
  assert.equal(
    translateText('Timed out <@123> for 2d.', 'ar'),
    'تم تقييد <@123> لمدة 2d.'
  );

  const score = localizePayload(buildScorePayload('user-123', {
    points: 4,
    message_count: 80
  }), 'ar');
  assert.equal(score.embeds[0].title, 'نتيجة المجتمع');
  assert.match(score.embeds[0].description, /النقاط: \*\*4\*\*/);
  assert.match(score.embeds[0].description, /الرسائل: \*\*80\*\*/);

  const modal = localizePayload(buildGiveawaySetupModal('user-123', 'guild-123', 'channel-123'), 'ar');
  assert.equal(modal.title, 'إنشاء سحب');
  assert.equal(modal.components[0].components[0].label, 'المدة (من دقيقة إلى 90 يومًا)');
});

test('localizes dynamic currency, moderation, giveaway, and roller responses', () => {
  assert.equal(
    translateText('Currency "gems" was not found. Use /currency list or !currency to open the currency menu.', 'ar'),
    'لم يتم العثور على العملة "gems". استخدم /currency list أو !currency لفتح قائمة العملات.'
  );
  assert.equal(
    translateText('Moved **12.5 Gems** from <@123> to your balance.', 'ar'),
    'تم تحويل **12.5 Gems** من <@123> إلى رصيدك.'
  );
  assert.equal(
    translateText('That page does not exist. The advanced roller has 3 page(s).', 'ar'),
    'هذه الصفحة غير موجودة. تحتوي العجلة المتقدمة على 3 صفحات.'
  );
  assert.equal(
    translateText('Added **Prize** to the basic roller with 2 point(s).', 'ar'),
    'تمت إضافة **Prize** إلى العجلة الأساسية بوزن 2 نقطة.'
  );
  assert.equal(
    translateText('The member was banned, but the private report could not be saved. Check the bot’s log-channel permissions.', 'ar'),
    'تم حظر العضو، لكن تعذّر حفظ البلاغ الخاص. تحقق من صلاحيات البوت في قناة السجل.'
  );
  assert.equal(
    translateText('**Prize** — 2 winner(s), ends <t:123:R>', 'ar'),
    '**Prize** — عدد الفائزين: 2، ينتهي <t:123:R>'
  );
  assert.equal(
    translateText('You received 🪙 **5 Secrets** from <@123456789012345678>.', 'ar'),
    'استلمت 🪙 **5 Secrets** من <@123456789012345678>.'
  );
});

test('localizes cyclic payload objects without overflowing or emitting circular references', () => {
  const payload = { content: 'Unknown command.' };
  payload.metadata = { parent: payload };

  const localized = localizePayload(payload, 'ar');

  assert.equal(localized.content, 'أمر غير معروف.');
  assert.equal(localized.metadata.parent, undefined);
  assert.doesNotThrow(() => JSON.stringify(localized));
});

test('localizes transfer captcha instructions and recipient notification', () => {
  const prompt = localizePayload(buildTransferCaptchaPayload('A2BC34'), 'ar');

  assert.equal(prompt.content, 'اكتب الأحرف الظاهرة في هذه الصورة كرسالتك التالية في هذه القناة. سيتم حذف الصورة وإجابتك.');
  assert.equal(prompt.files[0].name, 'transfer-captcha.png');
  assert.equal(
    translateText('Transfer complete: 🪙 **5 Secrets** sent to <@123456789012345678>. I could not delete the captcha answer; check the bot’s Manage Messages permission.', 'ar'),
    'اكتمل التحويل: أُرسل 🪙 **5 Secrets** إلى <@123456789012345678>. تعذّر عليّ حذف إجابتك؛ تحقق من صلاحية إدارة الرسائل للبوت.'
  );
  assert.equal(
    translateText('Transfer complete: 🪙 **5 Secrets** sent to <@123456789012345678>.', 'ar'),
    'اكتمل التحويل: أُرسل 🪙 **5 Secrets** إلى <@123456789012345678>.'
  );
});

test('preserves Discord message payload instances and reply references', () => {
  const replyReference = { messageReference: { id: 'message-123' } };
  const payload = MessagePayload.create({}, {
    content: 'Unknown command.',
    reply: replyReference
  });

  const localized = localizePayload(payload, 'ar');

  assert.equal(localized, payload);
  assert.ok(localized instanceof MessagePayload);
  assert.equal(localized.options.content, 'أمر غير معروف.');
  assert.equal(localized.options.reply, replyReference);
});
