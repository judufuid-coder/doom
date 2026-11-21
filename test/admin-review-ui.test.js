const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAdminReviewPayload, buildAdminDmModal, buildNoAdminMembersPayload } = require('../src/admin-review-ui');

test('review embed shows current and next roles with all four review actions', () => {
  const payload = buildAdminReviewPayload(
    { id: 'member-1', user: { username: 'Member' } },
    [{ id: 'moderator' }],
    { id: 'senior' },
    'admin-1'
  );
  assert.match(payload.embeds[0].data.description, /<@member-1>/);
  assert.match(payload.embeds[0].data.description, /<@&moderator>/);
  assert.match(payload.embeds[0].data.description, /<@&senior>/);
  assert.deepEqual(payload.components[0].components.map(button => button.data.label), [
    'Promote', 'Not', 'DM', 'Remove admin roles'
  ]);
});

test('review disables unavailable role actions and creates a DM form', () => {
  const payload = buildAdminReviewPayload(
    { id: 'member-1' },
    [],
    null,
    'admin-1'
  );
  assert.equal(payload.components[0].components[0].data.disabled, true);
  assert.equal(payload.components[0].components[3].data.disabled, true);
  assert.equal(buildNoAdminMembersPayload().embeds[0].data.title, 'Administrator role review');
  assert.equal(buildAdminDmModal('admin-1', 'member-1').data.custom_id, 'up-dm:admin-1:member-1');
});
