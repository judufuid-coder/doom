const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

function buildGiveawaySetupButton(ownerId) {
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Giveaway setup')
      .setDescription('An administrator can open the private form to configure a giveaway.')],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway-setup:${ownerId}`)
        .setLabel('Set up giveaway')
        .setStyle(ButtonStyle.Primary)
    )],
    allowedMentions: { parse: [] }
  };
}

function buildGiveawaySetupModal(ownerId, guildId, channelId) {
  const field = (id, label, maxLength, placeholder) => new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setMaxLength(maxLength)
    .setPlaceholder(placeholder)
    .setRequired(true);
  return new ModalBuilder()
    .setCustomId(`giveaway-create:${ownerId}:${guildId}:${channelId}`)
    .setTitle('Create a giveaway')
    .addComponents(
      new ActionRowBuilder().addComponents(field('duration', 'Duration (1m to 90d)', 12, '2h')),
      new ActionRowBuilder().addComponents(field('prize', 'Prize', 200, 'What can members win?')),
      new ActionRowBuilder().addComponents(field('winners', 'Number of winners (1-20)', 2, '1')),
      new ActionRowBuilder().addComponents(field('emoji', 'Reaction emoji', 64, '🎉'))
    );
}

function normalizeGiveawayEmoji(value) {
  const emoji = value.trim();
  const customEmoji = emoji.match(/^<a?:[a-zA-Z0-9_]{2,32}:(\d+)>$/);
  if (customEmoji) return customEmoji[1];
  if (!emoji || emoji.length > 64 || /[\u0000-\u001f\u007f]/u.test(emoji)) {
    throw new Error('Enter a valid Unicode emoji or custom emoji mention.');
  }
  return emoji;
}

module.exports = {
  buildGiveawaySetupButton,
  buildGiveawaySetupModal,
  normalizeGiveawayEmoji
};
