const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

function buildAdminReviewPayload(member, adminRoles, promotionRole, actorId, canRemoveAdminRoles = true) {
  const roleList = adminRoles.map(role => `<@&${role.id}>`).join(', ') || 'None';
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Administrator role review')
    .setDescription([
      `**Member:** <@${member.id}>`,
      `**Current moderation roles:** ${roleList}`,
      `**Next role in hierarchy:** ${promotionRole ? `<@&${promotionRole.id}>` : 'No higher assignable role'}`
    ].join('\n'))
    .setFooter({ text: `Review started by ${actorId}` });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`up:promote:${actorId}:${member.id}`)
      .setLabel('Promote')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!promotionRole),
    new ButtonBuilder()
      .setCustomId(`up:skip:${actorId}:${member.id}`)
      .setLabel('Not')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`up:dm:${actorId}:${member.id}`)
      .setLabel('DM')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`up:remove:${actorId}:${member.id}`)
      .setLabel('Remove admin roles')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(adminRoles.length === 0 || !canRemoveAdminRoles)
  );
  return { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
}

function buildNoAdminMembersPayload() {
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Administrator role review')
      .setDescription('No members with moderation roles were found.')],
    components: [],
    allowedMentions: { parse: [] }
  };
}

function buildAdminDmModal(actorId, memberId) {
  return new ModalBuilder()
    .setCustomId(`up-dm:${actorId}:${memberId}`)
    .setTitle('Send a member a DM')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('message')
        .setLabel('Message')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(1000)
        .setRequired(true)
    ));
}

module.exports = {
  buildAdminReviewPayload,
  buildNoAdminMembersPayload,
  buildAdminDmModal
};
