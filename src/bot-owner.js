const DISCORD_USER_ID_PATTERN = /^\d{17,20}$/;

function parseConfiguredBotOwnerIds(value = process.env.BOT_OWNER_ID) {
  if (typeof value !== 'string') return null;

  const ownerIds = value.split(',').map(ownerId => ownerId.trim());
  if (ownerIds.length === 0 || ownerIds.some(ownerId => !DISCORD_USER_ID_PATTERN.test(ownerId))) {
    return null;
  }
  return ownerIds;
}

function isConfiguredBotOwner(userId, value = process.env.BOT_OWNER_ID) {
  const ownerIds = parseConfiguredBotOwnerIds(value);
  return ownerIds !== null && ownerIds.includes(userId);
}

function requireBotOwner(userId, value = process.env.BOT_OWNER_ID) {
  const ownerIds = parseConfiguredBotOwnerIds(value);
  if (ownerIds === null) {
    throw new Error('Set BOT_OWNER_ID in .env to one or more Discord user IDs separated by commas to use owner commands.');
  }
  if (!ownerIds.includes(userId)) {
    throw new Error('Only the configured bot owner can use this command.');
  }
}

module.exports = {
  isConfiguredBotOwner,
  parseConfiguredBotOwnerIds,
  requireBotOwner
};
