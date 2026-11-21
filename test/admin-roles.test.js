const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const { getAdminRoles, getNextPromotionRole } = require('../src/admin-roles');

function makeRole(id, position, permissions = []) {
  return {
    id,
    position,
    managed: false,
    permissions: new PermissionsBitField(permissions)
  };
}

function makeMember(guildId, roles) {
  return {
    guild: { id: guildId },
    roles: { cache: new Map(roles.map(role => [role.id, role])) }
  };
}

test('admin role detection includes moderation permissions but excludes @everyone', () => {
  const everyone = makeRole('guild-1', 0, [PermissionFlagsBits.Administrator]);
  const helper = makeRole('helper', 1, [PermissionFlagsBits.ManageMessages]);
  const moderator = makeRole('moderator', 2, [PermissionFlagsBits.BanMembers]);
  const color = makeRole('color', 3);
  const member = makeMember('guild-1', [everyone, helper, moderator, color]);

  assert.deepEqual(getAdminRoles(member).map(role => role.id), ['moderator', 'helper']);
});

test('promotion role is the nearest role higher than the member’s highest role', () => {
  const everyone = makeRole('guild-1', 0);
  const memberRole = makeRole('member', 1);
  const moderator = makeRole('moderator', 2, [PermissionFlagsBits.ModerateMembers]);
  const senior = makeRole('senior', 3);
  const admin = makeRole('admin', 4, [PermissionFlagsBits.Administrator]);
  const member = makeMember('guild-1', [everyone, memberRole, moderator]);

  assert.equal(getNextPromotionRole(member, new Map([
    ['guild-1', everyone],
    ['member', memberRole],
    ['moderator', moderator],
    ['senior', senior],
    ['admin', admin]
  ])).id, 'senior');
  assert.equal(getNextPromotionRole(
    makeMember('guild-1', [everyone, admin]),
    new Map([['guild-1', everyone], ['admin', admin]])
  ), null);
});
