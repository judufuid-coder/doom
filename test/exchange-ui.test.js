const test = require('node:test');
const assert = require('node:assert/strict');
const { buildExchangeSelection, displayCurrencyEmoji } = require('../src/exchange-ui');

function makeCurrencies(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Currency ${index + 1}`,
    emoji: '🪙',
    price_micros: 1_000_000
  }));
}

test('exchange selector lists currencies and requires two distinct selections', () => {
  const currencies = makeCurrencies(2);
  const initial = buildExchangeSelection(currencies, 'user-1');
  assert.match(initial.embeds[0].data.description, /Currency 1/);
  assert.equal(initial.components.length, 3);
  assert.equal(initial.components[0].components[0].options.length, 2);
  assert.equal(initial.components[2].components[2].data.disabled, true);

  const selected = buildExchangeSelection(currencies, 'user-1', 1, 2);
  assert.equal(selected.components[2].components[2].data.disabled, false);
  assert.equal(selected.components[0].components[0].options[0].data.default, true);
});

test('exchange selector paginates large currency lists', () => {
  const currencies = makeCurrencies(26);
  const firstPage = buildExchangeSelection(currencies, 'user-1');
  assert.equal(firstPage.components[0].components[0].options.length, 25);
  assert.equal(firstPage.components[2].components[1].data.disabled, false);

  const secondPage = buildExchangeSelection(currencies, 'user-1', null, null, 1);
  assert.equal(secondPage.components[0].components[0].options.length, 1);
  assert.equal(secondPage.components[2].components[0].data.disabled, false);
  assert.equal(secondPage.components[2].components[1].data.disabled, true);
});

test('exchange selector replaces missing emoji values with a safe display fallback', () => {
  assert.equal(displayCurrencyEmoji('null'), '💱');
  const selection = buildExchangeSelection([{ ...makeCurrencies(1)[0], emoji: 'null' }], 'user-1');
  assert.match(selection.embeds[0].data.description, /💱 \*\*Currency 1\*\*/);
  assert.equal(selection.components[0].components[0].options[0].data.label, '💱 Currency 1');
});
