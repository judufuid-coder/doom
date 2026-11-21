const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
const commands = require('./commands');

const PAGE_SIZE = 20;
const PREFIX_COMMANDS = [
  ['admin', 'Open the owner-only command dashboard'],
  ['help', 'Show the interactive command guide'],
  ['language', 'Change the bot language for this server'],
  ['setup', 'Check setup or configure server channels'],
  ['auditlog', 'Configure the separate server action log'],
  ['up', 'Review administrator roles'],
  ['تشهير', 'Submit a scam report'],
  ['balance', 'View a wallet'],
  ['b', 'View a member wallet'],
  ['profile', 'Show a profile'],
  ['p', 'Show a profile'],
  ['transfer', 'Transfer Secrets'],
  ['exchange', 'Create an exchange request'],
  ['currency', 'Open currency administration'],
  ['ex', 'Open exchange administration'],
  ['giveaway', 'Open giveaway management'],
  ['roller', 'Post prize roller buttons'],
  ['games', 'Open mini games'],
  ['ai', 'Chat with Groq AI'],
  ['score', 'View a member score'],
  ['leaderboard', 'Show the server leaderboard']
];

function commandKey(commandName, subcommand = null) {
  return `slash-${commandName}${subcommand ? `-${subcommand}` : ''}`;
}

const ADMIN_COMMANDS = [
  ...commands.flatMap(command => {
    const data = command.toJSON();
    const subcommands = data.options?.filter(option => option.type === 1) || [];
    if (subcommands.length) {
      return subcommands.map(subcommand => ({
        key: commandKey(data.name, subcommand.name),
        commandName: data.name,
        subcommand: subcommand.name,
        label: `/${data.name} ${subcommand.name}`,
        description: subcommand.description
      }));
    }
    return [{
      key: commandKey(data.name),
      commandName: data.name,
      label: `/${data.name}`,
      description: data.description
    }];
  }),
  ...PREFIX_COMMANDS.map(([name, description]) => ({
    key: `prefix-${name}`,
    prefixCommand: name,
    label: `!${name}`,
    description
  }))
];

function buildAdminDashboard(ownerId, page = 0, prefix = '!') {
  const pageCount = Math.max(1, Math.ceil(ADMIN_COMMANDS.length / PAGE_SIZE));
  if (!Number.isInteger(page) || page < 0 || page >= pageCount) {
    throw new Error('That admin dashboard page does not exist.');
  }
  const entries = ADMIN_COMMANDS.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(entry => ({
    ...entry,
    label: entry.prefixCommand ? `${prefix}${entry.prefixCommand}` : entry.label
  }));
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Bot admin command dashboard')
    .setDescription(entries.map(entry => `**${entry.label}** — ${entry.description}`).join('\n'));

  const rows = [];
  for (let index = 0; index < entries.length; index += 5) {
    rows.push(new ActionRowBuilder().addComponents(...entries.slice(index, index + 5).map(entry =>
      new ButtonBuilder()
        .setCustomId(`admin:${ownerId}:${page}:${entry.key}`)
        .setLabel(entry.label.slice(0, 80))
        .setStyle(ButtonStyle.Secondary)
    )));
  }
  if (pageCount > 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`admin-page:${ownerId}:${page - 1}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`admin-page:${ownerId}:${page + 1}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === pageCount - 1)
    ));
    embed.setFooter({ text: `Page ${page + 1} of ${pageCount} · ${ADMIN_COMMANDS.length} commands` });
  } else {
    embed.setFooter({ text: `${ADMIN_COMMANDS.length} commands` });
  }
  return { embeds: [embed], components: rows, allowedMentions: { parse: [] } };
}

function getAdminCommand(key) {
  return ADMIN_COMMANDS.find(command => command.key === key);
}

module.exports = { ADMIN_COMMANDS, buildAdminDashboard, getAdminCommand };
