const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const MAX_SCAM_REPORT_LENGTH = 1000;

function buildPublicScamAlert() {
  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('Security reminder')
    .setDescription([
      'We recently took moderation action after receiving a scam report.',
      'Be cautious of unsolicited offers and suspicious links. Never share passwords or verification codes, and do not send money to people you do not trust.',
      'If you receive a suspicious message, report it privately to the server moderators.'
    ].join('\n\n'));
  return { embeds: [embed], allowedMentions: { parse: [] } };
}

function buildScamReportPanel(reportChannelId) {
  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('Report suspicious behavior')
    .setDescription([
      'Have you experienced or witnessed a scam? Use the button below to tell the moderators what happened.',
      'Submitting your story will post it publicly in the configured scam-alert channel together with your Discord username. Do not include private information. Reports do not automatically ban anyone.'
    ].join('\n\n'));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`scam-report:open:${reportChannelId}`)
      .setLabel('Tell your story')
      .setStyle(ButtonStyle.Danger)
  );
  return { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
}

function buildScamReportModal(reportChannelId) {
  return new ModalBuilder()
    .setCustomId(`scam-report:submit:${reportChannelId}`)
    .setTitle('Submit a scam report')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('story')
        .setLabel('Tell us what happened')
        .setPlaceholder('Describe what happened and include any useful details.')
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(10)
        .setMaxLength(MAX_SCAM_REPORT_LENGTH)
        .setRequired(true)
    ));
}

function buildPublicScamReportSubmission(reporter, story) {
  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('Community scam report')
    .setDescription([
      `**Submitted by:** ${reporter.username || reporter.tag || 'Unknown user'}`,
      '**Story:**',
      story
    ].join('\n\n'))
    .setTimestamp();
  return {
    embeds: [embed],
    allowedMentions: { parse: [] }
  };
}

module.exports = {
  buildPublicScamAlert,
  buildScamReportPanel,
  buildScamReportModal,
  buildPublicScamReportSubmission,
  MAX_SCAM_REPORT_LENGTH
};
