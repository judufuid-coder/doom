const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCurrencyAdminList,
  buildCurrencyAdminMenu,
  buildCurrencyAdminModal
} = require('../src/currency-admin-ui');
const { localizePayload } = require('../src/localization');

function makeCurrencies(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Currency ${index + 1}`,
    emoji: '🪙',
    price_micros: 1_000_000
  }));
}

test('currency admin menu exposes all management buttons', () => {
  const menu = buildCurrencyAdminMenu('admin-1');
  assert.equal(menu.components.length, 3);
  assert.deepEqual(
    menu.components[0].components.map(button => button.data.label),
    ['List', 'Add', 'Set price', 'Remove', 'Grant Secrets to me']
  );
  assert.match(menu.components[0].components[0].data.custom_id, /admin-1:list/);
  assert.equal(menu.components[1].components[0].data.label, 'Set approval channel');
  assert.equal(menu.components[2].components[0].data.label, 'Owner dashboard');
  assert.match(menu.embeds[0].data.description, /not configured/);
});

test('currency admin list paginates and keeps management buttons available', () => {
  const currencies = makeCurrencies(21);
  const firstPage = buildCurrencyAdminList(currencies, 'admin-1');
  assert.equal(firstPage.components.length, 4);
  assert.equal(firstPage.components[0].components[0].data.disabled, true);
  assert.equal(firstPage.components[0].components[1].data.disabled, false);
  assert.equal(firstPage.components[1].components.length, 5);
  assert.equal(firstPage.components[2].components[0].data.label, 'Set approval channel');
  assert.equal(firstPage.components[3].components[0].data.label, 'Owner dashboard');

  const secondPage = buildCurrencyAdminList(currencies, 'admin-1', 1);
  assert.match(secondPage.embeds[0].data.description, /Currency 21/);
  assert.equal(secondPage.components[0].components[1].data.disabled, true);
});

test('currency admin forms match each action', () => {
  const expected = { add: 3, price: 2, remove: 1, grant: 1, 'approval-channel': 1 };
  for (const [action, fieldCount] of Object.entries(expected)) {
    const modal = buildCurrencyAdminModal('admin-1', action).toJSON();
    assert.equal(modal.components.length, fieldCount);
    assert.match(modal.custom_id, new RegExp(`admin-1:${action}$`));
  }
  assert.equal(
    buildCurrencyAdminModal('admin-1', 'grant').toJSON().components[0].components[0].label,
    'Secrets to grant (up to 6 decimals)'
  );
});

test('Arabic currency administration modal labels fit Discord’s 45-character limit', () => {
  for (const action of ['add', 'price', 'remove', 'grant', 'approval-channel']) {
    const modal = localizePayload(buildCurrencyAdminModal('admin-1', action), 'ar');
    assert.ok(modal.title.length <= 45, `${action} modal title exceeds Discord limit`);
    for (const row of modal.components) {
      assert.ok(row.components[0].label.length <= 45, `${action} modal label exceeds Discord limit`);
    }
  }
});
