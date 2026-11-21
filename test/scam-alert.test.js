const test = require('node:test');
const assert = require('node:assert/strict');
const { localizePayload } = require('../src/localization');
const {
  buildPublicScamAlert,
  buildScamReportPanel,
  buildScamReportModal,
  buildPublicScamReportSubmission,
  MAX_SCAM_REPORT_LENGTH
} = require('../src/scam-alert');

test('public scam alert contains safety guidance without identifying or mentioning the member', () => {
  const alert = buildPublicScamAlert();
  const text = JSON.stringify(alert);
  assert.match(text, /Security reminder/);
  assert.match(text, /verification codes/);
  assert.doesNotMatch(text, /member-123|@everyone|@here/);
});

test('scam report panel warns that stories and reporter usernames are public', () => {
  const panel = buildScamReportPanel('12345678901234567');
  assert.match(panel.embeds[0].data.title, /Report suspicious behavior/);
  assert.match(panel.embeds[0].data.description, /post it publicly/);
  assert.match(panel.embeds[0].data.description, /Discord username/);
  assert.match(panel.embeds[0].data.description, /Do not include private information/);
  assert.match(panel.embeds[0].data.description, /do not automatically ban/);
  assert.equal(panel.components[0].components[0].data.custom_id, 'scam-report:open:12345678901234567');
  assert.equal(panel.components[0].components[0].data.label, 'Tell your story');
  assert.deepEqual(panel.allowedMentions, { parse: [] });
});

test('scam report modal asks only for the reporter story', () => {
  const modal = buildScamReportModal('12345678901234567').toJSON();
  assert.equal(modal.custom_id, 'scam-report:submit:12345678901234567');
  assert.equal(modal.title, 'Submit a scam report');
  assert.equal(modal.components.length, 1);
  const [story] = modal.components[0].components;
  assert.equal(story.custom_id, 'story');
  assert.equal(story.style, 2);
  assert.equal(story.min_length, 10);
  assert.equal(story.max_length, MAX_SCAM_REPORT_LENGTH);
  assert.equal(story.required, true);
});

test('scam report panel and modal localize to Arabic', () => {
  const panel = localizePayload(buildScamReportPanel('12345678901234567'), 'ar');
  const modal = localizePayload(
    buildScamReportModal('12345678901234567').toJSON(),
    'ar'
  );

  assert.equal(panel.embeds[0].title, 'الإبلاغ عن سلوك مشبوه');
  assert.equal(panel.components[0].components[0].label, 'أخبرنا بما حدث');
  assert.equal(modal.title, 'إرسال بلاغ احتيال');
  assert.equal(modal.components[0].components[0].label, 'أخبرنا بما حدث');
  assert.match(panel.embeds[0].description, /سيُنشر ما تكتبه علنًا/);
});

test('public report confirmation localizes the configured channel mention', () => {
  const { translateText } = require('../src/localization');
  assert.equal(
    translateText('Your report was posted publicly in <#12345678901234567>. No automatic action was taken.', 'ar'),
    'نُشر بلاغك علنًا في <#12345678901234567>. لم يُتخذ أي إجراء تلقائي.'
  );
});

test('public report includes reporter identity and story without naming a target', () => {
  const report = buildPublicScamReportSubmission(
    { id: 'reporter-123', tag: 'member#0001', username: 'member' },
    'Sent a suspicious payment link'
  );
  const text = JSON.stringify(report);
  assert.match(text, /Submitted by.*member/);
  assert.doesNotMatch(text, /reporter-123|member#0001/);
  assert.match(text, /suspicious payment link/);
  assert.doesNotMatch(text, /Banned account|Actioned by/);
  assert.deepEqual(report.allowedMentions, { parse: [] });
});
