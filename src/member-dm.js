function memberDmPayload(userId, content) {
  if (!/^\d+$/.test(userId)) throw new Error('A valid member ID is required to send a DM.');
  return {
    content: `<@${userId}>\n${content}`,
    allowedMentions: { users: [userId], parse: [] }
  };
}

module.exports = { memberDmPayload };
