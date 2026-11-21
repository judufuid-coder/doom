const { EmbedBuilder } = require('discord.js');
const { randomInt } = require('node:crypto');
const { statements, transaction } = require('./db');

const MAX_DURATION_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_WINNERS = 20;

function parseGiveawayDuration(value) {
  const match = value.trim().match(/^(\d+)\s*(m|h|d)$/i);
  if (!match) throw new Error('Duration must use minutes, hours, or days (for example 30m, 12h, or 7d).');
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  const duration = amount * multiplier;
  if (!Number.isSafeInteger(amount) || duration < 60_000 || duration > MAX_DURATION_MS) {
    throw new Error('Giveaway duration must be from 1 minute to 90 days.');
  }
  return duration;
}

function makeGiveawayEmbed(giveaway, ended = false) {
  const embed = new EmbedBuilder()
    .setColor(ended ? 0x95a5a6 : 0x5865f2)
    .setTitle(ended ? 'Giveaway ended' : 'Giveaway')
    .setDescription([
      `**Prize:** ${giveaway.prize}`,
      `**Winners:** ${giveaway.winner_count}`,
      `**Entry:** React with ${giveaway.entry_emoji}`,
      ended ? '**Status:** Ended' : `**Ends:** <t:${Math.floor(new Date(giveaway.ends_at).getTime() / 1000)}:R>`
    ].join('\n'))
    .setFooter({ text: `Giveaway ID: ${giveaway.id}` });
  if (ended) {
    const winners = JSON.parse(giveaway.winner_ids);
    embed.addFields({
      name: 'Winner(s)',
      value: winners.length ? winners.map(userId => `<@${userId}>`).join(', ') : 'No eligible entrants.'
    });
  }
  return embed;
}

function chooseGiveawayWinners(entries, count, excluded = []) {
  const available = entries.filter(userId => !excluded.includes(userId));
  const winners = [];
  while (winners.length < count && available.length) {
    winners.push(available.splice(randomInt(available.length), 1)[0]);
  }
  return winners;
}

function endGiveawayRecord(guildId, giveawayId, force = false, now = Date.now()) {
  return transaction(() => {
    const giveaway = statements.getGiveaway.get(giveawayId, guildId);
    if (!giveaway) throw new Error('That giveaway was not found in this server.');
    if (giveaway.status !== 'active') throw new Error('That giveaway has already ended.');
    if (!force && new Date(giveaway.ends_at).getTime() > now) return null;
    const entries = statements.listGiveawayEntries.all(giveawayId).map(entry => entry.user_id);
    const winners = chooseGiveawayWinners(entries, giveaway.winner_count);
    const updated = statements.finishGiveaway.run(JSON.stringify(winners), giveawayId, guildId);
    if (updated.changes !== 1) throw new Error('That giveaway was already ended.');
    return { giveaway, winners };
  });
}

function rerollGiveawayRecord(guildId, giveawayId) {
  return transaction(() => {
    const giveaway = statements.getGiveaway.get(giveawayId, guildId);
    if (!giveaway) throw new Error('That giveaway was not found in this server.');
    if (giveaway.status !== 'ended') throw new Error('End the giveaway before rerolling a winner.');
    const previousWinners = JSON.parse(giveaway.winner_ids);
    const entries = statements.listGiveawayEntries.all(giveawayId).map(entry => entry.user_id);
    const [winner] = chooseGiveawayWinners(entries, 1, previousWinners);
    if (!winner) throw new Error('There are no eligible entrants left to reroll.');
    const winners = [...previousWinners, winner];
    statements.updateGiveawayWinners.run(JSON.stringify(winners), giveawayId, guildId);
    return { giveaway, winner, winners };
  });
}

module.exports = {
  MAX_DURATION_MS,
  MAX_WINNERS,
  chooseGiveawayWinners,
  endGiveawayRecord,
  makeGiveawayEmbed,
  parseGiveawayDuration,
  rerollGiveawayRecord
};
