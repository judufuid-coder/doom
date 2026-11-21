const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

const BASE_CURRENCY_NAME = 'Secrets';

const HELP_SECTIONS = [
  { id: 'wallet', label: 'Wallet & transfers' },
  { id: 'exchange', label: 'Exchanges' },
  { id: 'giveaways', label: 'Giveaways' },
  { id: 'rollers', label: 'Prize rollers' },
  { id: 'moderation', label: 'Moderation' },
  { id: 'currency', label: 'Currency admin' },
  { id: 'community', label: 'Games & scores' },
  { id: 'setup', label: 'Bot setup' }
];

function helpButtonRows(ownerId, activeSection = null) {
  const sectionButtons = HELP_SECTIONS.map(section =>
    new ButtonBuilder()
      .setCustomId(`help-ui:${ownerId}:${section.id}`)
      .setLabel(section.label)
      .setStyle(section.id === activeSection ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );
  const rows = [];
  for (let index = 0; index < sectionButtons.length; index += 5) {
    rows.push(new ActionRowBuilder().addComponents(...sectionButtons.slice(index, index + 5)));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`help-ui:${ownerId}:home`)
      .setLabel('All commands')
      .setStyle(ButtonStyle.Success)
      .setDisabled(activeSection === null)
  ));
  return rows;
}

function buildHelpHome(ownerId, prefix) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('All bot commands are here')
    .setDescription([
      `Use \`/help\` or \`${prefix}help\` to open this command guide.`,
      'Use `/setup` (Administrator) to check server configuration and configure exchange and public scam-alert channels. Configure action logs separately with `/auditlog`.',
      'Use `/language` (Administrator) or `!language` to switch the server between English and Arabic.',
      'Choose a section using the buttons below to see its commands. Some management commands require server permissions.'
    ].join('\n'))
    .addFields(
      { name: 'Wallet & transfers', value: 'Balances, member lookups, and Secrets transfers', inline: true },
      { name: 'Exchanges', value: 'Create exchange requests and get moderator decisions', inline: true },
      { name: 'Giveaways', value: 'Create giveaways and choose winners', inline: true },
      { name: 'Prize rollers', value: 'Configure weighted basic and advanced prize rollers', inline: true },
      { name: 'Moderation', value: 'Administrator-only moderation and role tools', inline: true },
      { name: 'Currency admin', value: 'Manage currencies and exchange rates', inline: true },
      { name: 'Games & scores', value: 'Play mini games and track server points', inline: true }
    );
  return { embeds: [embed], components: helpButtonRows(ownerId), allowedMentions: { parse: [] } };
}

function buildHelpSection(ownerId, sectionId, prefix) {
  const sections = {
    wallet: {
      title: 'Wallet & transfers',
      description: [
        '`/profile [member]` or `!profile [@member]` / `!p [@member]` — show a profile card with avatar, Secrets, level, and global Secrets rank',
        '`/balance [member] [currency]` — wallet shows Secrets; specify a currency for its balance',
        `\`${prefix}balance [@member] ["currency"]\``,
        `\`${prefix}b @member\` — view a mentioned member's Secrets wallet`,
        '`/transfer member amount`',
        `\`${prefix}transfer @member <amount>\``,
        `Transfers send ${BASE_CURRENCY_NAME} only. Use \`/help\` or \`${prefix}help\` to return here.`
      ].join('\n')
    },
    exchange: {
      title: 'Exchanges',
      description: [
        `\`${prefix}exchange\` — choose currencies and enter how much of the To currency you want to receive`,
        `\`${prefix}exchange <amount> "<from>" "<to>"\` — request that amount of the To currency`,
        '`/exchange amount from to` — request that amount of the To currency',
        'The equivalent From amount, rounded up to six decimal places, is reserved. Requests appear in the configured approval channel and wait for an administrator to approve or reject them.'
      ].join('\n')
    },
    giveaways: {
      title: 'Giveaways',
      description: [
        '`/giveaway create` — open a private setup form and post a public reaction-entry giveaway',
        `\`${prefix}giveaway\` — post a button that opens the private setup form`,
        `\`/giveaway list\` or \`${prefix}giveaway list\` — list active giveaways`,
        `\`/giveaway end id\` or \`${prefix}giveaway end <id>\` — end one early`,
        `\`/giveaway reroll id\` or \`${prefix}giveaway reroll <id>\` — select an additional winner`,
        'Giveaway management requires Administrator. Duration is 1 minute to 90 days; a giveaway can have up to 20 winners.'
      ].join('\n')
    },
    rollers: {
      title: 'Prize rollers',
      description: [
        `\`${prefix}roller\` — post an embed with Basic and Advanced buttons; clicking one rolls for you and announces your prize`,
        '`/roller add mode prize [points]` — add a prize to the Basic or Advanced roller (default weight: 1 point)',
        '`/roller points mode prize points` — change a prize’s points weight',
        '`/roller remove mode prize` — remove a prize',
        '`/roller list mode [page]` — see each prize’s points and percentage chance',
        '`/roller roll mode [member]` — roll and announce the prize; Manage Server is required to roll for another member',
        'Each server has separate Basic and Advanced prize lists. A prize’s chance is its points divided by the total points in that roller. Managing prize lists requires Manage Server.'
      ].join('\n')
    },
    moderation: {
      title: 'Administrator moderation',
      description: [
        '`/moderate timeout member duration reason` and `/moderate untimeout member`',
        '`/moderate kick member reason`, `/moderate ban member reason`, and `/moderate unban user_id`',
        '`/moderate warn member reason` — DM-only, warnings are not stored',
        '`/moderate purge amount` — delete up to 50 recent messages',
        '`/moderate role-add member role` and `/moderate role-remove member role` — one role and one member at a time',
        `\`${prefix}up\` — review members with moderation-permission roles, promote to the next higher role, DM them, skip them, or remove their moderation roles`,
        'The bot needs Manage Roles, its highest role must be above the roles it changes, and Server Members Intent must be enabled to scan members. Review cards are posted in the current channel.',
        `\`${prefix}تشهير\` — Administrator-only: post a report form that submits stories to the configured public scam-alert channel.`,
        'The form warns members that their story and Discord username will be posted publicly. Reports do not automatically ban anyone.',
        'Configure the public channel with `/setup alert_channel:#channel` or `!setup alert #channel`. The bot needs View Channel, Send Messages, and Embed Links there.',
        'All other moderation commands require Administrator. Server-wide remove-all-roles is not available.'
      ].join('\n')
    },
    currency: {
      title: 'Currency administration',
      description: [
        `\`${prefix}currency\` — open the owner-only menu to list, add, reprice, remove, or grant Secrets to yourself`,
        '`/currency list` — list currencies',
        '`/currency add name price emoji` — add a currency',
        '`/currency set-price name price` — change its rate',
        '`/currency grant amount` — grant Secrets to the configured bot owner',
        '`/currency remove name` — remove an unused currency',
        '`/owner` — bot-owner dashboard for server/currency data, transferring Secrets from user balances, and managing the user blacklist',
        `\`${prefix}ex\` — open the exchange-rate and approval-channel menu`,
        'Currency management is restricted to the configured bot owner.',
        `Currency prices are measured in ${BASE_CURRENCY_NAME}. The built-in ${BASE_CURRENCY_NAME} currency cannot be removed or repriced.`
      ].join('\n')
    },
    community: {
      title: 'Games & server scores',
      description: [
        '`/games` or `!games` — play Rock Paper Scissors or Coin Flip; wins earn 1 point',
        `\`${prefix}ai <message>\` — Chat with Groq AI; recent context is kept per member in this server`,
        `\`${prefix}ai reset\` — Clear your AI chat history`,
        '`/score [member]` or `!score [@member]` — view a member’s points and message count',
        '`/leaderboard` or `!leaderboard` — show the server points leaderboard',
        'Members earn 1 point for every 20 messages. Administrators earn 1 point for each ticket they claim.',
        'Ticket claim buttons appear in channels whose names or parent category include “ticket”, “support”, or “case”.'
      ].join('\n')
    },
    setup: {
      title: 'Bot setup',
      description: [
        '`/setup [approval_channel] [alert_channel]` — Administrator setup check; configure exchange approvals and the public scam-alert channel',
        `\`${prefix}setup [#approval-channel] [#alert-channel]\` — configure exchange and scam-alert channels`,
        `\`${prefix}setup alert #alert-channel\` — set just the public scam alert channel`,
        `\`/auditlog channel:#channel\` or \`${prefix}auditlog #channel\` — configure the separate server action-log channel`,
        'Setup scans existing text channels for ticket/support/case names and makes sure each has an admin claim button.',
        'Grant the bot View Channel, Send Messages, and Embed Links in approval and ticket channels.',
        `Use \`${prefix}تشهير\` to post a scam-report form. Configure the public alert channel first with \`${prefix}setup alert #channel\`.`,
        'Administrators can use `/اختصارات add trigger:<text> command:<command>` to create aliases for balance, profile, transfer, or exchange. `/اختصارات list` shows available commands and configured aliases; `/اختصارات remove trigger:<text>` deletes an alias. Members can add the usual command arguments after the alias.',
        'Message points and mini games are enabled automatically; use `/leaderboard` and `/games`.'
      ].join('\n')
    }
  };
  const section = sections[sectionId];
  if (!section) throw new Error('That help section does not exist.');
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(section.title)
    .setDescription(section.description);
  return {
    embeds: [embed],
    components: helpButtonRows(ownerId, sectionId),
    allowedMentions: { parse: [] }
  };
}

module.exports = { HELP_SECTIONS, buildHelpHome, buildHelpSection };
