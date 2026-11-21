const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { formatPrice } = require('./money');

const CURRENCIES_PER_PAGE = 20;
const ACTIONS = ['list', 'add', 'price', 'remove', 'grant', 'approval-channel'];

function currencyAdminId(ownerId, action, page = 0) {
  return `currency-admin:${ownerId}:${action}:${page}`;
}

function currencyAdminButtons(ownerId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(currencyAdminId(ownerId, 'list'))
        .setLabel('List')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(currencyAdminId(ownerId, 'add'))
        .setLabel('Add')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(currencyAdminId(ownerId, 'price'))
        .setLabel('Set price')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(currencyAdminId(ownerId, 'remove'))
        .setLabel('Remove')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(currencyAdminId(ownerId, 'grant'))
        .setLabel('Grant Secrets to me')
        .setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(currencyAdminId(ownerId, 'approval-channel'))
        .setLabel('Set approval channel')
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`owner-action:${ownerId}:home`)
        .setLabel('Owner dashboard')
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function buildCurrencyAdminMenu(ownerId, approvalChannelId = null) {
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Currency and exchange rates')
      .setDescription([
        'Use the buttons to list currencies, add one with its exchange rate, change its price, remove it, or grant Secrets to yourself.',
        '',
        `Exchange approvals are sent to ${approvalChannelId ? `<#${approvalChannelId}>` : '**not configured**'}. Set this channel before members order exchanges.`,
        '',
        'Prices are measured in Secrets. Removing a currency is only possible when it has no balances or pending exchanges.'
      ].join('\n'))],
    components: currencyAdminButtons(ownerId),
    allowedMentions: { parse: [] }
  };
}

function buildCurrencyAdminList(currencies, ownerId, page = 0) {
  const pageCount = Math.max(1, Math.ceil(currencies.length / CURRENCIES_PER_PAGE));
  if (!Number.isInteger(page) || page < 0 || page >= pageCount) {
    throw new Error('That currency page does not exist.');
  }
  const entries = currencies.slice(page * CURRENCIES_PER_PAGE, (page + 1) * CURRENCIES_PER_PAGE);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Available currencies')
    .setDescription(entries.map(currency =>
      `${currency.emoji} **${currency.name}** — ${formatPrice(currency.price_micros)} Secrets per unit`
    ).join('\n') || 'No currencies are available.')
    .setFooter({ text: `Page ${page + 1} of ${pageCount}` });
  const components = [];
  if (pageCount > 1) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(currencyAdminId(ownerId, 'page', page - 1))
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(currencyAdminId(ownerId, 'page', page + 1))
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === pageCount - 1)
    ));
  }
  components.push(...currencyAdminButtons(ownerId));
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

function buildCurrencyAdminModal(ownerId, action) {
  if (!['add', 'price', 'remove', 'grant', 'approval-channel'].includes(action)) {
    throw new Error('That currency action is not supported.');
  }
  const modal = new ModalBuilder()
    .setCustomId(`currency-admin-modal:${ownerId}:${action}`)
    .setTitle({
      add: 'Add currency',
      price: 'Set currency price',
      remove: 'Remove currency',
      grant: 'Grant Secrets to yourself',
      'approval-channel': 'Set exchange approval channel'
    }[action]);
  const field = (id, label, options = {}) => {
    const input = new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(TextInputStyle.Short)
      .setMaxLength(options.maxLength || 100)
      .setRequired(true);
    if (options.placeholder) input.setPlaceholder(options.placeholder);
    return input;
  };
  const fields = action === 'approval-channel'
    ? [field('channel', 'Channel mention or ID', { maxLength: 25, placeholder: '<#123456789012345678> or channel ID' })]
    : action === 'add'
      ? [
        field('name', 'Currency name', { maxLength: 32 }),
        field('price', 'Price in Secrets', { maxLength: 20 }),
        field('emoji', 'Currency emoji', { maxLength: 64 })
      ]
      : action === 'price'
        ? [
          field('name', 'Currency name'),
          field('price', 'New price in Secrets', { maxLength: 20 })
        ]
        : action === 'remove'
            ? [field('name', 'Currency name')]
            : [field('amount', 'Secrets to grant (up to 6 decimals)', { maxLength: 20 })];
  modal.addComponents(...fields.map(input => new ActionRowBuilder().addComponents(input)));
  return modal;
}

module.exports = {
  ACTIONS,
  buildCurrencyAdminList,
  buildCurrencyAdminMenu,
  buildCurrencyAdminModal
};
