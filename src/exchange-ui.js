const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const { formatPrice } = require('./money');

const CURRENCIES_PER_PAGE = 25;

function exchangeUiId(ownerId, fromId, toId, page, action) {
  return `exchange-ui:${ownerId}:${fromId ?? '-'}:${toId ?? '-'}:${page}:${action}`;
}

function displayCurrencyEmoji(emoji) {
  return typeof emoji === 'string' && emoji.trim() && emoji.toLowerCase() !== 'null'
    ? emoji
    : '💱';
}

function buildExchangeSelection(currencies, ownerId, fromId = null, toId = null, page = 0) {
  const pageCount = Math.max(1, Math.ceil(currencies.length / CURRENCIES_PER_PAGE));
  if (!Number.isInteger(page) || page < 0 || page >= pageCount) {
    throw new Error('That exchange currency page does not exist.');
  }
  if ((fromId !== null && !currencies.some(currency => currency.id === fromId)) ||
      (toId !== null && !currencies.some(currency => currency.id === toId))) {
    throw new Error('A selected currency is no longer active. Run the exchange command again.');
  }

  const pageCurrencies = currencies.slice(page * CURRENCIES_PER_PAGE, (page + 1) * CURRENCIES_PER_PAGE);
  const makeCurrencyMenu = (action, selectedId) => new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(exchangeUiId(ownerId, fromId, toId, page, action))
      .setPlaceholder(action === 'from' ? 'Choose the currency to exchange from' : 'Choose the currency to exchange to')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(pageCurrencies.map(currency => {
        const option = new StringSelectMenuOptionBuilder()
          .setLabel(`${displayCurrencyEmoji(currency.emoji)} ${currency.name}`)
          .setDescription(`1 ${currency.name} = ${formatPrice(currency.price_micros)} Secrets`)
          .setValue(String(currency.id));
        if (currency.id === selectedId) option.setDefault(true);
        return option;
      }))
  );
  const getSelectedName = id => currencies.find(currency => currency.id === id);
  const fromCurrency = getSelectedName(fromId);
  const toCurrency = getSelectedName(toId);
  const currencyLines = pageCurrencies.map(currency =>
    `${displayCurrencyEmoji(currency.emoji)} **${currency.name}** — ${formatPrice(currency.price_micros)} Secrets per unit`
  );
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Create an exchange')
    .setDescription([
      'Choose the currencies below, then select **Order exchange** and enter how much you want to receive.',
      '',
      currencyLines.join('\n')
    ].join('\n'))
    .addFields(
      { name: 'From', value: fromCurrency ? `${displayCurrencyEmoji(fromCurrency.emoji)} ${fromCurrency.name}` : 'Not selected', inline: true },
      { name: 'To', value: toCurrency ? `${displayCurrencyEmoji(toCurrency.emoji)} ${toCurrency.name}` : 'Not selected', inline: true }
    )
    .setFooter({ text: `Currency page ${page + 1} of ${pageCount} • Orders need moderator approval` });

  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(exchangeUiId(ownerId, fromId, toId, Math.max(0, page - 1), 'previous'))
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(exchangeUiId(ownerId, fromId, toId, Math.min(pageCount - 1, page + 1), 'next'))
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === pageCount - 1),
    new ButtonBuilder()
      .setCustomId(exchangeUiId(ownerId, fromId, toId, page, 'order'))
      .setLabel('Order exchange')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!fromCurrency || !toCurrency || fromCurrency.id === toCurrency.id)
  );

  return {
    embeds: [embed],
    components: [makeCurrencyMenu('from', fromId), makeCurrencyMenu('to', toId), controls],
    allowedMentions: { parse: [] }
  };
}

module.exports = { buildExchangeSelection, displayCurrencyEmoji, exchangeUiId };
