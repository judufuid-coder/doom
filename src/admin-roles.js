const { PermissionFlagsBits } = require('discord.js');

const ADMIN_ROLE_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageMessages
];

function getAdminRoles(member) {
  return [...member.roles.cache.values()]
    .filter(role => role.id !== member.guild.id &&
      ADMIN_ROLE_PERMISSIONS.some(permission => role.permissions.has(permission)))
    .sort((left, right) => right.position - left.position || right.id.localeCompare(left.id));
}

function getNextPromotionRole(member, guildRoles) {
  const memberRoles = [...member.roles.cache.values()]
    .filter(role => role.id !== member.guild.id && !role.managed);
  if (!memberRoles.length) return null;
  const highestHeldPosition = Math.max(...memberRoles.map(role => role.position));
  return [...guildRoles.values()]
    .filter(role => role.id !== member.guild.id && !role.managed && role.position > highestHeldPosition)
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))[0] || null;
}

module.exports = { ADMIN_ROLE_PERMISSIONS, getAdminRoles, getNextPromotionRole };
