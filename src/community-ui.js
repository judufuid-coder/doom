const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
const { GAME_CHOICES } = require('./community');

const GAME_LABELS = {
  rps: 'Rock Paper Scissors',
  coinflip: 'Coin Flip'
};

function buildGamesHome(ownerId) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Mini games')
    .setDescription('Choose a game below. Each win earns 1 leaderboard point.');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`games:start:rps:${ownerId}`)
      .setLabel('Rock Paper Scissors')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`games:start:coinflip:${ownerId}`)
      .setLabel('Coin Flip')
      .setStyle(ButtonStyle.Primary)
  );
  return { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
}

function buildGameChoices(game, ownerId) {
  const choices = GAME_CHOICES[game];
  if (!choices) throw new Error('That game is not supported.');
  const row = new ActionRowBuilder().addComponents(...choices.map(choice =>
    new ButtonBuilder()
      .setCustomId(`games:play:${game}:${choice}:${ownerId}`)
      .setLabel(choice.charAt(0).toUpperCase() + choice.slice(1))
      .setStyle(ButtonStyle.Secondary)
  ));
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(GAME_LABELS[game])
    .setDescription('Choose your move. A win earns 1 leaderboard point.');
  return { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
}

function buildScorePayload(userId, stats) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Community score')
    .setDescription([
      `Member: <@${userId}>`,
      `Points: **${stats?.points ?? 0}**`,
      `Messages: **${stats?.message_count ?? 0}**`
    ].join('\n'));
  return { embeds: [embed], allowedMentions: { parse: [] } };
}

function buildGameResult(game, playerChoice, botChoice, result, ownerId) {
  const outcome = result === 'win'
    ? 'You win! **1 point** added to your score.'
    : result === 'tie'
      ? 'It is a tie. No points were added.'
      : 'You lost this round. No points were added.';
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`${GAME_LABELS[game]} result`)
    .setDescription(`You chose **${playerChoice}**; the bot chose **${botChoice}**.\n${outcome}`);
  return {
    embeds: [embed],
    components: buildGamesHome(ownerId).components,
    allowedMentions: { parse: [] }
  };
}

function buildLeaderboardPayload(rows) {
  const description = rows.length
    ? rows.map((row, index) =>
      `**${index + 1}.** <@${row.user_id}> — **${row.points}** points · ${row.message_count} messages`
    ).join('\n')
    : 'No scores yet. Chat, claim a ticket, or win a game to get started.';
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Server leaderboard')
    .setDescription(description);
  return { embeds: [embed], allowedMentions: { parse: [] } };
}

module.exports = {
  buildGamesHome,
  buildGameChoices,
  buildGameResult,
  buildScorePayload,
  buildLeaderboardPayload
};
