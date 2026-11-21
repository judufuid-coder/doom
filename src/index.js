const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { requireBotOwner, isConfiguredBotOwner } = require('./bot-owner');
const { randomUUID } = require('node:crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  AuditLogEvent,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  ModalBuilder,
  Partials,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const {
  toMinor,
  toMicros,
  parseMinor,
  sourceMinorForTarget,
  formatMinor,
  formatPrice
} = require('./money');
const { buildExchangeSelection, displayCurrencyEmoji } = require('./exchange-ui');
const { buildHelpHome, buildHelpSection } = require('./help-ui');
const { buildWalletPayload } = require('./wallet-ui');
const { buildProfileCard } = require('./profile-ui');
const {
  buildGiveawaySetupButton,
  buildGiveawaySetupModal,
  normalizeGiveawayEmoji
} = require('./giveaway-ui');
const {
  MAX_WINNERS,
  endGiveawayRecord,
  makeGiveawayEmbed,
  parseGiveawayDuration,
  rerollGiveawayRecord
} = require('./giveaway');
const { parseTimeoutDuration } = require('./moderation');
const { getRollChancePercent, selectRollPrize, totalRollPoints } = require('./roller');
const { buildRollerButtons, rollerSetupMessage } = require('./roller-ui');
const { memberDmPayload } = require('./member-dm');
const {
  buildTransferCaptchaPayload,
  generateTransferCaptchaCode
} = require('./transfer-captcha');
const {
  ACTIONS: CURRENCY_ADMIN_ACTIONS,
  buildCurrencyAdminList,
  buildCurrencyAdminMenu,
  buildCurrencyAdminModal
} = require('./currency-admin-ui');
const { tokenize, getPrefix, parseMemberId } = require('./prefix');
const { getAdminRoles, getNextPromotionRole } = require('./admin-roles');
const {
  buildScamReportPanel,
  buildScamReportModal,
  buildPublicScamReportSubmission,
  MAX_SCAM_REPORT_LENGTH
} = require('./scam-alert');
const {
  buildAdminReviewPayload,
  buildNoAdminMembersPayload,
  buildAdminDmModal
} = require('./admin-review-ui');
const { isTicketChannel, randomGameChoice, resolveGameResult } = require('./community');
const {
  buildGamesHome,
  buildGameChoices,
  buildGameResult,
  buildScorePayload,
  buildLeaderboardPayload
} = require('./community-ui');
const {
  buildOwnerHome,
  buildOwnerTakeSecretsModal,
  buildOwnerBlacklistModal,
  buildOwnerServersPage,
  buildOwnerLeaderboardPage
} = require('./owner-ui');
const { buildAdminDashboard, getAdminCommand } = require('./admin-ui');
const { localizePayload } = require('./localization');
const {
  buildAuditLogEmbed,
  findRecentAuditLogEntryForEvent,
  auditExecutorFields
} = require('./audit-logs');
const {
  GroqChat,
  isWhoAmIPrompt,
  formatWhoAmIResponse,
  isWhoIsDeveloperPrompt,
  formatDeveloperResponse
} = require('./ai-chat');
const {
  findShortcut,
  normalizeShortcutTrigger,
  validateShortcutCommand
} = require('./shortcuts');
const {
  db,
  BASE_CURRENCY_NAME,
  statements,
  getBalance,
  changeBalance,
  recordTransaction,
  recordCommunityMessage,
  transaction
} = require('./db');

const commandPrefix = getPrefix(process.env.COMMAND_PREFIX);
const aiChat = new GroqChat({
  apiKey: process.env.GROQ_API_KEY,
  model: process.env.GROQ_MODEL || undefined,
  systemPrompt: process.env.GROQ_SYSTEM_PROMPT || undefined
});
const localizedChannels = new WeakSet();
const pendingTransfers = new Map();
const TRANSFER_CAPTCHA_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING_TRANSFERS = 1000;

class CommandInputError extends Error {}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User]
});

function getGuildLanguage(guildId) {
  return guildId ? statements.getGuildLanguage.get(guildId)?.language || 'en' : 'en';
}

function localizeChannel(channel) {
  if (!channel || typeof channel.send !== 'function' || localizedChannels.has(channel)) return channel;
  const send = channel.send.bind(channel);
  channel.send = (payload, ...args) => send(
    localizePayload(payload, getGuildLanguage(channel.guildId)),
    ...args
  );
  localizedChannels.add(channel);
  return channel;
}

function localizeGuildChannels(guild) {
  for (const channel of guild.channels.cache.values()) localizeChannel(channel);
}

async function sendGuildAuditLog(guild, embed) {
  const setting = statements.getAuditLogChannel.get(guild.id);
  if (!setting) return;
  const { audit_log_channel_id: auditLogChannelId } = setting;

  const channel = await guild.channels.fetch(auditLogChannelId);
  if (!channel || channel.guildId !== guild.id || !channel.isTextBased() ||
      typeof channel.send !== 'function') {
    throw new Error(`Audit log channel ${auditLogChannelId} is not a text channel in server ${guild.id}.`);
  }

  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
}

function formatShortcuts(shortcuts) {
  const commandSyntax = {
    balance: '[@member] [currency]',
    profile: '[@member]',
    transfer: '@member <amount>',
    exchange: '[amount from to]'
  };
  const availableCommands = Object.keys(commandSyntax)
    .map(command => `\`${commandPrefix}${command} ${commandSyntax[command]}\``)
    .join('\n');
  const configuredLines = shortcuts.slice(0, 20).map(({ trigger, command_name: command, response }) => {
    if (!command && response) {
      return `**${trigger}** → ${response.replace(/\s+/g, ' ').slice(0, 100)}`;
    }
    return `**${trigger}** → \`${commandPrefix}${command}${commandSyntax[command] ? ` ${commandSyntax[command]}` : ''}\``;
  });
  if (!configuredLines.length) configuredLines.push('No shortcuts are configured for this server.');
  if (shortcuts.length > configuredLines.length) {
    configuredLines.push(`...and ${shortcuts.length - configuredLines.length} more.`);
  }
  return [
    '**Commands available for shortcuts**',
    availableCommands,
    '',
    '**Configured shortcuts**',
    configuredLines.join('\n')
  ].join('\n').slice(0, 1900);
}

function reportGuildAuditLog(guild, embed, eventName, auditContext) {
  (async () => {
    if (auditContext && statements.getAuditLogChannel.get(guild.id)) {
      let entry = null;
      let lookupFailed = false;
      try {
        entry = await findRecentAuditLogEntryForEvent(guild, auditContext);
      } catch (error) {
        lookupFailed = true;
        console.error(`Could not identify the actor for ${eventName} in server ${guild.id}:`, error);
      }
      embed.addFields(auditExecutorFields(
        entry,
        auditContext.actorFieldName
      ));
      if (!entry && lookupFailed) {
        embed.addFields({
          name: 'Actor details',
          value: 'Could not read the audit log. Ensure the bot has View Audit Log permission.'
        });
      } else if (!entry && auditContext.missingActorNote) {
        embed.addFields({ name: 'Actor details', value: auditContext.missingActorNote });
      } else if (!entry) {
        embed.addFields({
          name: 'Actor details',
          value: 'Not found in recent audit logs. Ensure the bot has View Audit Log permission.'
        });
      }
    }
    await sendGuildAuditLog(guild, embed);
  })().catch(error => {
    console.error(`Could not send ${eventName} audit log for server ${guild.id}:`, error);
  });
}

function memberAuditFields(member) {
  const user = member.user;
  const username = user.username || user.tag || 'Unknown user';
  return [
    { name: 'Username', value: username },
    { name: 'User ID', value: user.id }
  ];
}

function formatRoleList(roles) {
  return roles.length
    ? roles.map(role => `${role.name} (${role.id})`).join('\n')
    : 'None';
}

function formatChannel(channel) {
  return `${channel.name || 'unnamed'} (${channel.id})`;
}

function changedFields(before, after, properties) {
  return properties
    .filter(([property]) => {
      const beforeValue = before[property];
      const afterValue = after[property];
      if (Array.isArray(beforeValue) && Array.isArray(afterValue)) {
        return beforeValue.length !== afterValue.length ||
          beforeValue.some((value, index) => value !== afterValue[index]);
      }
      return beforeValue !== afterValue;
    })
    .map(([property, label, format = value => String(value ?? 'None')]) => ({
      name: label,
      value: `Before: ${format(before[property])}\nAfter: ${format(after[property])}`
    }));
}

function sendGuildDm(user, guildId, payload) {
  return user.send(localizePayload(payload, getGuildLanguage(guildId)));
}

function localizeInteraction(interaction) {
  for (const method of ['reply', 'editReply', 'followUp', 'update', 'showModal']) {
    if (typeof interaction[method] !== 'function') continue;
    const original = interaction[method].bind(interaction);
    interaction[method] = (payload, ...args) => original(
      localizePayload(payload, getGuildLanguage(interaction.guildId)),
      ...args
    );
  }
  localizeChannel(interaction.channel);
}

function localizeMessage(message) {
  const reply = message.reply.bind(message);
  message.reply = (payload, ...args) => reply(
    localizePayload(payload, getGuildLanguage(message.guildId)),
    ...args
  );
  localizeChannel(message.channel);
}

function getCurrency(name) {
  const currency = statements.getCurrency.get(name.trim());
  if (!currency) throw new Error(`Currency "${name}" was not found. Use /currency list or ${commandPrefix}currency to open the currency menu.`);
  return currency;
}

function requireManager(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    throw new Error('You need the Manage Server permission to do that.');
  }
}

function requireMessageManager(message) {
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    throw new Error('You need the Manage Server permission to do that.');
  }
}

function requireAdministrator(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    throw new Error('You need the Administrator permission to do that.');
  }
}

function requireMessageAdministrator(message) {
  if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
    throw new Error('You need the Administrator permission to do that.');
  }
}

async function getExchangeApprovalChannel(guildId) {
  const setting = statements.getExchangeApprovalChannel.get(guildId);
  if (!setting) {
    throw new Error(`Exchange approvals are not configured. An administrator must set the approval channel with ${commandPrefix}ex.`);
  }
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);
  const channel = await guild.channels.fetch(setting.exchange_approval_channel_id);
  if (!channel?.isTextBased() || typeof channel.send !== 'function') {
    throw new Error('The configured exchange approval channel is unavailable or cannot receive messages. An administrator must set it again with !ex.');
  }
  const botMember = guild.members.me || await guild.members.fetchMe();
  const permissions = channel.permissionsFor(botMember);
  if (!permissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks
  ])) {
    throw new Error('The bot needs View Channel, Send Messages, and Embed Links permissions in the exchange approval channel.');
  }
  return localizeChannel(channel);
}

async function sendExchangeApproval(guildId, payload) {
  const channel = await getExchangeApprovalChannel(guildId);
  return channel.send({ ...payload, allowedMentions: { parse: [] } });
}

async function notifyPrefixExchangePending(message) {
  const notice = 'Your exchange is now pending and waiting for an administrator to approve or reject it.';
  try {
    await sendGuildDm(message.author, message.guildId, memberDmPayload(message.author.id, notice));
  } catch (error) {
    console.error(`Could not DM exchange requester ${message.author.id}:`, error.message);
    await message.reply({
      content: `${notice} I could not DM you, so this notice is visible here.`,
      allowedMentions: { parse: [], repliedUser: false }
    });
  }
}

function validateLabel(value, label, maxLength) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || /[\u0000-\u001f\u007f]/u.test(trimmed)) {
    throw new Error(`${label} must be 1-${maxLength} characters and cannot contain control characters.`);
  }
  return trimmed;
}

function validateEmoji(value) {
  const emoji = value.trim();
  if (!emoji || emoji.toLowerCase() === 'null' || emoji.length > 64 || /[\u0000-\u001f\u007f]/u.test(emoji)) {
    throw new Error('Enter a valid Unicode emoji or Discord custom emoji.');
  }
  return emoji;
}

function currencyEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

async function registerTicketChannel(channel) {
  if (!channel.guild || !channel.isTextBased() || typeof channel.send !== 'function' ||
      !isTicketChannel(channel)) return;

  const botMember = channel.guild.members.me || await channel.guild.members.fetchMe();
  const permissions = channel.permissionsFor(botMember);
  if (!permissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks
  ])) {
    throw new Error('The bot needs View Channel, Send Messages, and Embed Links permissions in this ticket channel.');
  }

  statements.registerTicket.run(channel.id, channel.guild.id);
  const ticket = statements.getTicket.get(channel.id, channel.guild.id);
  if (ticket.prompt_message_id) {
    try {
      await channel.messages.fetch(ticket.prompt_message_id);
      return;
    } catch (error) {
      if (error.code !== 10008) throw error;
    }
  }

  localizeChannel(channel);
  const prompt = await channel.send({
    embeds: [currencyEmbed(
      'Ticket ready to claim',
      'An administrator can claim this ticket with the button below. The first successful claim earns 1 leaderboard point.'
    )],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket-claim:${channel.id}`)
        .setLabel('Claim ticket')
        .setStyle(ButtonStyle.Primary)
    )],
    allowedMentions: { parse: [] }
  });
  statements.setTicketPrompt.run(prompt.id, channel.id, channel.guild.id);
}

async function setupGuild(guild, approvalChannel = null, alertChannel = null) {
  const channelsToConfigure = [
    [approvalChannel, 'exchange approvals'],
    [alertChannel, 'public scam alerts']
  ];
  const botMember = guild.members.me || await guild.members.fetchMe();
  for (const [channel, label] of channelsToConfigure) {
    if (!channel) continue;
    if (channel.guildId !== guild.id || !channel.isTextBased() ||
        typeof channel.send !== 'function') {
      throw new Error(`Choose a text channel from this server for ${label}.`);
    }
    const permissions = channel.permissionsFor(botMember);
    if (!permissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks
    ])) {
      throw new Error(`The bot needs View Channel, Send Messages, and Embed Links permissions in the ${label} channel.`);
    }
  }
  if (approvalChannel) {
    statements.setExchangeApprovalChannel.run(guild.id, approvalChannel.id);
  }
  if (alertChannel) {
    statements.setScamAlertChannel.run(guild.id, alertChannel.id);
  }
  await guild.channels.fetch();
  const ticketChannels = [...guild.channels.cache.values()].filter(channel =>
    channel.guildId === guild.id && channel.isTextBased() && isTicketChannel(channel)
  );
  const failures = [];
  let scanned = 0;
  for (const channel of ticketChannels) {
    try {
      await registerTicketChannel(channel);
      scanned++;
    } catch (error) {
      failures.push(`${channel.name}: ${error.message}`);
      console.error(`Setup could not register ticket channel ${channel.id}:`, error);
    }
  }

  const approvalSetting = statements.getExchangeApprovalChannel.get(guild.id);
  const alertSetting = statements.getScamAlertChannel.get(guild.id);
  const details = [
    `Exchange approvals: ${approvalSetting ? `<#${approvalSetting.exchange_approval_channel_id}>` : '**not configured**'}`,
    `Scam safety alerts: ${alertSetting ? `<#${alertSetting.scam_alert_channel_id}>` : '**not configured**'}`,
    `Ticket channels detected: **${ticketChannels.length}**; claim buttons checked: **${scanned}**`,
    `Ticket detection matches channel or category names containing ticket, support, or case.`,
    'Message points and the games leaderboard are active automatically.'
  ];
  if (failures.length) {
    details.push('', `Could not set up ${failures.length} ticket channel(s):`, ...failures.slice(0, 5));
    if (failures.length > 5) details.push(`...and ${failures.length - 5} more. Check the bot logs.`);
  }
  return {
    embeds: [currencyEmbed('Bot setup', details.join('\n'))],
    allowedMentions: { parse: [] }
  };
}

async function configureAuditLogChannel(guild, channel) {
  if (!channel || channel.guildId !== guild.id ||
      !channel.isTextBased() || typeof channel.send !== 'function') {
    throw new Error('Choose a text channel from this server for action logs.');
  }
  const botMember = guild.members.me || await guild.members.fetchMe();
  const permissions = channel.permissionsFor(botMember);
  if (!permissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks
  ])) {
    throw new Error('The bot needs View Channel, Send Messages, and Embed Links permissions in the action log channel.');
  }
  statements.setAuditLogChannel.run(guild.id, channel.id);
  return `Server action logs will be sent to <#${channel.id}>.`;
}

async function fetchScamReportChannel(guild, channelId) {
  const reportChannel = await guild.channels.fetch(channelId);
  if (!reportChannel || reportChannel.guildId !== guild.id ||
      !reportChannel.isTextBased() || typeof reportChannel.send !== 'function') {
    throw new Error('The configured scam-alert channel is unavailable or cannot receive messages.');
  }

  const botMember = guild.members.me || await guild.members.fetchMe();
  const permissions = reportChannel.permissionsFor(botMember);
  if (!permissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks
  ])) {
    throw new Error('The bot needs View Channel, Send Messages, and Embed Links permissions in the public scam-alert channel.');
  }
  return reportChannel;
}

async function handleScamReportButton(interaction) {
  const [, action, reportChannelId, ...extra] = interaction.customId.split(':');
  if (action !== 'open' || extra.length || !/^\d{17,20}$/.test(reportChannelId || '') || !interaction.guild) {
    throw new Error('This scam report button is invalid or expired.');
  }
  const configuredChannel = statements.getScamAlertChannel.get(interaction.guildId);
  if (configuredChannel?.scam_alert_channel_id !== reportChannelId) {
    throw new Error('This report form is outdated. Ask an administrator to post a new one.');
  }
  await fetchScamReportChannel(interaction.guild, reportChannelId);
  await interaction.showModal(buildScamReportModal(reportChannelId));
}

async function handleScamReportModal(interaction) {
  const [, action, reportChannelId, ...extra] = interaction.customId.split(':');
  if (action !== 'submit' || extra.length || !/^\d{17,20}$/.test(reportChannelId || '') || !interaction.guild) {
    throw new Error('This scam report form is invalid or expired.');
  }
  const story = interaction.fields.getTextInputValue('story').trim();
  if (story.length < 10 || story.length > MAX_SCAM_REPORT_LENGTH) {
    throw new Error(`Your report must be between 10 and ${MAX_SCAM_REPORT_LENGTH} characters.`);
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const configuredChannel = statements.getScamAlertChannel.get(interaction.guildId);
  if (configuredChannel?.scam_alert_channel_id !== reportChannelId) {
    throw new Error('This report form is outdated. Ask an administrator to post a new one.');
  }
  const reportChannel = await fetchScamReportChannel(interaction.guild, reportChannelId);
  localizeChannel(reportChannel);
  await reportChannel.send(buildPublicScamReportSubmission(interaction.user, story));
  await interaction.editReply({
    content: `Your report was posted publicly in <#${reportChannel.id}>. No automatic action was taken.`,
    allowedMentions: { parse: [] }
  });
}

async function findNextAdminCandidate(guild, currentMemberId = null) {
  await guild.members.fetch();
  return [...guild.members.cache.values()]
    .filter(member => !member.user.bot && getAdminRoles(member).length > 0 &&
      (!currentMemberId || member.id > currentMemberId))
    .sort((left, right) => left.id.localeCompare(right.id))[0] || null;
}

async function buildAdminReviewForNext(guild, actorId, currentMemberId = null) {
  const member = await findNextAdminCandidate(guild, currentMemberId);
  if (!member) return buildNoAdminMembersPayload();
  const adminRoles = getAdminRoles(member);
  const botMember = guild.members.me;
  let promotionRole = getNextPromotionRole(member, guild.roles.cache);
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles) ||
      member.roles.highest.position >= botMember.roles.highest.position ||
      (promotionRole && promotionRole.position >= botMember.roles.highest.position)) {
    promotionRole = null;
  }
  const canRemoveAdminRoles = Boolean(
    botMember?.permissions.has(PermissionFlagsBits.ManageRoles) &&
    member.roles.highest.position < botMember.roles.highest.position &&
    adminRoles.every(role => role.position < botMember.roles.highest.position && !role.managed)
  );
  return buildAdminReviewPayload(member, adminRoles, promotionRole, actorId, canRemoveAdminRoles);
}

function assertBotCanManageRole(guild, role, member) {
  const botMember = guild.members.me;
  if (!botMember) throw new Error('The bot’s server member is unavailable.');
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('The bot needs the Manage Roles permission to change member roles.');
  }
  if (role.managed || role.position >= botMember.roles.highest.position) {
    throw new Error(`The bot cannot manage the role **${role.name}**. Move it below the bot’s highest role.`);
  }
  if (member && member.roles.highest.position >= botMember.roles.highest.position) {
    throw new Error('The bot cannot manage this member because their highest role is at or above the bot’s highest role.');
  }
}

async function handleAdminReviewButton(interaction) {
  const [, action, actorId, memberId, ...extra] = interaction.customId.split(':');
  if (extra.length || !['promote', 'skip', 'dm', 'remove'].includes(action) ||
      !actorId || !memberId || !interaction.guild || interaction.message.author.id !== client.user.id) {
    throw new Error('This administrator review button is invalid.');
  }
  requireAdministrator(interaction);
  if (interaction.user.id !== actorId) {
    throw new Error('Only the administrator who started this review can use its buttons.');
  }
  if (action === 'dm') {
    await interaction.showModal(buildAdminDmModal(actorId, memberId));
    return;
  }

  const member = await interaction.guild.members.fetch(memberId).catch(error => {
    if (error.code === 10007) return null;
    throw error;
  });
  if (action !== 'skip' && !member) throw new Error('That member is no longer in this server.');
  if (action === 'promote') {
    const role = getNextPromotionRole(member, interaction.guild.roles.cache);
    if (!role) throw new Error('There is no higher role available to promote this member to.');
    assertBotCanManageRole(interaction.guild, role, member);
    await member.roles.add(role, `Administrator promotion by ${interaction.user.tag}`);
  } else if (action === 'remove') {
    const adminRoles = getAdminRoles(member);
    if (!adminRoles.length) throw new Error('This member no longer has a moderation role.');
    for (const role of adminRoles) assertBotCanManageRole(interaction.guild, role, member);
    await member.roles.remove(adminRoles, `Moderation roles removed by ${interaction.user.tag}`);
  }

  await interaction.update(await buildAdminReviewForNext(
    interaction.guild,
    actorId,
    memberId
  ));
}

async function handleAdminDmModal(interaction) {
  const [, actorId, memberId, ...extra] = interaction.customId.split(':');
  if (extra.length || !actorId || !memberId || !interaction.guild) {
    throw new Error('This member DM form is invalid.');
  }
  requireAdministrator(interaction);
  if (interaction.user.id !== actorId) {
    throw new Error('Only the administrator who started this review can use its DM form.');
  }
  const member = await interaction.guild.members.fetch(memberId);
  await sendGuildDm(member, interaction.guildId, {
    content: interaction.fields.getTextInputValue('message').trim(),
    allowedMentions: { parse: [] }
  });
  await interaction.update(await buildAdminReviewForNext(
    interaction.guild,
    actorId,
    memberId
  ));
}

async function handleTicketClaim(interaction) {
  const [, channelId, ...extra] = interaction.customId.split(':');
  if (extra.length || !channelId || !interaction.guildId || interaction.channelId !== channelId) {
    throw new Error('This ticket claim button is invalid.');
  }
  requireAdministrator(interaction);
  const ticket = statements.getTicket.get(channelId, interaction.guildId);
  if (!ticket) throw new Error('This ticket is not registered for claiming.');

  const result = transaction(() => {
    const claimed = statements.claimTicket.run(interaction.user.id, channelId, interaction.guildId);
    if (claimed.changes) statements.addCommunityPoints.run(interaction.guildId, interaction.user.id, 1);
    return claimed.changes;
  });
  if (!result) {
    const current = statements.getTicket.get(channelId, interaction.guildId);
    await interaction.reply({
      content: current?.claimed_by
        ? `This ticket was already claimed by <@${current.claimed_by}>.`
        : 'This ticket has already been claimed.',
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return;
  }

  await interaction.update({
    embeds: [currencyEmbed('Ticket claimed', `Claimed by <@${interaction.user.id}> · **1 point** added to their score.`)],
    components: [],
    allowedMentions: { parse: [] }
  });
}

async function handleGamesButton(interaction) {
  const parts = interaction.customId.split(':');
  const [, action, game, choiceOrOwner, ownerId, ...extra] = parts;
  if (extra.length || (action !== 'start' && action !== 'play')) {
    throw new Error('This game button is invalid.');
  }
  const expectedOwnerId = action === 'start' ? choiceOrOwner : ownerId;
  if (!expectedOwnerId || interaction.user.id !== expectedOwnerId) {
    await interaction.reply({
      content: 'Only the member who opened these games can use the buttons.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  if (action === 'start') {
    await interaction.update(buildGameChoices(game, expectedOwnerId));
    return;
  }

  const playerChoice = choiceOrOwner;
  const botChoice = randomGameChoice(game);
  const result = resolveGameResult(game, playerChoice, botChoice);
  if (result === 'win') statements.addCommunityPoints.run(interaction.guildId, expectedOwnerId, 1);
  await interaction.update(buildGameResult(game, playerChoice, botChoice, result, expectedOwnerId));
}

function getLeaderboardPayload(guildId) {
  return buildLeaderboardPayload(statements.communityLeaderboard.all(guildId));
}

async function handleRoller(interaction) {
  if (!interaction.guildId) throw new Error('The roller can only be used in a server.');

  const action = interaction.options.getSubcommand();
  const mode = interaction.options.getString('mode');
  if (action !== 'roll') requireManager(interaction);

  if (action === 'add') {
    const prize = validateLabel(interaction.options.getString('prize'), 'Prize', 100);
    const points = interaction.options.getInteger('points') || 1;
    const result = statements.addRollerPrize.run(
      interaction.guildId,
      mode,
      prize,
      points,
      interaction.user.id
    );
    if (result.changes === 0) {
      throw new Error(`“${prize}” is already in the ${mode} roller. Use /roller points to change its weight.`);
    }
    await interaction.reply({
      content: `Added **${prize}** to the ${mode} roller with ${points} point(s).`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return;
  }

  if (action === 'points') {
    const prize = validateLabel(interaction.options.getString('prize'), 'Prize', 100);
    const points = interaction.options.getInteger('points');
    const result = statements.setRollerPrizePoints.run(points, interaction.guildId, mode, prize);
    if (result.changes === 0) throw new Error(`“${prize}” was not found in the ${mode} roller.`);
    await interaction.reply({
      content: `Set **${prize}** in the ${mode} roller to ${points} point(s).`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return;
  }

  if (action === 'remove') {
    const prize = validateLabel(interaction.options.getString('prize'), 'Prize', 100);
    const result = statements.removeRollerPrize.run(interaction.guildId, mode, prize);
    if (result.changes === 0) throw new Error(`“${prize}” was not found in the ${mode} roller.`);
    await interaction.reply({
      content: `Removed **${prize}** from the ${mode} roller.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return;
  }

  if (action === 'list') {
    const prizes = statements.listRollerPrizes.all(interaction.guildId, mode);
    const pageSize = 10;
    const pageCount = Math.max(1, Math.ceil(prizes.length / pageSize));
    const page = interaction.options.getInteger('page') || 1;
    if (page > pageCount) throw new Error(`That page does not exist. The ${mode} roller has ${pageCount} page(s).`);

    const totalPoints = totalRollPoints(prizes);
    const pagePrizes = prizes.slice((page - 1) * pageSize, page * pageSize);
    const listing = pagePrizes.map(prize =>
      `• **${prize.prize}** — ${prize.points} point(s), ${getRollChancePercent(prize.points, totalPoints).toFixed(2)}%`
    ).join('\n');
    await interaction.reply({
      content: `**${mode[0].toUpperCase()}${mode.slice(1)} roller prizes — page ${page}/${pageCount}**\n${listing || 'No prizes have been added yet.'}`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return;
  }

  if (action === 'roll') {
    const selectedMember = interaction.options.getUser('member');
    if (selectedMember && selectedMember.id !== interaction.user.id) requireManager(interaction);
    const winner = selectedMember || interaction.user;
    if (winner.bot) throw new Error('A prize cannot be rolled for a bot account.');
    const prizes = statements.listRollerPrizes.all(interaction.guildId, mode);
    if (!prizes.length) {
      await interaction.reply({
        content: rollerSetupMessage(mode),
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      });
      return;
    }
    const prize = selectRollPrize(prizes);
    await interaction.reply({
      content: `🎉 <@${winner.id}> won **${prize.prize}** from the **${mode}** roller!`,
      allowedMentions: { users: [winner.id], parse: [] }
    });
    return;
  }

  throw new Error('That roller action is not supported.');
}

function pagedList(kind, page, ownerId, memberId = '-') {
  if (kind !== 'currency') {
    throw new Error('That list type is not supported.');
  }
  const entries = statements.listCurrencies.all().map(currency =>
    `${currency.emoji} **${currency.name}** — ${formatPrice(currency.price_micros)} ${BASE_CURRENCY_NAME} per unit`
  );
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
  if (!Number.isInteger(page) || page < 0 || page >= pageCount) {
    throw new Error('That list page does not exist.');
  }
  const pageEntries = entries.slice(page * pageSize, (page + 1) * pageSize);
  const embed = currencyEmbed('Available currencies', pageEntries.join('\n') || 'No entries to show.');
  if (pageCount > 1) embed.setFooter({ text: `Page ${page + 1} of ${pageCount}` });

  const components = pageCount > 1
    ? [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`page:${kind}:${page - 1}:${ownerId}:${memberId}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`page:${kind}:${page + 1}:${ownerId}:${memberId}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === pageCount - 1)
    )]
    : [];
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

function listGiveawaysPayload(guildId) {
  const giveaways = statements.listActiveGiveaways.all(guildId).slice(0, 20);
  const description = giveaways.map(giveaway => {
    const prize = giveaway.prize.length > 80 ? `${giveaway.prize.slice(0, 77)}...` : giveaway.prize;
    return `**${prize}** — ${giveaway.winner_count} winner(s), ends <t:${Math.floor(new Date(giveaway.ends_at).getTime() / 1000)}:R>\nID: \`${giveaway.id}\` • <#${giveaway.channel_id}>`;
  }).join('\n\n') || 'There are no active giveaways.';
  return {
    embeds: [currencyEmbed('Active giveaways', description)],
    allowedMentions: { parse: [] }
  };
}

async function createGiveaway(channel, creatorId, fields) {
  const durationMs = parseGiveawayDuration(fields.duration);
  const prize = validateLabel(fields.prize, 'Prize', 200);
  const winnerCount = Number(fields.winners);
  if (!Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > MAX_WINNERS) {
    throw new Error(`Winner count must be between 1 and ${MAX_WINNERS}.`);
  }
  const entryEmoji = validateEmoji(fields.emoji);
  normalizeGiveawayEmoji(entryEmoji);
  const guild = channel.guild;
  const botMember = guild.members.me || await guild.members.fetchMe();
  const permissions = channel.permissionsFor(botMember);
  if (!permissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.ReadMessageHistory
  ])) {
    throw new Error('The bot needs View Channel, Send Messages, Embed Links, Add Reactions, and Read Message History permissions here.');
  }

  const giveaway = {
    id: randomUUID(),
    guild_id: guild.id,
    channel_id: channel.id,
    prize,
    winner_count: winnerCount,
    ends_at: new Date(Date.now() + durationMs).toISOString(),
    entry_emoji: entryEmoji,
    status: 'active',
    winner_ids: '[]'
  };
  localizeChannel(channel);
  const message = await channel.send({
    embeds: [makeGiveawayEmbed(giveaway)],
    allowedMentions: { parse: [] }
  });
  try {
    statements.insertGiveaway.run(
      giveaway.id,
      guild.id,
      channel.id,
      message.id,
      prize,
      winnerCount,
      giveaway.ends_at,
      entryEmoji,
      creatorId
    );
    await message.react(entryEmoji);
  } catch (error) {
    statements.deleteGiveaway.run(giveaway.id, guild.id);
    await message.delete().catch(deleteError => {
      console.error(`Could not remove incomplete giveaway message ${message.id}:`, deleteError);
    });
    throw error;
  }
  return giveaway;
}

async function endGiveawayInDiscord(guildId, giveawayId, force = false) {
  const existing = statements.getGiveaway.get(giveawayId, guildId);
  if (!existing) throw new Error('That giveaway was not found in this server.');
  if (existing.status !== 'active') throw new Error('That giveaway has already ended.');
  if (!force && new Date(existing.ends_at).getTime() > Date.now()) return null;
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);
  const channel = await guild.channels.fetch(existing.channel_id);
  if (!channel?.isTextBased() || typeof channel.messages?.fetch !== 'function') {
    throw new Error('The giveaway channel is unavailable.');
  }
  const message = await channel.messages.fetch(existing.message_id);
  const result = endGiveawayRecord(guildId, giveawayId, force);
  if (!result) return null;
  const endedGiveaway = { ...result.giveaway, status: 'ended', winner_ids: JSON.stringify(result.winners) };
  await message.edit(localizePayload({
    embeds: [makeGiveawayEmbed(endedGiveaway, true)],
    allowedMentions: { parse: [] }
  }, getGuildLanguage(guildId)));
  const content = result.winners.length
    ? `Giveaway ended! Winner(s): ${result.winners.map(userId => `<@${userId}>`).join(', ')} — **${result.giveaway.prize}**`
    : `Giveaway ended with no eligible entrants. Prize: **${result.giveaway.prize}**`;
  localizeChannel(channel);
  await channel.send({
    content,
    allowedMentions: { parse: [], users: result.winners }
  });
  return result;
}

async function rerollGiveawayInDiscord(guildId, giveawayId) {
  const result = rerollGiveawayRecord(guildId, giveawayId);
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);
  const channel = await guild.channels.fetch(result.giveaway.channel_id);
  if (!channel?.isTextBased() || typeof channel.send !== 'function') {
    throw new Error('The giveaway channel is unavailable.');
  }
  localizeChannel(channel);
  await channel.send({
    content: `Rerolled winner for **${result.giveaway.prize}**: <@${result.winner}>`,
    allowedMentions: { parse: [], users: [result.winner] }
  });
  return result;
}

async function handleGiveawayModal(interaction) {
  const [, ownerId, guildId, channelId, ...extra] = interaction.customId.split(':');
  if (extra.length || !ownerId || !guildId || !channelId) throw new Error('This giveaway setup form is invalid.');
  requireAdministrator(interaction);
  if (interaction.user.id !== ownerId || interaction.guildId !== guildId) {
    throw new Error('Only the administrator who opened this form can create this server’s giveaway.');
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const channel = await interaction.guild.channels.fetch(channelId);
  if (!channel?.isTextBased() || typeof channel.send !== 'function') {
    throw new Error('The giveaway channel is unavailable or cannot receive messages.');
  }
  const giveaway = await createGiveaway(channel, interaction.user.id, {
    duration: interaction.fields.getTextInputValue('duration'),
    prize: interaction.fields.getTextInputValue('prize'),
    winners: interaction.fields.getTextInputValue('winners'),
    emoji: interaction.fields.getTextInputValue('emoji')
  });
  await interaction.editReply({
    content: `Giveaway created in <#${channel.id}>. ID: \`${giveaway.id}\`.`
  });
}

async function handleModeration(interaction) {
  requireAdministrator(interaction);
  const action = interaction.options.getSubcommand();
  const guild = interaction.guild;
  if (!guild) throw new Error('Moderation commands can only be used in a server.');
  const reason = interaction.options.getString('reason')?.trim() || `Action by ${interaction.user.tag}`;

  if (action === 'unban') {
    const userId = interaction.options.getString('user_id').trim();
    if (!/^\d{17,20}$/.test(userId)) throw new Error('Enter a valid Discord user ID.');
    await guild.bans.remove(userId, reason);
    await interaction.reply({ content: `User \`${userId}\` was unbanned.`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (action === 'purge') {
    if (!interaction.channel || typeof interaction.channel.bulkDelete !== 'function') {
      throw new Error('Purge can only be used in a server text channel.');
    }
    const amount = interaction.options.getInteger('amount');
    const deleted = await interaction.channel.bulkDelete(amount, true);
    await interaction.reply({
      content: `Deleted ${deleted.size} recent message(s). Messages older than 14 days cannot be bulk-deleted.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const user = interaction.options.getUser('member');
  const member = await guild.members.fetch(user.id).catch(error => {
    if (action === 'ban' || action === 'warn') return null;
    throw error;
  });

  if (action === 'warn') {
    if (user.bot) throw new Error('Warnings cannot be sent to bot accounts.');
    await sendGuildDm(
      user,
      guild.id,
      memberDmPayload(user.id, `You have received a warning in **${guild.name}**. Reason: ${reason}`)
    );
    await interaction.reply({ content: `Warning DM sent to <@${user.id}>.`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (action === 'ban') {
    await guild.members.ban(user, {
      reason,
      deleteMessageSeconds: interaction.options.getInteger('delete_message_seconds') || 0
    });
    await interaction.reply({ content: `Banned <@${user.id}>.`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (!member) throw new Error('That member could not be found in this server.');
  if (action === 'timeout') {
    const duration = parseTimeoutDuration(interaction.options.getString('duration'));
    await member.timeout(duration, reason);
    await interaction.reply({ content: `Timed out <@${member.id}> for ${interaction.options.getString('duration')}.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (action === 'untimeout') {
    await member.timeout(null, reason);
    await interaction.reply({ content: `Removed the timeout for <@${member.id}>.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (action === 'kick') {
    await member.kick(reason);
    await interaction.reply({ content: `Kicked <@${member.id}>.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (action === 'role-add' || action === 'role-remove') {
    const role = interaction.options.getRole('role');
    const botMember = guild.members.me || await guild.members.fetchMe();
    if (role.id === guild.id || role.managed || role.position >= botMember.roles.highest.position) {
      throw new Error('That role is managed or is not below the bot’s highest role.');
    }
    if (action === 'role-add') await member.roles.add(role, `Role assigned by ${interaction.user.tag}`);
    else await member.roles.remove(role, `Role removed by ${interaction.user.tag}`);
    await interaction.reply({
      content: `${action === 'role-add' ? 'Added' : 'Removed'} **${role.name}** ${action === 'role-add' ? 'to' : 'from'} <@${member.id}>.`,
      flags: MessageFlags.Ephemeral
    });
  }
}

function makeExchangeEmbed(request, fromCurrency, toCurrency, requester) {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('Exchange request')
    .setDescription(`<@${request.requester_id}> requested a currency exchange.`)
    .addFields(
      { name: 'Member', value: `${requester.tag} (\`${request.requester_id}\`)`, inline: false },
      {
        name: 'Requested exchange',
        value: `${displayCurrencyEmoji(fromCurrency.emoji)} **${formatMinor(request.source_minor)} ${fromCurrency.name}**\n` +
          `→ ${displayCurrencyEmoji(toCurrency.emoji)} **${formatMinor(request.target_minor)} ${toCurrency.name}**`,
        inline: false
      },
      {
        name: 'Rate snapshot',
        value: `1 ${fromCurrency.name} = ${formatPrice(request.from_price_micros)} ${BASE_CURRENCY_NAME}\n` +
          `1 ${toCurrency.name} = ${formatPrice(request.to_price_micros)} ${BASE_CURRENCY_NAME}`,
        inline: true
      },
      { name: 'Request ID', value: `\`${request.id}\``, inline: true },
      { name: 'Status', value: 'Pending moderator approval', inline: false }
    )
    .setFooter({ text: 'The requested amount is reserved until this request is approved or rejected.' })
    .setTimestamp(new Date(`${request.created_at.replace(' ', 'T')}Z`));
}

function exchangeButtons(requestId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`exchange:${requestId}:approve`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`exchange:${requestId}:reject`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`exchange:${requestId}:message`)
      .setLabel('Send DM')
      .setStyle(ButtonStyle.Secondary)
  );
}

function addBalanceTransaction(userId, currencyId, delta, kind, relatedUserId, note) {
  changeBalance(userId, currencyId, delta);
  recordTransaction(userId, currencyId, delta, kind, relatedUserId, note);
}

function assertSufficientTransferBalance(userId, amount) {
  const currency = getCurrency(BASE_CURRENCY_NAME);
  if (getBalance(userId, currency.id) < amount) {
    throw new CommandInputError('You do not have enough balance to make this transfer.');
  }
}

function createPendingTransfer(request) {
  const now = Date.now();
  for (const [token, pending] of pendingTransfers) {
    if (pending.expiresAt <= now) {
      pendingTransfers.delete(token);
      clearTimeout(pending.expiryTimer);
      if (pending.promptMessage) {
        pending.promptMessage.delete().catch(error =>
          console.error(`Could not delete expired transfer captcha ${pending.promptMessage.id}:`, error)
        );
      }
    }
  }
  if ([...pendingTransfers.values()].some(pending =>
    pending.guildId === request.guildId &&
    pending.channelId === request.channelId &&
    pending.requesterId === request.requesterId
  )) {
    throw new Error('You already have a transfer verification pending in this channel.');
  }
  if (pendingTransfers.size >= MAX_PENDING_TRANSFERS) {
    throw new Error('Too many transfer verifications are pending. Try again shortly.');
  }
  const token = randomUUID();
  const pending = {
    ...request,
    captchaCode: generateTransferCaptchaCode(),
    expiresAt: now + TRANSFER_CAPTCHA_TTL_MS,
    expiryTimer: null,
    promptMessage: null
  };
  pending.expiryTimer = setTimeout(() => {
    if (pendingTransfers.get(token) !== pending) return;
    pendingTransfers.delete(token);
    if (pending.promptMessage) {
      pending.promptMessage.delete().catch(error =>
        console.error(`Could not delete expired transfer captcha ${pending.promptMessage.id}:`, error)
      );
    }
  }, TRANSFER_CAPTCHA_TTL_MS);
  pending.expiryTimer.unref();
  pendingTransfers.set(token, pending);
  return token;
}

async function assertTransferCaptchaPermissions(channel) {
  if (!channel?.guild || !channel.isTextBased() || typeof channel.send !== 'function') {
    throw new Error('Transfers need to be started in a server text channel.');
  }
  const botMember = channel.guild.members.me || await channel.guild.members.fetchMe();
  const permissions = channel.permissionsFor(botMember);
  if (!permissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.ManageMessages
  ])) {
    throw new Error('The bot needs View Channel, Send Messages, Attach Files, and Manage Messages permissions here to run transfer verification.');
  }
}

function consumePendingTransfer(pending) {
  for (const [token, current] of pendingTransfers) {
    if (current === pending) {
      pendingTransfers.delete(token);
      clearTimeout(pending.expiryTimer);
      return;
    }
  }
}

async function deleteTransferCaptchaMessages(pending, answerMessage) {
  const deletions = [
    ['captcha image', pending.promptMessage],
    ['captcha answer', answerMessage]
  ];
  const failures = [];
  for (const [label, target] of deletions) {
    if (!target) continue;
    try {
      await target.delete();
    } catch (error) {
      failures.push(label);
      console.error(`Could not delete transfer ${label} ${target.id}:`, error);
    }
  }
  return failures;
}

async function handleTransferCaptchaAnswer(message) {
  if (!message.guild || message.author.bot || message.webhookId) return false;
  const pending = [...pendingTransfers.values()].find(candidate =>
    candidate.guildId === message.guildId &&
    candidate.channelId === message.channelId &&
    candidate.requesterId === message.author.id
  );
  if (!pending) return false;

  consumePendingTransfer(pending);
  const correct = message.content.trim().toUpperCase() === pending.captchaCode;
  const deletionFailures = await deleteTransferCaptchaMessages(pending, message);
  let response;
  if (correct) {
    try {
      response = await completeTransfer(pending);
    } catch (error) {
      response = error.message || 'The transfer could not be completed.';
      console.error('Verified transfer failed:', error);
    }
  } else {
    response = 'The verification code was incorrect. The transfer was cancelled; start it again.';
  }
  if (deletionFailures.length) {
    response += ` I could not delete the ${deletionFailures.join(' and ')}; check the bot’s Manage Messages permission.`;
  }
  await message.channel.send({
    content: response,
    allowedMentions: { parse: [] }
  });
  return true;
}

async function handleBalance(interaction) {
  const member = interaction.options.getUser('member') || interaction.user;
  const currencyName = interaction.options.getString('currency');
  if (member.id !== interaction.user.id) requireManager(interaction);

  const currency = getCurrency(currencyName || BASE_CURRENCY_NAME);
  await interaction.reply({
    ...buildWalletPayload(
      member,
      currency,
      getBalance(member.id, currency.id),
      statements.getGuildLanguage.get(interaction.guildId)?.language || 'en'
    ),
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] }
  });
}

async function createProfilePayload(user, language = 'en') {
  const currency = getCurrency(BASE_CURRENCY_NAME);
  const balance = getBalance(user.id, currency.id);
  const profilePeak = statements.getProfilePeak.get(user.id)?.highest_secrets_minor ?? balance;
  const rankRow = statements.profileRank.get(currency.id, user.id, currency.id);
  const rank = balance > 0n ? rankRow.users_ahead + 1 : null;
  const image = await buildProfileCard(user, balance, rank, language, profilePeak);
  return {
    files: [new AttachmentBuilder(image, { name: 'profile.png' })],
    embeds: [{
      color: 0x1e293b,
      image: { url: 'attachment://profile.png' }
    }],
    allowedMentions: { parse: [] }
  };
}

async function handleProfile(interaction) {
  const user = interaction.options.getUser('member') || interaction.user;
  await interaction.deferReply();
  await interaction.editReply(await createProfilePayload(user, getGuildLanguage(interaction.guildId)));
}

function getOwnerCurrencyStats(currencyId) {
  const balances = statements.ownerCurrencyBalances.all(currencyId);
  const issued = statements.ownerIssuedCurrencyTransactions.all(currencyId);
  return {
    total_minor: balances.reduce((total, balance) => total + balance.amount_minor, 0n),
    holder_count: BigInt(balances.length),
    issued_minor: issued.reduce((total, transaction) => total + transaction.amount_minor, 0n)
  };
}

const ownerServerInvites = new Map();
const OWNER_SERVER_PAGE_SIZE = 10;

async function createOwnerServerDetails(guild) {
  let ownerName = 'Unknown';
  try {
    const owner = await guild.fetchOwner();
    ownerName = owner.displayName || owner.user.globalName || owner.user.username;
  } catch (error) {
    console.error(`Could not fetch owner for server ${guild.id}:`, error);
  }

  let inviteUrl = ownerServerInvites.get(guild.id) || null;
  if (!inviteUrl) {
    try {
      const botMember = guild.members.me || await guild.members.fetchMe();
      const channel = guild.channels.cache.find(candidate =>
        typeof candidate.createInvite === 'function' &&
        candidate.permissionsFor(botMember)?.has(PermissionFlagsBits.CreateInstantInvite)
      );
      if (channel) {
        const invite = await channel.createInvite({
          maxAge: 0,
          maxUses: 0,
          unique: true,
          reason: 'Permanent invite requested from the bot owner dashboard'
        });
        inviteUrl = `https://discord.gg/${invite.code}`;
        ownerServerInvites.set(guild.id, inviteUrl);
      }
    } catch (error) {
      console.error(`Could not create an invite for server ${guild.id}:`, error);
    }
  }

  return {
    id: guild.id,
    name: guild.name,
    memberCount: guild.memberCount,
    ownerId: guild.ownerId,
    ownerName,
    inviteUrl
  };
}

async function createOwnerServersPage(page, ownerId) {
  const guilds = [...client.guilds.cache.values()]
    .sort((a, b) => a.name.localeCompare(b.name));
  const pageCount = Math.max(1, Math.ceil(guilds.length / OWNER_SERVER_PAGE_SIZE));
  if (!Number.isInteger(page) || page < 0 || page >= pageCount) {
    throw new Error('That server list page does not exist.');
  }
  const pageGuilds = guilds.slice(page * OWNER_SERVER_PAGE_SIZE, (page + 1) * OWNER_SERVER_PAGE_SIZE);
  const details = await Promise.all(pageGuilds.map(createOwnerServerDetails));
  return buildOwnerServersPage(details, guilds.length, page, ownerId);
}

async function handleOwner(interaction) {
  requireBotOwner(interaction.user.id);
  await interaction.reply({ ...buildOwnerHome(interaction.user.id), flags: MessageFlags.Ephemeral });
}

async function handleAdmin(interaction) {
  requireBotOwner(interaction.user.id);
  await interaction.reply({
    ...buildAdminDashboard(interaction.user.id, 0, commandPrefix),
    flags: MessageFlags.Ephemeral
  });
}

async function replyAdminCommandUsage(interaction, command) {
  const commandName = command.subcommand
    ? `/${command.commandName} ${command.subcommand}`
    : command.label;
  await interaction.reply({
    content: `**${commandName}** needs options to run. Use ${commandName} directly and fill in its required options.`,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] }
  });
}

async function handleAdminCommand(interaction, command) {
  requireBotOwner(interaction.user.id);
  if (!command) throw new Error('This admin dashboard command button is invalid.');

  const name = command.prefixCommand || command.commandName;
  const action = command.subcommand;
  if (name === 'admin') {
    await interaction.reply({
      ...buildAdminDashboard(interaction.user.id, 0, commandPrefix),
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  if (name === 'help') {
    await interaction.reply({ ...buildHelpHome(interaction.user.id, commandPrefix), flags: MessageFlags.Ephemeral });
    return;
  }
  if (name === 'setup') {
    requireAdministrator(interaction);
    await interaction.reply({
      ...await setupGuild(interaction.guild, null, null),
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  if (name === 'up') {
    requireAdministrator(interaction);
    await interaction.reply({
      ...await buildAdminReviewForNext(interaction.guild, interaction.user.id),
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  if (name === 'balance' || name === 'b') {
    const currency = getCurrency(BASE_CURRENCY_NAME);
    await interaction.reply({
      ...buildWalletPayload(
        interaction.user,
        currency,
        getBalance(interaction.user.id, currency.id),
        statements.getGuildLanguage.get(interaction.guildId)?.language || 'en'
      ),
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  if (name === 'profile' || name === 'p') {
    await interaction.reply({
      ...await createProfilePayload(interaction.user),
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  if (name === 'games') {
    await interaction.reply({ ...buildGamesHome(interaction.user.id), flags: MessageFlags.Ephemeral });
    return;
  }
  if (name === 'score') {
    if (!interaction.guildId) throw new Error('This command can only be used in a server.');
    await interaction.reply(buildScorePayload(
      interaction.user.id,
      statements.getCommunityScore.get(interaction.guildId, interaction.user.id)
    ));
    return;
  }
  if (name === 'leaderboard') {
    if (!interaction.guildId) throw new Error('This command can only be used in a server.');
    await interaction.reply(getLeaderboardPayload(interaction.guildId));
    return;
  }
  if (name === 'exchange') {
    if (!interaction.guildId) throw new Error('Exchange requests can only be made in a server.');
    const currencies = statements.listCurrencies.all();
    if (currencies.length < 2) throw new Error('At least two active currencies are needed to create an exchange.');
    await interaction.reply({
      ...buildExchangeSelection(currencies, interaction.user.id),
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  if (name === 'currency' || name === 'ex') {
    requireBotOwner(interaction.user.id);
    if (!interaction.guildId && action !== 'list') {
      throw new Error('Currency administration must be opened from a server.');
    }
    if (action === 'list') {
      await interaction.reply({ ...pagedList('currency', 0, interaction.user.id), flags: MessageFlags.Ephemeral });
      return;
    }
    const approvalChannel = interaction.guildId
      ? statements.getExchangeApprovalChannel.get(interaction.guildId)
      : null;
    await interaction.reply({
      ...buildCurrencyAdminMenu(interaction.user.id, approvalChannel?.exchange_approval_channel_id),
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  if (name === 'owner') {
    await interaction.reply({ ...buildOwnerHome(interaction.user.id), flags: MessageFlags.Ephemeral });
    return;
  }
  if (name === 'giveaway') {
    requireAdministrator(interaction);
    if (!interaction.guildId) throw new Error('Giveaways can only be managed in a server.');
    if (action === 'list') {
      await interaction.reply({ ...listGiveawaysPayload(interaction.guildId), flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === 'create' || !action) {
      if (!interaction.channelId) throw new Error('Open the giveaway command from a server channel.');
      await interaction.showModal(buildGiveawaySetupModal(
        interaction.user.id,
        interaction.guildId,
        interaction.channelId
      ));
      return;
    }
  }
  if (name === 'roller' && (!action || action === 'roll')) {
    await interaction.reply({ ...buildRollerButtons(), flags: MessageFlags.Ephemeral });
    return;
  }
  if (name === 'roller' && action === 'list') {
    if (!interaction.guildId) throw new Error('Prize rollers can only be listed in a server.');
    const fields = ['basic', 'advanced'].map(mode => {
      const prizes = statements.listRollerPrizes.all(interaction.guildId, mode);
      const totalPoints = totalRollPoints(prizes);
      const listing = prizes.slice(0, 5).map(prize =>
        `• **${prize.prize}** — ${prize.points} point(s), ${getRollChancePercent(prize.points, totalPoints).toFixed(2)}%`
      );
      if (prizes.length > listing.length) {
        listing.push(`…and ${prizes.length - listing.length} more. Use \`/roller list\` to see all prizes.`);
      }
      return {
        name: `${mode[0].toUpperCase()}${mode.slice(1)}`,
        value: listing.join('\n') || 'No prizes configured.'
      };
    });
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('Configured roller prizes')
        .addFields(fields)],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return;
  }
  if (name === 'تشهير') {
    await interaction.reply({
      content: `Use \`${commandPrefix}تشهير\` to post a report form that sends member stories to the configured public scam-alert channel. Reports do not trigger automatic bans.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return;
  }
  await replyAdminCommandUsage(interaction, command);
}

async function handleAdminDashboardButton(interaction) {
  requireBotOwner(interaction.user.id);
  if (interaction.customId.startsWith('admin-page:')) {
    const [, ownerId, rawPage, ...extra] = interaction.customId.split(':');
    const page = Number(rawPage);
    if (extra.length || !ownerId || !Number.isInteger(page)) {
      throw new Error('This admin dashboard page button is invalid.');
    }
    if (interaction.user.id !== ownerId) throw new Error('This admin dashboard belongs to another user.');
    await interaction.update(buildAdminDashboard(ownerId, page, commandPrefix));
    return;
  }

  const [, ownerId, rawPage, commandKey, ...extra] = interaction.customId.split(':');
  const page = Number(rawPage);
  if (extra.length || !ownerId || !Number.isInteger(page) || !commandKey) {
    throw new Error('This admin dashboard command button is invalid.');
  }
  if (interaction.user.id !== ownerId) throw new Error('This admin dashboard belongs to another user.');
  await handleAdminCommand(interaction, getAdminCommand(commandKey));
}

async function handleOwnerAction(interaction) {
  const [, ownerId, action, ...extra] = interaction.customId.split(':');
  if (extra.length || !ownerId || ![
    'home', 'servers', 'leaderboard', 'currency-admin', 'take-secrets', 'blacklist', 'unblacklist'
  ].includes(action)) {
    throw new Error('This owner dashboard button is invalid.');
  }
  requireBotOwner(interaction.user.id);
  if (interaction.user.id !== ownerId) throw new Error('This owner dashboard belongs to another user.');

  if (action === 'home') {
    await interaction.update(buildOwnerHome(ownerId));
    return;
  }
  if (action === 'servers') {
    await interaction.deferUpdate();
    await interaction.editReply(await createOwnerServersPage(0, ownerId));
    return;
  }
  if (action === 'leaderboard') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const currency = getCurrency(BASE_CURRENCY_NAME);
    await interaction.editReply(buildOwnerLeaderboardPage(
      currency,
      getOwnerCurrencyStats(currency.id),
      statements.ownerCurrencyLeaderboard.all(currency.id),
      0,
      ownerId
    ));
    return;
  }
  if (action === 'take-secrets') {
    await interaction.showModal(buildOwnerTakeSecretsModal(ownerId));
    return;
  }
  if (action === 'blacklist' || action === 'unblacklist') {
    await interaction.showModal(buildOwnerBlacklistModal(ownerId, action));
    return;
  }

  const approvalChannel = statements.getExchangeApprovalChannel.get(interaction.guildId);
  await interaction.update(buildCurrencyAdminMenu(
    ownerId,
    approvalChannel?.exchange_approval_channel_id
  ));
}

function parseOwnerTargetUserId(value) {
  const match = /^<@!?(\d{17,20})>$/.exec(value.trim());
  const userId = match ? match[1] : value.trim();
  if (!/^\d{17,20}$/.test(userId)) {
    throw new Error('Enter a valid Discord user ID.');
  }
  return userId;
}

async function handleOwnerTakeSecretsModal(interaction) {
  const [, ownerId, ...extra] = interaction.customId.split(':');
  if (extra.length || !ownerId) throw new Error('This Secrets transfer form is invalid.');
  requireBotOwner(interaction.user.id);
  if (interaction.user.id !== ownerId) throw new Error('This form belongs to another user.');

  const targetId = parseOwnerTargetUserId(interaction.fields.getTextInputValue('user_id'));
  if (targetId === ownerId) throw new Error('You cannot take Secrets from yourself.');
  const amount = parseMinor(interaction.fields.getTextInputValue('amount'));
  const currency = getCurrency(BASE_CURRENCY_NAME);
  transaction(() => {
    if (getBalance(targetId, currency.id) < amount) {
      throw new Error('That user does not have enough Secrets for this amount.');
    }
    addBalanceTransaction(targetId, currency.id, -amount, 'owner_transfer_out', ownerId, 'Owner transfer to bot owner');
    addBalanceTransaction(ownerId, currency.id, amount, 'owner_transfer_in', targetId, 'Secrets received from user');
  });
  await interaction.reply({
    content: `Moved **${formatMinor(amount)} ${currency.name}** from <@${targetId}> to your balance.`,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] }
  });
}

async function handleOwnerBlacklistModal(interaction, action) {
  const [, ownerId, ...extra] = interaction.customId.split(':');
  if (extra.length || !ownerId) throw new Error('This blacklist form is invalid.');
  requireBotOwner(interaction.user.id);
  if (interaction.user.id !== ownerId) throw new Error('This form belongs to another user.');
  const userId = parseOwnerTargetUserId(interaction.fields.getTextInputValue('user_id'));
  if (userId === ownerId) throw new Error('You cannot blacklist the bot owner.');

  if (action === 'blacklist') {
    const result = transaction(() => {
      const inserted = statements.addBlacklistedUser.run(userId, ownerId);
      if (inserted.changes > 0) statements.removeUserGiveawayEntries.run(userId);
      return inserted;
    });
    if (result.changes === 0) throw new Error('That user is already blacklisted.');
    await interaction.reply({
      content: `User \`${userId}\` is now blacklisted from using the bot.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return;
  }
  if (action === 'unblacklist') {
    const result = statements.removeBlacklistedUser.run(userId);
    if (result.changes === 0) throw new Error('That user is not blacklisted.');
    await interaction.reply({
      content: `User \`${userId}\` can use the bot again.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return;
  }
  throw new Error('That blacklist action is invalid.');
}

async function handleOwnerLeaderboardModal(interaction) {
  const [, ownerId, ...extra] = interaction.customId.split(':');
  if (extra.length || !ownerId) throw new Error('This leaderboard form is invalid.');
  requireBotOwner(interaction.user.id);
  if (interaction.user.id !== ownerId) throw new Error('This leaderboard form belongs to another user.');

  const currency = getCurrency(BASE_CURRENCY_NAME);
  await interaction.reply({
    ...buildOwnerLeaderboardPage(
      currency,
      getOwnerCurrencyStats(currency.id),
      statements.ownerCurrencyLeaderboard.all(currency.id),
      0,
      ownerId
    ),
    flags: MessageFlags.Ephemeral
  });
}

async function handleOwnerPage(interaction) {
  const parts = interaction.customId.split(':');
  const [, view] = parts;
  requireBotOwner(interaction.user.id);

  if (view === 'servers' && parts.length === 4) {
    const [, , rawPage, ownerId] = parts;
    if (ownerId !== interaction.user.id) throw new Error('This server list belongs to another user.');
    await interaction.deferUpdate();
    await interaction.editReply(await createOwnerServersPage(Number(rawPage), ownerId));
    return;
  }

  if (view === 'currency' && parts.length === 5) {
    const [, , rawCurrencyId, rawPage, ownerId] = parts;
    if (ownerId !== interaction.user.id) throw new Error('This leaderboard belongs to another user.');
    const currency = getCurrency(BASE_CURRENCY_NAME);
    if (Number(rawCurrencyId) !== currency.id) throw new Error('The owner leaderboard only supports Secrets.');
    await interaction.update(buildOwnerLeaderboardPage(
      currency,
      getOwnerCurrencyStats(currency.id),
      statements.ownerCurrencyLeaderboard.all(currency.id),
      Number(rawPage),
      ownerId
    ));
    return;
  }

  throw new Error('This owner menu button is invalid.');
}

async function handlePrefixMessage(message, content = message.content) {
  if (!message.guild || message.author.bot || !content.startsWith(commandPrefix)) return;
  if (!isConfiguredBotOwner(message.author.id) && statements.getBlacklistedUser.get(message.author.id)) return;
  const input = content.slice(commandPrefix.length).trim();
  if (!input) return;
  const [command = '', ...args] = tokenize(input);
  const name = command.toLowerCase();
  if (![
    'admin', 'help', 'language', 'setup', 'auditlog', 'up', 'تشهير', 'balance', 'b', 'profile', 'p', 'transfer', 'exchange', 'currency', 'ex', 'ai',
    'giveaway', 'roller', 'games', 'score', 'leaderboard'
  ].includes(name)) return;

  const reply = payload => message.reply({
    ...payload,
    allowedMentions: { parse: [], repliedUser: false }
  });
  const arg = (index, label) => {
    const value = args[index];
    if (value === undefined) throw new Error(`Missing ${label}. Use ${commandPrefix}help for syntax.`);
    return value;
  };
  const numberArg = (index, label = 'amount') => {
    const value = Number(arg(index, label));
    if (!Number.isFinite(value)) throw new Error(`${label} must be a number.`);
    return value;
  };
  const memberArg = index => {
    const match = args[index]?.match(/^<@!?(\d+)>$/);
    if (!match) {
      throw new CommandInputError(`Mention a server member using a real Discord mention (for example, @member). Use ${commandPrefix}help for syntax.`);
    }
    const member = message.mentions.members.get(match[1]);
    if (!member) throw new Error('That member could not be found in this server.');
    return member;
  };

  if (name === 'ai') {
    if (args.length === 1 && args[0].toLowerCase() === 'reset') {
      aiChat.clear(message.guildId, message.author.id);
      await reply({ content: 'تم مسح سجل محادثتك مع الذكاء الاصطناعي.' });
      return;
    }
    const prompt = args.join(' ');
    if (!prompt) {
      throw new Error(`استخدم ${commandPrefix}ai <message> لطرح سؤال، أو ${commandPrefix}ai reset لمسح سجل المحادثة.`);
    }
    if (isWhoAmIPrompt(prompt)) {
      await reply({ content: formatWhoAmIResponse(message.author.username) });
      return;
    }
    if (isWhoIsDeveloperPrompt(prompt)) {
      await reply({ content: formatDeveloperResponse() });
      return;
    }
    const answer = await aiChat.ask(message.guildId, message.author.id, prompt);
    const chunks = [];
    let remaining = answer;
    while (remaining.length > 1900) {
      let splitAt = remaining.lastIndexOf('\n', 1900);
      if (splitAt < 950) splitAt = remaining.lastIndexOf(' ', 1900);
      if (splitAt < 950) splitAt = 1900;
      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }
    if (remaining) chunks.push(remaining);
    await reply({ content: chunks[0], allowedMentions: { parse: [] } });
    for (const chunk of chunks.slice(1)) {
      await message.channel.send({ content: chunk, allowedMentions: { parse: [] } });
    }
    return;
  }

  if (name === 'language') {
    requireMessageAdministrator(message);
    if (args.length > 1) throw new Error(`Use ${commandPrefix}language [english|arabic].`);
    const currentLanguage = statements.getGuildLanguage.get(message.guildId)?.language || 'en';
    const requestedLanguage = args[0]?.toLowerCase();
    const language = !requestedLanguage
      ? currentLanguage === 'en' ? 'ar' : 'en'
      : requestedLanguage === 'english' || requestedLanguage === 'en'
        ? 'en'
        : requestedLanguage === 'arabic' || requestedLanguage === 'ar'
          ? 'ar'
          : null;
    if (!language) throw new Error(`Choose english or arabic. Use ${commandPrefix}language [english|arabic].`);
    statements.setGuildLanguage.run(message.guildId, language);
    await reply({
      content: language === 'ar'
        ? 'تم تغيير لغة البوت إلى العربية.'
        : 'The bot language for this server is now English.'
    });
    return;
  }

  if (name === 'help') {
    await reply(buildHelpHome(message.author.id, commandPrefix));
    return;
  }

  if (name === 'admin') {
    requireBotOwner(message.author.id);
    if (args.length) throw new Error(`Use ${commandPrefix}admin without arguments.`);
    await reply(buildAdminDashboard(message.author.id, 0, commandPrefix));
    return;
  }

  if (name === 'auditlog') {
    requireMessageAdministrator(message);
    if (args.length !== 1) throw new Error(`Use ${commandPrefix}auditlog #channel.`);
    const channelId = args[0].match(/^<#(\d+)>$/)?.[1];
    if (!channelId) throw new Error(`Mention a text channel. Use ${commandPrefix}auditlog #channel.`);
    const channel = await message.guild.channels.fetch(channelId);
    await reply({ content: await configureAuditLogChannel(message.guild, channel) });
    return;
  }

  if (name === 'setup') {
    requireMessageAdministrator(message);
    if (args[0]?.toLowerCase() === 'audit') throw new Error(`Use ${commandPrefix}auditlog #channel to configure server action logs.`);
    if (args[0]?.toLowerCase() === 'alert') {
      if (args.length !== 2) throw new Error(`Use ${commandPrefix}setup alert #alert-channel.`);
      const channelId = args[1].match(/^<#(\d+)>$/)?.[1];
      if (!channelId) throw new Error(`Mention a text channel. Use ${commandPrefix}setup alert #alert-channel.`);
      const alertChannel = await message.guild.channels.fetch(channelId);
      await reply(await setupGuild(message.guild, null, alertChannel));
      return;
    }
    if (args.length > 2) throw new Error(`Use ${commandPrefix}setup [#approval-channel] [#alert-channel].`);
    const channelIds = args.map(value => value.match(/^<#(\d+)>$/)?.[1]);
    if (args.length && channelIds.some(channelId => !channelId)) {
      throw new Error(`Mention text channels. Use ${commandPrefix}setup [#approval-channel] [#alert-channel].`);
    }
    const approvalChannel = channelIds[0] ? await message.guild.channels.fetch(channelIds[0]) : null;
    const alertChannel = channelIds[1] ? await message.guild.channels.fetch(channelIds[1]) : null;
    await reply(await setupGuild(message.guild, approvalChannel, alertChannel));
    return;
  }

  if (name === 'up') {
    requireMessageAdministrator(message);
    if (args.length) throw new Error(`Use ${commandPrefix}up without arguments.`);
    await reply(await buildAdminReviewForNext(message.guild, message.author.id));
    return;
  }

  if (name === 'تشهير') {
    requireMessageAdministrator(message);
    if (args.length) throw new Error(`Use ${commandPrefix}تشهير without arguments.`);
    const alertSetting = statements.getScamAlertChannel.get(message.guildId);
    if (!alertSetting) {
      throw new Error(`Configure a public scam-alert channel first with ${commandPrefix}setup alert #channel.`);
    }
    await fetchScamReportChannel(message.guild, alertSetting.scam_alert_channel_id);
    await reply(buildScamReportPanel(alertSetting.scam_alert_channel_id));
    return;
  }

  if (name === 'games') {
    await reply(buildGamesHome(message.author.id));
    return;
  }

  if (name === 'roller') {
    if (args.length) throw new Error(`Use ${commandPrefix}roller to post the Basic and Advanced roller buttons.`);
    await reply(buildRollerButtons());
    return;
  }

  if (name === 'leaderboard') {
    await reply(getLeaderboardPayload(message.guildId));
    return;
  }

  if (name === 'score') {
    const mention = args[0]?.match(/^<@!?(\d+)>$/);
    if (args.length && !mention) throw new Error(`Use ${commandPrefix}score [@member].`);
    const userId = mention?.[1] || message.author.id;
    await reply(buildScorePayload(
      userId,
      statements.getCommunityScore.get(message.guildId, userId)
    ));
    return;
  }

  if (name === 'balance' || name === 'b') {
    const mention = args[0]?.match(/^<@!?(\d+)>$/);
    const member = mention ? message.mentions.members.get(mention[1]) : message.member;
    if (!member) throw new Error('That member could not be found in this server.');
    if (name === 'balance' && member.id !== message.author.id) requireMessageManager(message);
    const currencyName = args.slice(mention ? 1 : 0).join(' ');
    const currency = getCurrency(currencyName || BASE_CURRENCY_NAME);
    await reply(buildWalletPayload(
      member.user,
      currency,
      getBalance(member.id, currency.id),
      statements.getGuildLanguage.get(message.guildId)?.language || 'en'
    ));
    return;
  }

  if (name === 'profile' || name === 'p') {
    const mention = args[0]?.match(/^<@!?(\d+)>$/);
    if (args.length && !mention) throw new Error(`Use ${commandPrefix}p [@member].`);
    const user = mention ? message.mentions.users.get(mention[1]) : message.author;
    if (!user) throw new Error('That member could not be found.');
    await reply(await createProfilePayload(user, getGuildLanguage(message.guildId)));
    return;
  }

  if (name === 'transfer') {
    const recipient = memberArg(0);
    if (recipient.user.bot) throw new Error('Transfers to bot accounts are not allowed.');
    if (recipient.id === message.author.id) throw new Error('You cannot transfer currency to yourself.');
    if (args.length !== 2) throw new Error(`Use ${commandPrefix}transfer @member <amount>. Transfers use ${BASE_CURRENCY_NAME} only.`);
    const amount = parseMinor(arg(1));
    assertSufficientTransferBalance(message.author.id, amount);
    await assertTransferCaptchaPermissions(message.channel);
    const token = createPendingTransfer({
      guildId: message.guildId,
      channelId: message.channelId,
      requesterId: message.author.id,
      recipientId: recipient.id,
      amount
    });
    const pending = pendingTransfers.get(token);
    pending.promptMessage = await reply(buildTransferCaptchaPayload(pending.captchaCode));
    return;
  }

  if (name === 'exchange') {
    if (args.length === 0) {
      const currencies = statements.listCurrencies.all();
      if (currencies.length < 2) throw new Error('At least two active currencies are needed to create an exchange.');
      await reply(buildExchangeSelection(currencies, message.author.id));
      return;
    }
    const targetMinor = toMinor(numberArg(0));
    const fromCurrency = getCurrency(arg(1, 'source currency'));
    const toCurrency = getCurrency(args.slice(2).join(' '));
    await createAndPostExchange({
      guildId: message.guildId,
      requester: message.author,
      targetMinor,
      fromCurrency,
      toCurrency,
      send: payload => sendExchangeApproval(message.guildId, payload)
    });
    await notifyPrefixExchangePending(message);
    return;
  }

  if (name === 'currency') {
    if (args.length) throw new Error(`Use ${commandPrefix}currency to open the currency administration menu.`);
    requireBotOwner(message.author.id);
    const approvalChannel = statements.getExchangeApprovalChannel.get(message.guildId);
    await reply(buildCurrencyAdminMenu(message.author.id, approvalChannel?.exchange_approval_channel_id));
    return;
  }

  if (name === 'ex') {
    if (args.length) throw new Error(`Use ${commandPrefix}ex to open the exchange currency and rate menu.`);
    requireBotOwner(message.author.id);
    const approvalChannel = statements.getExchangeApprovalChannel.get(message.guildId);
    await reply(buildCurrencyAdminMenu(message.author.id, approvalChannel?.exchange_approval_channel_id));
    return;
  }

  if (name === 'giveaway') {
    requireMessageAdministrator(message);
    const action = args[0]?.toLowerCase();
    if (!action || action === 'create') {
      await reply(buildGiveawaySetupButton(message.author.id));
      return;
    }
    if (action === 'list') {
      await reply(listGiveawaysPayload(message.guildId));
      return;
    }
    const giveawayId = arg(1, 'giveaway ID');
    if (action === 'end') {
      const result = await endGiveawayInDiscord(message.guildId, giveawayId, true);
      await reply({ content: result ? `Giveaway \`${giveawayId}\` ended.` : `Giveaway \`${giveawayId}\` is not due yet.` });
      return;
    }
    if (action === 'reroll') {
      const result = await rerollGiveawayInDiscord(message.guildId, giveawayId);
      await reply({ content: `Rerolled giveaway \`${giveawayId}\`. New winner: <@${result.winner}>.` });
      return;
    }
    throw new Error(`Unknown giveaway action. Use ${commandPrefix}giveaway, list, end <id>, or reroll <id>.`);
  }

}

async function completeTransfer(pending) {
  const currency = getCurrency(BASE_CURRENCY_NAME);
  transaction(() => {
    addBalanceTransaction(
      pending.requesterId,
      currency.id,
      -pending.amount,
      'transfer_sent',
      pending.recipientId,
      null
    );
    addBalanceTransaction(
      pending.recipientId,
      currency.id,
      pending.amount,
      'transfer_received',
      pending.requesterId,
      null
    );
  });

  const amountText = `${currency.emoji} **${formatMinor(pending.amount)} ${currency.name}**`;
  let recipientNotified = true;
  try {
    const recipient = await client.users.fetch(pending.recipientId);
    await sendGuildDm(recipient, pending.guildId, memberDmPayload(
      recipient.id,
      `You received ${amountText} from <@${pending.requesterId}>.`
    ));
  } catch (error) {
    recipientNotified = false;
    console.error(`Transfer completed but recipient ${pending.recipientId} could not be notified:`, error);
  }

  return recipientNotified
    ? `Transfer complete: ${amountText} sent to <@${pending.recipientId}>.`
    : `Transfer complete: ${amountText} sent to <@${pending.recipientId}>, but I could not DM them.`;
}

async function handleTransfer(interaction) {
  const recipient = interaction.options.getUser('member');
  if (recipient.bot) throw new Error('Transfers to bot accounts are not allowed.');
  if (recipient.id === interaction.user.id) throw new Error('You cannot transfer currency to yourself.');

  const amount = parseMinor(interaction.options.getString('amount'));
  assertSufficientTransferBalance(interaction.user.id, amount);
  await assertTransferCaptchaPermissions(interaction.channel);
  const token = createPendingTransfer({
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    requesterId: interaction.user.id,
    recipientId: recipient.id,
    amount
  });
  const pending = pendingTransfers.get(token);
  try {
    pending.promptMessage = await interaction.channel.send(buildTransferCaptchaPayload(pending.captchaCode));
    await interaction.reply({
      content: 'A verification image was posted in this channel. Send its code here to confirm the transfer.',
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    consumePendingTransfer(pending);
    if (pending.promptMessage) {
      await pending.promptMessage.delete().catch(deleteError =>
        console.error(`Could not delete transfer captcha ${pending.promptMessage.id} after setup failed:`, deleteError)
      );
    }
    throw error;
  }
}

async function createAndPostExchange({ guildId, requester, targetMinor, fromCurrency, toCurrency, send }) {
  if (!guildId) throw new Error('Exchange requests can only be made in a server.');
  if (fromCurrency.id === toCurrency.id) throw new Error('Choose two different currencies.');
  const sourceMinor = sourceMinorForTarget(targetMinor, fromCurrency.price_micros, toCurrency.price_micros);
  const id = randomUUID();

  const request = transaction(() => {
    changeBalance(requester.id, fromCurrency.id, -sourceMinor);
    recordTransaction(requester.id, fromCurrency.id, -sourceMinor, 'exchange_reserved', null, id);
    statements.insertRequest.run(
      id,
      guildId,
      requester.id,
      fromCurrency.id,
      toCurrency.id,
      sourceMinor,
      targetMinor,
      fromCurrency.price_micros,
      toCurrency.price_micros
    );
    return statements.getRequest.get(id);
  });

  try {
    await send({
      embeds: [makeExchangeEmbed(request, fromCurrency, toCurrency, requester)],
      components: [exchangeButtons(id)]
    });
  } catch (error) {
    transaction(() => {
      const current = statements.getRequest.get(id);
      if (current?.status === 'pending') {
        changeBalance(current.requester_id, current.from_currency_id, current.source_minor);
        recordTransaction(current.requester_id, current.from_currency_id, current.source_minor, 'exchange_refund', null, id);
        statements.finishRequest.run('rejected', 'system', id);
      }
    });
    throw error;
  }
}

async function handleExchange(interaction) {
  const targetMinor = toMinor(interaction.options.getNumber('amount'));
  const fromCurrency = getCurrency(interaction.options.getString('from'));
  const toCurrency = getCurrency(interaction.options.getString('to'));
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await createAndPostExchange({
    guildId: interaction.guildId,
    requester: interaction.user,
    targetMinor,
    fromCurrency,
    toCurrency,
    send: payload => sendExchangeApproval(interaction.guildId, payload)
  });
  await interaction.editReply({
    content: 'Your exchange is now pending and waiting for an administrator to approve or reject it.',
  });
}

function parseExchangeUiId(customId) {
  const [, ownerId, rawFromId, rawToId, rawPage, action, ...extra] = customId.split(':');
  const page = Number(rawPage);
  const fromId = rawFromId === '-' ? null : Number(rawFromId);
  const toId = rawToId === '-' ? null : Number(rawToId);
  if (extra.length || !ownerId || !Number.isInteger(page) || page < 0 ||
      (fromId !== null && (!Number.isSafeInteger(fromId) || fromId <= 0)) ||
      (toId !== null && (!Number.isSafeInteger(toId) || toId <= 0))) {
    throw new Error('This exchange selection is invalid.');
  }
  return { ownerId, fromId, toId, page, action };
}

async function handleExchangeSelection(interaction) {
  const state = parseExchangeUiId(interaction.customId);
  if (interaction.user.id !== state.ownerId) {
    await interaction.reply({ content: 'Only the member who opened this exchange can use its controls.', flags: MessageFlags.Ephemeral });
    return;
  }

  const currencies = statements.listCurrencies.all();
  if (interaction.isStringSelectMenu()) {
    if (!['from', 'to'].includes(state.action)) throw new Error('This exchange selector is invalid.');
    const selectedId = Number(interaction.values[0]);
    if (!Number.isSafeInteger(selectedId) || !currencies.some(currency => currency.id === selectedId)) {
      throw new Error('That currency is no longer available.');
    }
    const fromId = state.action === 'from' ? selectedId : state.fromId;
    const toId = state.action === 'to' ? selectedId : state.toId;
    if (fromId !== null && fromId === toId) {
      await interaction.reply({ content: 'Choose two different currencies.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.update(buildExchangeSelection(currencies, state.ownerId, fromId, toId, state.page));
    return;
  }

  if (state.action === 'previous' || state.action === 'next') {
    await interaction.update(buildExchangeSelection(currencies, state.ownerId, state.fromId, state.toId, state.page));
    return;
  }
  if (state.action !== 'order' || state.fromId === null || state.toId === null || state.fromId === state.toId) {
    throw new Error('Choose two different currencies before ordering an exchange.');
  }
  const modal = new ModalBuilder()
    .setCustomId(`exchange-ui-modal:${state.ownerId}:${state.fromId}:${state.toId}`)
    .setTitle('Order an exchange')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('amount')
          .setLabel('Amount to receive in To currency units')
          .setPlaceholder('Enter the amount you want to receive')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(20)
          .setRequired(true)
      )
    );
  await interaction.showModal(modal);
}

async function handleExchangeSelectionModal(interaction) {
  const [, ownerId, rawFromId, rawToId, ...extra] = interaction.customId.split(':');
  const fromId = Number(rawFromId);
  const toId = Number(rawToId);
  if (extra.length || !ownerId || !Number.isSafeInteger(fromId) || !Number.isSafeInteger(toId) || fromId === toId) {
    throw new Error('This exchange order is invalid.');
  }
  if (interaction.user.id !== ownerId) {
    throw new Error('Only the member who opened this exchange can order it.');
  }
  if (!interaction.guildId) throw new Error('Exchange requests can only be made in a server.');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const currencies = statements.listCurrencies.all();
  const fromCurrency = currencies.find(currency => currency.id === fromId);
  const toCurrency = currencies.find(currency => currency.id === toId);
  if (!fromCurrency || !toCurrency) throw new Error('A selected currency is no longer active. Run the exchange command again.');
  const targetMinor = toMinor(Number(interaction.fields.getTextInputValue('amount')));
  await createAndPostExchange({
    guildId: interaction.guildId,
    requester: interaction.user,
    targetMinor,
    fromCurrency,
    toCurrency,
    send: payload => sendExchangeApproval(interaction.guildId, payload)
  });
  await interaction.editReply({
    content: 'Your exchange is now pending and waiting for an administrator to approve or reject it.',
  });
}

async function handleCurrency(interaction) {
  const action = interaction.options.getSubcommand();
  if (action === 'list') {
    await interaction.reply({
      ...pagedList('currency', 0, interaction.user.id),
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  requireBotOwner(interaction.user.id);

  if (action === 'grant') {
    const currency = getCurrency(BASE_CURRENCY_NAME);
    const amount = parseMinor(interaction.options.getString('amount'));
    transaction(() => {
      addBalanceTransaction(interaction.user.id, currency.id, amount, 'admin_grant', interaction.user.id, 'Owner Secrets grant');
    });
    await interaction.reply({
      content: `Granted 🪙 **${formatMinor(amount)} ${currency.name}** to you.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return;
  }

  if (action === 'add') {
    const name = validateLabel(interaction.options.getString('name'), 'Currency name', 32);
    const emoji = validateEmoji(interaction.options.getString('emoji'));
    const price = toMicros(interaction.options.getNumber('price'));
    if (name.toLowerCase() === BASE_CURRENCY_NAME.toLowerCase()) {
      throw new Error(`${BASE_CURRENCY_NAME} is the built-in base currency.`);
    }
    const existing = statements.getCurrencyAny.get(name);
    if (existing?.active) throw new Error('A currency with that name already exists.');
    if (existing) {
      statements.reactivateCurrency.run(price, emoji, interaction.user.id, existing.id);
    } else {
      statements.insertCurrency.run(name, price, emoji, interaction.user.id);
    }
    await interaction.reply({
      embeds: [currencyEmbed('Currency added', `${emoji} **${name}** is worth **${formatPrice(price)} ${BASE_CURRENCY_NAME}** per unit.`)],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (action === 'set-price') {
    const currency = getCurrency(interaction.options.getString('name'));
    if (currency.name.toLowerCase() === BASE_CURRENCY_NAME.toLowerCase()) throw new Error('The base currency price cannot be changed.');
    const price = toMicros(interaction.options.getNumber('price'));
    statements.setCurrencyPrice.run(price, currency.id);
    await interaction.reply({
      embeds: [currencyEmbed('Currency price updated', `${currency.emoji} **${currency.name}** is now worth **${formatPrice(price)} ${BASE_CURRENCY_NAME}** per unit.`)],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (action === 'remove') {
    const currency = getCurrency(interaction.options.getString('name'));
    if (currency.name.toLowerCase() === BASE_CURRENCY_NAME.toLowerCase()) throw new Error('The base currency cannot be removed.');
    const outstanding = statements.countOutstandingCurrency.get(currency.id, currency.id, currency.id).count;
    if (outstanding) {
      throw new Error('This currency has balances or pending exchanges. Clear those before removing it.');
    }
    statements.deactivateCurrency.run(currency.id);
    await interaction.reply({ content: `Currency **${currency.name}** has been disabled.`, flags: MessageFlags.Ephemeral });
    return;
  }

}

async function handleExchangeButton(interaction) {
  const [, requestId, action] = interaction.customId.split(':');
  if (!requestId || !['approve', 'reject', 'message'].includes(action)) throw new Error('This exchange button is invalid.');
  requireManager(interaction);
  if (!interaction.guildId) throw new Error('Exchange requests can only be handled in a server.');

  if (action === 'message') {
    const request = statements.getRequest.get(requestId);
    if (!request || request.guild_id !== interaction.guildId || request.status !== 'pending') {
      throw new Error('Only pending exchange requests in this server can receive a moderator DM.');
    }
    const modal = new ModalBuilder()
      .setCustomId(`exchange-message:${requestId}`)
      .setTitle('Message exchange requester')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('message')
            .setLabel('Message to send')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(1000)
            .setRequired(true)
        )
      );
    await interaction.showModal(modal);
    return;
  }

  await interaction.deferUpdate();
  const result = transaction(() => {
    const request = statements.getRequest.get(requestId);
    if (!request || request.guild_id !== interaction.guildId) throw new Error('This exchange request was not found in this server.');
    if (request.status !== 'pending') throw new Error(`This request has already been ${request.status}.`);

    if (action === 'approve') {
      changeBalance(request.requester_id, request.to_currency_id, request.target_minor);
      recordTransaction(request.requester_id, request.to_currency_id, request.target_minor, 'exchange_approved', null, request.id);
    } else {
      changeBalance(request.requester_id, request.from_currency_id, request.source_minor);
      recordTransaction(request.requester_id, request.from_currency_id, request.source_minor, 'exchange_refund', null, request.id);
    }
    const updated = statements.finishRequest.run(action === 'approve' ? 'approved' : 'rejected', interaction.user.id, request.id);
    if (updated.changes !== 1) throw new Error('This request was already handled by another moderator.');
    return { request, status: action === 'approve' ? 'approved' : 'rejected' };
  });

  const embed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(result.status === 'approved' ? 0x2ecc71 : 0xe74c3c)
    .setFields(
      ...interaction.message.embeds[0].fields.filter(field =>
        field.name !== 'Status' && field.name !== 'الحالة'
      ),
      { name: 'Status', value: `${result.status === 'approved' ? 'Approved' : 'Rejected'} by <@${interaction.user.id}>`, inline: false }
    );
  await interaction.editReply({ embeds: [embed], components: [] });

  let dmStatus = 'DM sent.';
  try {
    const requester = await client.users.fetch(result.request.requester_id);
    const fromCurrency = db.prepare('SELECT name, emoji FROM currencies WHERE id = ?').get(result.request.from_currency_id);
    const toCurrency = db.prepare('SELECT name, emoji FROM currencies WHERE id = ?').get(result.request.to_currency_id);
    const message = result.status === 'approved'
      ? `Your exchange request was approved: ${displayCurrencyEmoji(fromCurrency.emoji)} ${formatMinor(result.request.source_minor)} ${fromCurrency.name} → ${displayCurrencyEmoji(toCurrency.emoji)} ${formatMinor(result.request.target_minor)} ${toCurrency.name}.`
      : `Your exchange request was rejected. ${displayCurrencyEmoji(fromCurrency.emoji)} ${formatMinor(result.request.source_minor)} ${fromCurrency.name} has been returned to your balance.`;
    await sendGuildDm(requester, interaction.guildId, memberDmPayload(requester.id, message));
  } catch (error) {
    console.error(`Could not DM exchange requester ${result.request.requester_id}:`, error.message);
    dmStatus = 'The exchange was handled, but the member could not be DM’d. They may have DMs disabled.';
  }
  await interaction.followUp({ content: dmStatus, flags: MessageFlags.Ephemeral });
}

async function handleExchangeMessage(interaction) {
  requireManager(interaction);
  const [, requestId] = interaction.customId.split(':');
  const request = statements.getRequest.get(requestId);
  if (!request || request.guild_id !== interaction.guildId || request.status !== 'pending') {
    throw new Error('This exchange request is no longer pending in this server.');
  }
  const message = interaction.fields.getTextInputValue('message').trim();
  if (!message) throw new Error('Enter a message before sending the DM.');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const requester = await client.users.fetch(request.requester_id);
  await sendGuildDm(requester, interaction.guildId, memberDmPayload(requester.id, message));
  await interaction.editReply({ content: 'Your message was sent to the exchange requester.' });
}

async function handleCurrencyAdminButton(interaction) {
  const [, ownerId, action, rawPage, ...extra] = interaction.customId.split(':');
  const page = Number(rawPage);
  if (extra.length || !ownerId || !Number.isInteger(page) || page < 0 ||
      (!CURRENCY_ADMIN_ACTIONS.includes(action) && action !== 'page')) {
    throw new Error('This currency menu button is invalid.');
  }
  requireBotOwner(interaction.user.id);
  if (interaction.user.id !== ownerId) throw new Error('This currency menu belongs to another user.');
  if (action === 'list' || action === 'page') {
    await interaction.update(buildCurrencyAdminList(statements.listCurrencies.all(), ownerId, page));
    return;
  }
  await interaction.showModal(buildCurrencyAdminModal(ownerId, action));
}

async function handleCurrencyAdminModal(interaction) {
  const [, ownerId, action, ...extra] = interaction.customId.split(':');
  if (extra.length || !ownerId || !['add', 'price', 'remove', 'grant', 'approval-channel'].includes(action)) {
    throw new Error('This currency form is invalid.');
  }
  requireBotOwner(interaction.user.id);
  if (interaction.user.id !== ownerId) throw new Error('This currency form belongs to another user.');

  if (action === 'approval-channel') {
    if (!interaction.guildId || !interaction.guild) {
      throw new Error('The exchange approval channel must be configured from a server.');
    }
    const channelInput = interaction.fields.getTextInputValue('channel').trim();
    const mention = channelInput.match(/^<#(\d+)>$/);
    const channelId = mention ? mention[1] : channelInput;
    if (!/^\d+$/.test(channelId)) throw new Error('Enter a valid channel mention or channel ID.');
    const channel = await interaction.guild.channels.fetch(channelId);
    if (!channel?.isTextBased() || typeof channel.send !== 'function') {
      throw new Error('Choose a server text channel that can receive messages.');
    }
    const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe();
    const permissions = channel.permissionsFor(botMember);
    if (!permissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks
    ])) {
      throw new Error('The bot needs View Channel, Send Messages, and Embed Links permissions in that channel.');
    }
    statements.setExchangeApprovalChannel.run(interaction.guildId, channel.id);
    await interaction.reply({
      content: `Exchange approval requests will be sent to <#${channel.id}>.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (action === 'add') {
    const name = validateLabel(interaction.fields.getTextInputValue('name'), 'Currency name', 32);
    const price = toMicros(Number(interaction.fields.getTextInputValue('price')));
    const emoji = validateEmoji(interaction.fields.getTextInputValue('emoji'));
    if (name.toLowerCase() === BASE_CURRENCY_NAME.toLowerCase()) {
      throw new Error(`${BASE_CURRENCY_NAME} is the built-in base currency.`);
    }
    const existing = statements.getCurrencyAny.get(name);
    if (existing?.active) throw new Error('A currency with that name already exists.');
    if (existing) statements.reactivateCurrency.run(price, emoji, interaction.user.id, existing.id);
    else statements.insertCurrency.run(name, price, emoji, interaction.user.id);
    await interaction.reply({
      content: `Added ${emoji} **${name}** at **${formatPrice(price)} ${BASE_CURRENCY_NAME}** per unit.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (action === 'price') {
    const currency = getCurrency(interaction.fields.getTextInputValue('name'));
    if (currency.name.toLowerCase() === BASE_CURRENCY_NAME.toLowerCase()) throw new Error('The base currency price cannot be changed.');
    const price = toMicros(Number(interaction.fields.getTextInputValue('price')));
    statements.setCurrencyPrice.run(price, currency.id);
    await interaction.reply({
      content: `Updated **${currency.name}** to **${formatPrice(price)} ${BASE_CURRENCY_NAME}** per unit.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (action === 'remove') {
    const currency = getCurrency(interaction.fields.getTextInputValue('name'));
    if (currency.name.toLowerCase() === BASE_CURRENCY_NAME.toLowerCase()) throw new Error('The base currency cannot be removed.');
    const outstanding = statements.countOutstandingCurrency.get(currency.id, currency.id, currency.id).count;
    if (outstanding) {
      throw new Error('This currency has balances or pending exchanges. Clear those before removing it.');
    }
    statements.deactivateCurrency.run(currency.id);
    await interaction.reply({ content: `Currency **${currency.name}** has been disabled.`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (action === 'grant') {
    const currency = getCurrency(BASE_CURRENCY_NAME);
    const amount = parseMinor(interaction.fields.getTextInputValue('amount'));
    transaction(() => {
      addBalanceTransaction(ownerId, currency.id, amount, 'admin_grant', ownerId, 'Owner Secrets grant');
    });
    await interaction.reply({
      content: `Granted 🪙 **${formatMinor(amount)} ${currency.name}** to you.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return;
  }

  throw new Error('That currency action is not supported.');
}

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
  for (const guild of client.guilds.cache.values()) {
    localizeGuildChannels(guild);
    for (const channel of guild.channels.cache.values()) {
      registerTicketChannel(channel).catch(error => {
        console.error(`Could not register ticket channel ${channel.id}:`, error);
      });
    }
  }
  const giveawaySweep = setInterval(async () => {
    try {
      const due = statements.listDueGiveaways.all(new Date().toISOString());
      for (const giveaway of due) {
        try {
          await endGiveawayInDiscord(giveaway.guild_id, giveaway.id);
        } catch (error) {
          console.error(`Could not finish giveaway ${giveaway.id}:`, error.message);
        }
      }
    } catch (error) {
      console.error('Could not check for due giveaways:', error);
    }
  }, 15_000);
  giveawaySweep.unref();
});

client.on(Events.ChannelCreate, channel => {
  localizeChannel(channel);
  registerTicketChannel(channel).catch(error => {
    console.error(`Could not register newly created ticket channel ${channel.id}:`, error);
  });
  if (channel.guild) {
    reportGuildAuditLog(
      channel.guild,
      buildAuditLogEmbed('Channel created', `A channel was created: ${formatChannel(channel)}.`),
      'channel creation',
      {
        types: AuditLogEvent.ChannelCreate,
        targetId: channel.id,
        eventTimestamp: Date.now(),
        actorFieldName: 'Created by'
      }
    );
  }
});

client.on(Events.ChannelDelete, channel => {
  if (!channel.guild) return;
  reportGuildAuditLog(
    channel.guild,
    buildAuditLogEmbed('Channel deleted', `A channel was deleted: ${formatChannel(channel)}.`),
    'channel deletion',
    {
      types: AuditLogEvent.ChannelDelete,
      targetId: channel.id,
      eventTimestamp: Date.now(),
      actorFieldName: 'Deleted by'
    }
  );
});

client.on(Events.ChannelUpdate, (oldChannel, newChannel) => {
  if (!newChannel.guild) return;
  const fields = changedFields(oldChannel, newChannel, [
    ['name', 'Name'],
    ['topic', 'Topic'],
    ['parentId', 'Category ID'],
    ['nsfw', 'NSFW'],
    ['rateLimitPerUser', 'Slowmode (seconds)'],
    ['bitrate', 'Bitrate'],
    ['userLimit', 'User limit'],
    ['position', 'Position']
  ]);
  const oldOverwrites = [...oldChannel.permissionOverwrites.cache.values()]
    .map(overwrite => overwrite.toJSON())
    .sort((a, b) => a.id.localeCompare(b.id));
  const newOverwrites = [...newChannel.permissionOverwrites.cache.values()]
    .map(overwrite => overwrite.toJSON())
    .sort((a, b) => a.id.localeCompare(b.id));
  if (JSON.stringify(oldOverwrites) !== JSON.stringify(newOverwrites)) {
    fields.push({ name: 'Permissions', value: 'Channel permission overwrites changed.' });
  }
  if (!fields.length) return;
  reportGuildAuditLog(
    newChannel.guild,
    buildAuditLogEmbed(
      'Channel updated',
      `Channel ${formatChannel(newChannel)} was updated.`,
      fields
    ),
    'channel update',
    {
    types: AuditLogEvent.ChannelUpdate,
    targetId: newChannel.id,
    eventTimestamp: Date.now(),
    actorFieldName: 'Updated by'
    }
  );
});

client.on(Events.GuildCreate, guild => {
  localizeGuildChannels(guild);
});

client.on(Events.GuildUpdate, (oldGuild, newGuild) => {
  const fields = changedFields(oldGuild, newGuild, [
    ['name', 'Server name'],
    ['ownerId', 'Owner ID'],
    ['verificationLevel', 'Verification level'],
    ['explicitContentFilter', 'Explicit content filter'],
    ['defaultMessageNotifications', 'Default notifications'],
    ['afkChannelId', 'AFK channel ID'],
    ['afkTimeout', 'AFK timeout (seconds)'],
    ['systemChannelId', 'System channel ID'],
    ['rulesChannelId', 'Rules channel ID'],
    ['publicUpdatesChannelId', 'Community updates channel ID'],
    ['preferredLocale', 'Preferred locale'],
    ['description', 'Description'],
    ['vanityURLCode', 'Vanity URL'],
    ['premiumProgressBarEnabled', 'Server boost progress bar'],
    ['widgetEnabled', 'Server widget'],
    ['nsfwLevel', 'Server age restriction'],
    ['maxMembers', 'Member limit'],
    ['mfaLevel', 'Moderator 2FA requirement'],
    ['premiumTier', 'Boost tier'],
    ['features', 'Server features', value => value?.join(', ') || 'None']
  ]);
  if (oldGuild.icon !== newGuild.icon) {
    fields.push({
      name: 'Server icon',
      value: `Before: ${oldGuild.icon ? 'Set' : 'None'}\nAfter: ${newGuild.icon ? 'Set' : 'None'}`
    });
  }
  for (const [property, label] of [['banner', 'Server banner'], ['splash', 'Invite splash']]) {
    if (oldGuild[property] !== newGuild[property]) {
      fields.push({
        name: label,
        value: `Before: ${oldGuild[property] ? 'Set' : 'None'}\nAfter: ${newGuild[property] ? 'Set' : 'None'}`
      });
    }
  }
  if (!fields.length) return;
  reportGuildAuditLog(
    newGuild,
    buildAuditLogEmbed('Server settings updated', `Settings changed in ${newGuild.name}.`, fields),
    'server update',
    {
      types: AuditLogEvent.GuildUpdate,
      targetId: newGuild.id,
      eventTimestamp: Date.now(),
      actorFieldName: 'Changed by'
    }
  );
});

client.on(Events.GuildMemberRemove, member => {
  reportGuildAuditLog(
    member.guild,
    buildAuditLogEmbed(
      'Member departed',
      `${member.user.username || member.user.tag || 'Unknown user'} left or was removed from the server.`,
      memberAuditFields(member)
    ),
    'member departure',
    {
      types: [AuditLogEvent.MemberKick, AuditLogEvent.MemberBanAdd],
      targetId: member.id,
      eventTimestamp: Date.now(),
      actorFieldName: 'Action performed by',
      missingActorNote: 'No kick or ban entry found; the member may have left voluntarily.'
    }
  );
});

client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
  const oldRoles = oldMember.roles.cache.filter(role => role.id !== newMember.guild.id);
  const newRoles = newMember.roles.cache.filter(role => role.id !== newMember.guild.id);
  const added = newRoles.filter(role => !oldRoles.has(role.id)).sort((a, b) => a.name.localeCompare(b.name));
  const removed = oldRoles.filter(role => !newRoles.has(role.id)).sort((a, b) => a.name.localeCompare(b.name));
  if (!added.length && !removed.length) return;

  reportGuildAuditLog(
    newMember.guild,
    buildAuditLogEmbed(
      'Member roles changed',
      `Roles changed for ${newMember.user.username || newMember.user.tag || 'Unknown user'}.`,
      [
        ...memberAuditFields(newMember),
        { name: 'Roles added', value: formatRoleList(added) },
        { name: 'Roles removed', value: formatRoleList(removed) }
      ]
    ),
    'member role change',
    {
      types: AuditLogEvent.MemberRoleUpdate,
      targetId: newMember.id,
      eventTimestamp: Date.now(),
      actorFieldName: 'Changed by'
    }
  );
});

client.on(Events.GuildRoleCreate, role => {
  reportGuildAuditLog(
    role.guild,
    buildAuditLogEmbed('Role created', `Role ${role.name} (${role.id}) was created.`),
    'role creation',
    {
      types: AuditLogEvent.RoleCreate,
      targetId: role.id,
      eventTimestamp: Date.now(),
      actorFieldName: 'Created by'
    }
  );
});

client.on(Events.GuildRoleDelete, role => {
  reportGuildAuditLog(
    role.guild,
    buildAuditLogEmbed('Role deleted', `Role ${role.name} (${role.id}) was deleted.`),
    'role deletion',
    {
      types: AuditLogEvent.RoleDelete,
      targetId: role.id,
      eventTimestamp: Date.now(),
      actorFieldName: 'Deleted by'
    }
  );
});

client.on(Events.GuildRoleUpdate, (oldRole, newRole) => {
  const fields = changedFields(oldRole, newRole, [
    ['name', 'Name'],
    ['hexColor', 'Color'],
    ['hoist', 'Displayed separately'],
    ['mentionable', 'Mentionable'],
    ['managed', 'Managed by integration'],
    ['position', 'Position']
  ]);
  if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
    fields.push({ name: 'Permissions', value: 'Role permissions changed.' });
  }
  if (!fields.length) return;
  reportGuildAuditLog(
    newRole.guild,
    buildAuditLogEmbed(
      'Role updated',
      `Role ${newRole.name} (${newRole.id}) was updated.`,
      fields
    ),
    'role update',
    {
      types: AuditLogEvent.RoleUpdate,
      targetId: newRole.id,
      eventTimestamp: Date.now(),
      actorFieldName: 'Updated by'
    }
  );
});

async function handleGiveawayReaction(reaction, user, add) {
  if (user.bot) return;
  if (add && !isConfiguredBotOwner(user.id) && statements.getBlacklistedUser.get(user.id)) return;
  if (reaction.partial) reaction = await reaction.fetch();
  const message = reaction.message;
  if (!message.guild) return;
  const giveaway = statements.getGiveawayByMessage.get(message.id, 'active');
  if (!giveaway || normalizeGiveawayEmoji(giveaway.entry_emoji) !== (reaction.emoji.id || reaction.emoji.name)) return;
  if (add) statements.addGiveawayEntry.run(giveaway.id, user.id);
  else statements.removeGiveawayEntry.run(giveaway.id, user.id);
}

client.on('messageReactionAdd', (reaction, user) => {
  handleGiveawayReaction(reaction, user, true)
    .catch(error => console.error('Could not record giveaway entry:', error));
});

client.on('messageReactionRemove', (reaction, user) => {
  handleGiveawayReaction(reaction, user, false)
    .catch(error => console.error('Could not remove giveaway entry:', error));
});

client.on('messageCreate', async message => {
  localizeMessage(message);
  if (message.guild && !message.author.bot && !message.webhookId &&
      (isConfiguredBotOwner(message.author.id) || !statements.getBlacklistedUser.get(message.author.id))) {
    try {
      recordCommunityMessage(message.guild.id, message.author.id);
    } catch (error) {
      console.error(`Could not count message from ${message.author.id}:`, error);
    }
  }
  if (message.guild && isTicketChannel(message.channel)) {
    try {
      await registerTicketChannel(message.channel);
    } catch (error) {
      console.error(`Could not register ticket channel ${message.channel.id}:`, error);
    }
  }
  try {
    if (await handleTransferCaptchaAnswer(message)) return;
  } catch (error) {
    console.error('Could not process transfer verification response:', error);
    await message.channel.send({
      content: 'Could not process the transfer verification response. Please contact a server administrator.',
      allowedMentions: { parse: [] }
    }).catch(reportError => console.error('Could not report transfer verification processing error:', reportError));
    return;
  }
  let shortcutInvocation = null;
  if (message.guild && !message.author.bot && !message.webhookId &&
      !message.content.startsWith(commandPrefix)) {
    try {
      const match = findShortcut(statements.listShortcuts.all(message.guild.id), message.content);
      if (match) {
        if (!match.shortcut.command_name && match.shortcut.response) {
          await message.channel.send({
            content: match.shortcut.response,
            allowedMentions: { parse: [] }
          });
          return;
        }
        const command = validateShortcutCommand(match.shortcut.command_name);
        shortcutInvocation = `${commandPrefix}${command}${match.argumentsText ? ` ${match.argumentsText}` : ''}`;
      }
    } catch (error) {
      console.error(`Could not process message shortcut in server ${message.guild.id}:`, error);
      await message.reply({
        content: 'Could not process this shortcut. Please contact a server administrator.',
        allowedMentions: { parse: [], repliedUser: false }
      }).catch(replyError => console.error('Could not report shortcut processing error:', replyError));
      return;
    }
  }
  try {
    await handlePrefixMessage(message, shortcutInvocation || message.content);
  } catch (error) {
    if (!(error instanceof CommandInputError)) {
      console.error('Prefix command failed:', error);
    }
    await message.reply({
      content: `⚠️ ${error.message || 'The command could not be completed.'}`,
      allowedMentions: { parse: [], repliedUser: false }
    }).catch(replyError => console.error('Could not report prefix command error:', replyError));
  }
});

client.on('interactionCreate', async interaction => {
  localizeInteraction(interaction);
  try {
    if (!isConfiguredBotOwner(interaction.user.id) &&
        statements.getBlacklistedUser.get(interaction.user.id)) {
      if (interaction.isRepliable()) {
        await interaction.reply({
          content: 'You are not allowed to use this bot.',
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] }
        });
      }
      return;
    }
  } catch (error) {
    console.error('Could not verify bot access:', error);
    if (interaction.isRepliable()) {
      await interaction.reply({
        content: 'The bot could not verify your access. Please try again later.',
        flags: MessageFlags.Ephemeral
      }).catch(replyError => console.error('Could not report bot access failure:', replyError));
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('scam-report:open:')) {
    try {
      await handleScamReportButton(interaction);
    } catch (error) {
      console.error('Could not open scam report form:', error);
      await interaction.reply({
        content: error.message || 'The scam report form could not be opened.',
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      }).catch(replyError => console.error('Could not report scam report form error:', replyError));
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('scam-report:submit:')) {
    try {
      await handleScamReportModal(interaction);
    } catch (error) {
      console.error('Could not submit scam report:', error);
      const response = {
        content: error.message || 'The scam report could not be submitted.',
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      };
      const reportError = interaction.deferred || interaction.replied
        ? interaction.editReply(response)
        : interaction.reply(response);
      await reportError.catch(replyError => console.error('Could not report scam report submission error:', replyError));
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('roller:')) {
    try {
      const [, mode, ...extra] = interaction.customId.split(':');
      if (extra.length || !['basic', 'advanced'].includes(mode)) {
        throw new Error('This roller button is invalid.');
      }
      if (!interaction.guildId) throw new Error('The roller can only be used in a server.');
      const prizes = statements.listRollerPrizes.all(interaction.guildId, mode);
      if (!prizes.length) {
        await interaction.reply({
          content: rollerSetupMessage(mode),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] }
        });
        return;
      }
      const prize = selectRollPrize(prizes);
      await interaction.reply({
        content: `🎉 <@${interaction.user.id}> won **${prize.prize}** from the **${mode}** roller!`,
        allowedMentions: { users: [interaction.user.id], parse: [] }
      });
    } catch (error) {
      console.error('Prize roller button failed:', error);
      await interaction.reply({
        content: error.message || 'The prize roller could not be used.',
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      }).catch(replyError => console.error('Could not report prize roller error:', replyError));
    }
    return;
  }

  if (interaction.isButton() &&
      (interaction.customId.startsWith('admin:') || interaction.customId.startsWith('admin-page:'))) {
    try {
      await handleAdminDashboardButton(interaction);
    } catch (error) {
      const message = error.message || 'That admin dashboard action could not be completed.';
      await interaction.reply({
        content: message,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      }).catch(replyError => console.error('Could not report admin dashboard error:', replyError));
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('ticket-claim:')) {
    try {
      await handleTicketClaim(interaction);
    } catch (error) {
      console.error('Ticket claim failed:', error);
      await interaction.reply({
        content: error.message || 'This ticket could not be claimed.',
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      }).catch(replyError => console.error('Could not report ticket claim error:', replyError));
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('up:')) {
    try {
      await handleAdminReviewButton(interaction);
    } catch (error) {
      console.error('Administrator role review failed:', error);
      const response = {
        content: error.message || 'That administrator role action could not be completed.',
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      };
      const reportError = interaction.deferred || interaction.replied
        ? interaction.followUp(response)
        : interaction.reply(response);
      await reportError.catch(replyError => console.error('Could not report administrator role review failure:', replyError));
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('up-dm:')) {
    try {
      await handleAdminDmModal(interaction);
    } catch (error) {
      console.error('Administrator DM form failed:', error);
      const response = {
        content: error.message || 'The member could not be sent a DM.',
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      };
      const reportError = interaction.deferred || interaction.replied
        ? interaction.followUp(response)
        : interaction.reply(response);
      await reportError.catch(replyError => console.error('Could not report administrator DM failure:', replyError));
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('games:')) {
    try {
      await handleGamesButton(interaction);
    } catch (error) {
      console.error('Game interaction failed:', error);
      const response = {
        content: error.message || 'That game could not be played.',
        flags: MessageFlags.Ephemeral
      };
      const reportError = interaction.deferred || interaction.replied
        ? interaction.followUp(response)
        : interaction.reply(response);
      await reportError.catch(replyError => console.error('Could not report game error:', replyError));
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('giveaway-setup:')) {
    try {
      const [, ownerId, ...extra] = interaction.customId.split(':');
      if (extra.length || !ownerId) throw new Error('This giveaway setup button is invalid.');
      requireAdministrator(interaction);
      if (interaction.user.id !== ownerId || !interaction.guildId || !interaction.channelId) {
        throw new Error('Only the administrator who opened this setup can create a giveaway here.');
      }
      await interaction.showModal(buildGiveawaySetupModal(ownerId, interaction.guildId, interaction.channelId));
    } catch (error) {
      console.error('Giveaway setup button failed:', error);
      await interaction.reply({
        content: error.message || 'The giveaway setup form could not be opened.',
        flags: MessageFlags.Ephemeral
      }).catch(replyError => console.error('Could not report giveaway setup error:', replyError));
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('giveaway-create:')) {
    try {
      await handleGiveawayModal(interaction);
    } catch (error) {
      console.error('Giveaway creation failed:', error.message);
      const response = { content: error.message || 'The giveaway could not be created.' };
      const reportError = interaction.deferred || interaction.replied
        ? interaction.editReply(response)
        : interaction.reply({ ...response, flags: MessageFlags.Ephemeral });
      await reportError.catch(replyError => console.error('Could not report giveaway creation error:', replyError));
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('help-ui:')) {
    try {
      const [, ownerId, sectionId, ...extra] = interaction.customId.split(':');
      if (extra.length || !ownerId || !sectionId) throw new Error('This help button is invalid.');
      if (interaction.user.id !== ownerId) {
        await interaction.reply({
          content: 'Only the member who opened this help menu can use its buttons.',
          flags: MessageFlags.Ephemeral
        });
      } else if (sectionId === 'home') {
        await interaction.update(buildHelpHome(ownerId, commandPrefix));
      } else {
        await interaction.update(buildHelpSection(ownerId, sectionId, commandPrefix));
      }
    } catch (error) {
      console.error('Help menu interaction failed:', error);
      const response = { content: error.message || 'That help section could not be opened.' };
      const reportError = interaction.deferred || interaction.replied
        ? interaction.followUp({ ...response, flags: MessageFlags.Ephemeral })
        : interaction.reply({ ...response, flags: MessageFlags.Ephemeral });
      await reportError.catch(replyError => console.error('Could not report help menu error:', replyError));
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('owner-action:')) {
    try {
      await handleOwnerAction(interaction);
    } catch (error) {
      console.error('Owner dashboard action failed:', error);
      const response = {
        content: error.message || 'That owner action could not be completed.',
        flags: MessageFlags.Ephemeral
      };
      const reportError = interaction.deferred || interaction.replied
        ? interaction.followUp(response)
        : interaction.reply(response);
      await reportError.catch(replyError => console.error('Could not report owner dashboard error:', replyError));
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('owner-leaderboard:')) {
    try {
      await handleOwnerLeaderboardModal(interaction);
    } catch (error) {
      console.error('Owner leaderboard failed:', error);
      const response = {
        content: error.message || 'The currency leaderboard could not be opened.',
        flags: MessageFlags.Ephemeral
      };
      const reportError = interaction.deferred || interaction.replied
        ? interaction.followUp(response)
        : interaction.reply(response);
      await reportError.catch(replyError => console.error('Could not report leaderboard error:', replyError));
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('owner-take-secrets:')) {
    try {
      await handleOwnerTakeSecretsModal(interaction);
    } catch (error) {
      console.error('Owner Secrets transfer failed:', error);
      await interaction.reply({
        content: error.message || 'The Secrets transfer could not be completed.',
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      }).catch(replyError => console.error('Could not report owner transfer error:', replyError));
    }
    return;
  }

  if (interaction.isModalSubmit() &&
      (interaction.customId.startsWith('owner-blacklist:') ||
       interaction.customId.startsWith('owner-unblacklist:'))) {
    const action = interaction.customId.startsWith('owner-blacklist:') ? 'blacklist' : 'unblacklist';
    try {
      await handleOwnerBlacklistModal(interaction, action);
    } catch (error) {
      console.error('Owner blacklist action failed:', error);
      await interaction.reply({
        content: error.message || 'The blacklist action could not be completed.',
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      }).catch(replyError => console.error('Could not report blacklist error:', replyError));
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('currency-admin:')) {
    try {
      await handleCurrencyAdminButton(interaction);
    } catch (error) {
      console.error('Currency administration button failed:', error);
      const message = error.message || 'The currency action could not be completed.';
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(replyError => {
          console.error('Could not report currency administration failure:', replyError);
        });
      } else {
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
      }
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('currency-admin-modal:')) {
    try {
      await handleCurrencyAdminModal(interaction);
    } catch (error) {
      console.error('Currency administration form failed:', error);
      await interaction.reply({
        content: error.message || 'The currency action could not be completed.',
        flags: MessageFlags.Ephemeral
      }).catch(replyError => console.error('Could not report currency administration failure:', replyError));
    }
    return;
  }

  if ((interaction.isStringSelectMenu() || interaction.isButton()) &&
      interaction.customId.startsWith('exchange-ui:')) {
    try {
      await handleExchangeSelection(interaction);
    } catch (error) {
      console.error('Exchange selection failed:', error);
      const message = error.message || 'The exchange selection could not be completed.';
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(replyError => {
          console.error('Could not report exchange selection error:', replyError);
        });
      } else {
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
      }
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('exchange-ui-modal:')) {
    try {
      await handleExchangeSelectionModal(interaction);
    } catch (error) {
      console.error('Exchange order failed:', error.message);
      const response = { content: error.message || 'The exchange order could not be completed.' };
      const reportError = interaction.deferred || interaction.replied
        ? interaction.editReply(response)
        : interaction.reply({ ...response, flags: MessageFlags.Ephemeral });
      await reportError.catch(replyError => console.error('Could not report exchange order error:', replyError));
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('page:')) {
    try {
      const [, kind, rawPage, ownerId, memberId] = interaction.customId.split(':');
      if (interaction.user.id !== ownerId) {
        await interaction.reply({ content: 'Only the member who opened this list can turn its pages.', flags: MessageFlags.Ephemeral });
      } else {
        await interaction.update(pagedList(kind, Number(rawPage), ownerId, memberId));
      }
    } catch (error) {
      console.error('Could not change list page:', error);
      await interaction.reply({ content: error.message || 'That list page could not be opened.', flags: MessageFlags.Ephemeral })
        .catch(replyError => console.error('Could not report page error:', replyError));
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('owner-page:')) {
    try {
      await handleOwnerPage(interaction);
    } catch (error) {
      console.error('Owner menu interaction failed:', error);
      const response = {
        content: error.message || 'That owner menu page could not be opened.',
        flags: MessageFlags.Ephemeral
      };
      const reportError = interaction.deferred || interaction.replied
        ? interaction.followUp(response)
        : interaction.reply(response);
      await reportError.catch(replyError => console.error('Could not report owner menu error:', replyError));
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('exchange-message:')) {
    try {
      await handleExchangeMessage(interaction);
    } catch (error) {
      console.error('Could not send moderator DM:', error);
      const response = { content: error.message || 'The DM could not be sent.' };
      const reportError = interaction.deferred || interaction.replied
        ? interaction.editReply(response)
        : interaction.reply({ ...response, flags: MessageFlags.Ephemeral });
      await reportError.catch(replyError => console.error('Could not report DM failure:', replyError));
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('exchange:')) {
    try {
      await handleExchangeButton(interaction);
    } catch (error) {
      console.error('Exchange review failed:', error);
      const message = error.message || 'The request could not be handled.';
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(replyError => {
          console.error('Could not report exchange review error:', replyError);
        });
      } else {
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  try {
    switch (interaction.commandName) {
      case 'help':
        await interaction.reply({
          ...buildHelpHome(interaction.user.id, commandPrefix),
          flags: MessageFlags.Ephemeral,
        });
        break;
      case 'language': {
        requireAdministrator(interaction);
        const language = interaction.options.getString('language');
        statements.setGuildLanguage.run(interaction.guildId, language);
        await interaction.reply({
          content: language === 'ar'
            ? 'تم تغيير لغة البوت إلى العربية.'
            : 'The bot language for this server is now English.',
          flags: MessageFlags.Ephemeral
        });
        break;
      }
      case 'setup': {
        requireAdministrator(interaction);
        const approvalChannel = interaction.options.getChannel('approval_channel');
        const alertChannel = interaction.options.getChannel('alert_channel');
        await interaction.reply({
          ...await setupGuild(interaction.guild, approvalChannel, alertChannel),
          flags: MessageFlags.Ephemeral
        });
        break;
      }
      case 'auditlog': {
        requireAdministrator(interaction);
        const channel = interaction.options.getChannel('channel');
        await interaction.reply({
          content: await configureAuditLogChannel(interaction.guild, channel),
          flags: MessageFlags.Ephemeral
        });
        break;
      }
      case 'اختصارات': {
        requireAdministrator(interaction);
        const action = interaction.options.getSubcommand();
        if (action === 'add') {
          const trigger = normalizeShortcutTrigger(interaction.options.getString('trigger'));
          const command = validateShortcutCommand(interaction.options.getString('command'));
          statements.setShortcut.run(interaction.guildId, trigger, command);
          await interaction.reply({
            content: `Saved shortcut **${trigger}** for \`${commandPrefix}${command}\`. Users can add the command’s usual arguments after the shortcut.`,
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] }
          });
        } else if (action === 'remove') {
          const trigger = normalizeShortcutTrigger(interaction.options.getString('trigger'));
          const result = statements.deleteShortcut.run(interaction.guildId, trigger);
          await interaction.reply({
            content: result.changes
              ? `Removed shortcut **${trigger}**.`
              : `No shortcut was found for **${trigger}**.`,
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] }
          });
        } else {
          await interaction.reply({
            content: formatShortcuts(statements.listShortcuts.all(interaction.guildId)),
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] }
          });
        }
        break;
      }
      case 'balance':
        await handleBalance(interaction);
        break;
      case 'profile':
        await handleProfile(interaction);
        break;
      case 'games':
        await interaction.reply({
          ...buildGamesHome(interaction.user.id),
          flags: MessageFlags.Ephemeral
        });
        break;
      case 'leaderboard':
        await interaction.reply(getLeaderboardPayload(interaction.guildId));
        break;
      case 'score': {
        const user = interaction.options.getUser('member') || interaction.user;
        await interaction.reply(buildScorePayload(
          user.id,
          statements.getCommunityScore.get(interaction.guildId, user.id)
        ));
        break;
      }
      case 'transfer':
        await handleTransfer(interaction);
        break;
      case 'exchange':
        await handleExchange(interaction);
        break;
      case 'currency':
        await handleCurrency(interaction);
        break;
      case 'owner':
        await handleOwner(interaction);
        break;
      case 'admin':
        await handleAdmin(interaction);
        break;
      case 'giveaway': {
        requireAdministrator(interaction);
        const action = interaction.options.getSubcommand();
        if (action === 'create') {
          if (!interaction.guildId || !interaction.channelId) {
            throw new Error('Giveaways can only be created in a server channel.');
          }
          await interaction.showModal(buildGiveawaySetupModal(
            interaction.user.id,
            interaction.guildId,
            interaction.channelId
          ));
          break;
        }
        if (action === 'list') {
          await interaction.reply({ ...listGiveawaysPayload(interaction.guildId), flags: MessageFlags.Ephemeral });
          break;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const giveawayId = interaction.options.getString('id');
        if (action === 'end') {
          const result = await endGiveawayInDiscord(interaction.guildId, giveawayId, true);
          await interaction.editReply({ content: result ? `Giveaway \`${giveawayId}\` ended.` : 'That giveaway is not due yet.' });
        } else if (action === 'reroll') {
          const result = await rerollGiveawayInDiscord(interaction.guildId, giveawayId);
          await interaction.editReply({ content: `New winner for \`${giveawayId}\`: <@${result.winner}>.` });
        }
        break;
      }
      case 'roller':
        await handleRoller(interaction);
        break;
      case 'moderate':
        await handleModeration(interaction);
        break;
      default:
        await interaction.reply({ content: 'Unknown command.', flags: MessageFlags.Ephemeral });
    }
  } catch (error) {
    console.error(`Command /${interaction.commandName} failed:`, error);
    const message = error.message || 'The command could not be completed.';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    }
  }
});

const discordToken = (process.env.DISCORD_TOKEN || '').trim().replace(/^Bot\s+/i, '');
if (!discordToken) {
  console.error('Discord login failed: DISCORD_TOKEN is missing. Set it in the project .env file.');
  process.exitCode = 1;
} else {
  client.login(discordToken).catch(error => {
    if (error.code === 'TokenInvalid') {
      console.error(
        'Discord rejected the bot token. In Developer Portal > your application > Bot, reset/copy the current bot token and update DISCORD_TOKEN in .env. Do not use the Application Client Secret or add a "Bot " prefix.'
      );
    } else {
      console.error('Discord login failed:', error);
    }
    process.exitCode = 1;
  });
}

process.on('SIGINT', () => {
  db.close();
  client.destroy();
  process.exit(0);
});
