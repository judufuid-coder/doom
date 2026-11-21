const { EmbedBuilder } = require('discord.js');

function findRecentAuditLogEntry(entries, {
  types,
  targetId,
  eventTimestamp,
  now = Date.now(),
  matchWindowMs = 30_000
}) {
  const actionTypes = new Set(Array.isArray(types) ? types : [types]);
  const target = String(targetId);
  return [...entries.values()]
    .filter(entry =>
      actionTypes.has(entry.action) &&
      String(entry.targetId) === target &&
      entry.createdTimestamp >= eventTimestamp - matchWindowMs &&
      entry.createdTimestamp <= now + 5_000
    )
    .sort((left, right) => right.createdTimestamp - left.createdTimestamp)[0] || null;
}

async function findRecentAuditLogEntryForEvent(guild, options, {
  maxAttempts = 3,
  retryDelayMs = 750
} = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const auditLogs = await guild.fetchAuditLogs({ limit: 10 });
    const entry = findRecentAuditLogEntry(auditLogs.entries, options);
    if (entry) return entry;
    if (attempt + 1 < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  }
  return null;
}

function auditExecutorFields(entry, actorFieldName = 'Performed by') {
  const executor = entry?.executor;
  const executorId = entry?.executorId || executor?.id;
  return [
    {
      name: actorFieldName,
      value: executor?.username || executor?.tag || 'Unknown user'
    },
    {
      name: 'Executor user ID',
      value: executorId || 'Unavailable'
    },
    ...(entry?.reason ? [{ name: 'Audit log reason', value: entry.reason }] : [])
  ];
}

function buildAuditLogEmbed(title, description, fields = []) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();

  if (fields.length) {
    embed.addFields(fields.slice(0, 25).map(field => ({
      name: String(field.name).slice(0, 256),
      value: String(field.value).slice(0, 1024) || 'None',
      inline: Boolean(field.inline)
    })));
  }

  return embed;
}

module.exports = {
  buildAuditLogEmbed,
  findRecentAuditLogEntry,
  findRecentAuditLogEntryForEvent,
  auditExecutorFields
};
