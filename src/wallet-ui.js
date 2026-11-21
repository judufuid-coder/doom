const { formatMinor } = require('./money');

function buildWalletPayload(user, currency, balance, language = 'en') {
  const amount = formatMinor(balance);
  return {
    content: language === 'ar'
      ? `<@${user.id}> لديه **${amount} ${currency.name}**.`
      : `<@${user.id}> has **${amount} ${currency.name}**.`,
    allowedMentions: { parse: [] }
  };
}

module.exports = { buildWalletPayload };
