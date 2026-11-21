const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

function buildRollerButtons() {
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Choose a prize roller')
      .setDescription('Click a button to roll for a prize. Your win will be announced in this channel. A server manager must add prizes to each roller before it can be used.')],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('roller:basic')
        .setLabel('Basic')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('roller:advanced')
        .setLabel('Advanced')
        .setStyle(ButtonStyle.Success)
    )],
    allowedMentions: { parse: [] }
  };
}

function rollerSetupMessage(mode) {
  return `The **${mode}** roller has no prizes configured. A server manager can add one with \`/roller add mode:${mode} prize:"Your prize" [points]\`.`;
}

module.exports = { buildRollerButtons, rollerSetupMessage };
