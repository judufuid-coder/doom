const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { formatMinor } = require('./money');

const PAGE_SIZE = 20;
const SERVER_PAGE_SIZE = 10;

function buildOwnerHome(ownerId) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Bot owner dashboard')
    .setDescription('Choose an owner tool below.');
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`owner-action:${ownerId}:servers`)
      .setLabel('Servers')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`owner-action:${ownerId}:leaderboard`)
      .setLabel('Secrets leaderboard')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`owner-action:${ownerId}:currency-admin`)
      .setLabel('Currency admin')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`owner-action:${ownerId}:take-secrets`)
      .setLabel('Take Secrets')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`owner-action:${ownerId}:blacklist`)
      .setLabel('Blacklist user')
      .setStyle(ButtonStyle.Secondary)
  );
  const blacklistControls = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`owner-action:${ownerId}:unblacklist`)
      .setLabel('Unblacklist user')
      .setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [buttons, blacklistControls], allowedMentions: { parse: [] } };
}

function buildOwnerTakeSecretsModal(ownerId) {
  return new ModalBuilder()
    .setCustomId(`owner-take-secrets:${ownerId}`)
    .setTitle('Take Secrets from a user')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('user_id')
          .setLabel('User ID')
          .setStyle(TextInputStyle.Short)
          .setMinLength(17)
          .setMaxLength(23)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('amount')
          .setLabel('Secrets amount (up to 6 decimals)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(20)
          .setRequired(true)
      )
    );
}

function buildOwnerBlacklistModal(ownerId, action) {
  if (!['blacklist', 'unblacklist'].includes(action)) {
    throw new Error('That blacklist action is invalid.');
  }
  return new ModalBuilder()
    .setCustomId(`owner-${action}:${ownerId}`)
    .setTitle(action === 'blacklist' ? 'Blacklist a user' : 'Unblacklist a user')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('user_id')
        .setLabel('User ID')
        .setStyle(TextInputStyle.Short)
        .setMinLength(17)
        .setMaxLength(23)
        .setRequired(true)
    ));
}

function pageButtons(view, page, pageCount, ownerId, currencyId = null) {
  const rows = [];
  if (pageCount > 1) {
    const buttonId = targetPage => view === 'servers'
      ? `owner-page:servers:${targetPage}:${ownerId}`
      : `owner-page:currency:${currencyId}:${targetPage}:${ownerId}`;
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(buttonId(page - 1))
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(buttonId(page + 1))
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === pageCount - 1)
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`owner-action:${ownerId}:home`)
      .setLabel('Owner dashboard')
      .setStyle(ButtonStyle.Secondary)
  ));
  return rows;
}

function buildOwnerServersPage(guilds, serverCount, page, ownerId) {
  const pageCount = Math.max(1, Math.ceil(serverCount / SERVER_PAGE_SIZE));
  if (!Number.isInteger(page) || page < 0 || page >= pageCount) {
    throw new Error('That server list page does not exist.');
  }
  const description = guilds.map((guild, index) => {
    const name = guild.name.replace(/[\r\n]/g, ' ').slice(0, 100);
    const ownerName = (guild.ownerName || 'Unknown').replace(/[\r\n]/g, ' ').slice(0, 64);
    const memberCount = Number.isInteger(guild.memberCount) ? guild.memberCount : 'unknown';
    const invite = guild.inviteUrl
      ? `[Permanent invite](${guild.inviteUrl})`
      : 'Invite unavailable (bot needs Create Invite permission)';
    return `${page * SERVER_PAGE_SIZE + index + 1}. **${name}** — \`${guild.id}\`\nOwner: <@${guild.ownerId}> (${ownerName}) · ${memberCount} members · ${invite}`;
  }).join('\n') || 'The bot is not in any servers.';
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Servers (${serverCount})`)
    .setDescription(description)
    .setFooter({ text: `Page ${page + 1} of ${pageCount}` });
  return {
    embeds: [embed],
    components: pageButtons('servers', page, pageCount, ownerId),
    allowedMentions: { parse: [] }
  };
}

function buildOwnerLeaderboardPage(currency, stats, holders, page, ownerId) {
  const pageCount = Math.max(1, Math.ceil(holders.length / PAGE_SIZE));
  if (!Number.isInteger(page) || page < 0 || page >= pageCount) {
    throw new Error('That leaderboard page does not exist.');
  }
  const entries = holders.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const description = entries.map((holder, index) =>
    `${page * PAGE_SIZE + index + 1}. <@${holder.user_id}> — ${formatMinor(holder.amount_minor)} ${currency.name}`
  ).join('\n') || 'No positive balances for this currency.';
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`${currency.emoji} ${currency.name} leaderboard`)
    .setDescription(description)
    .addFields(
      { name: 'Total in current balances', value: `${formatMinor(stats.total_minor)} ${currency.name}`, inline: true },
      { name: 'Holders', value: stats.holder_count.toString(), inline: true },
      { name: 'Total ever granted', value: `${formatMinor(stats.issued_minor)} ${currency.name}`, inline: true }
    )
    .setFooter({ text: `Top 100 holders · Page ${page + 1} of ${pageCount}` });
  return {
    embeds: [embed],
    components: pageButtons('currency', page, pageCount, ownerId, currency.id),
    allowedMentions: { parse: [] }
  };
}

module.exports = {
  PAGE_SIZE,
  SERVER_PAGE_SIZE,
  buildOwnerHome,
  buildOwnerTakeSecretsModal,
  buildOwnerBlacklistModal,
  buildOwnerServersPage,
  buildOwnerLeaderboardPage
};
