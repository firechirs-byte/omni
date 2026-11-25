const test = require('node:test');
const assert = require('node:assert/strict');
const groups = require('../groups.js');

function storeWith(name, group) {
  return { server: name, servers: { [name]: group } };
}

test('the menu shows Leave only to a member, never to the owner', () => {
  const owned = { ownerId: 'ada', memberIds: ['ada', 'bea'], channels: { general: [] }, inviteCode: 'ABCD2345' };
  const ownerMenu = groups.menuFor(owned, 'ada');
  assert.equal(ownerMenu.role, 'owner');
  assert.equal(ownerMenu.items.some(item => item.id === 'leave'), false);
  assert.equal(ownerMenu.items.some(item => item.id === 'copy-invite'), true);
  const memberMenu = groups.menuFor(owned, 'bea');
  assert.equal(memberMenu.role, 'member');
  assert.deepEqual(memberMenu.items.map(item => item.id), ['copy-invite', 'leave']);
  const stranger = groups.menuFor(owned, 'cy');
  assert.equal(stranger.role, 'none');
  assert.equal(stranger.items.length, 0);
});

test('leave removes only the caller and keeps the group', () => {
  const data = storeWith('Club', {
    ownerId: 'ada', memberIds: ['ada', 'bea', 'cy'], channels: { general: [{ text: 'hi' }] }, inviteCode: 'CLUB2345'
  });
  const left = groups.leaveGroup(data, 'Club', 'bea');
  assert.equal(left.ok, true);
  assert.deepEqual(data.servers.Club.memberIds, ['ada', 'cy']);
  assert.equal(data.servers.Club.channels.general[0].text, 'hi');
  assert.equal(data.servers.Club.ownerId, 'ada');
  assert.equal(groups.visibleNames(data.servers, 'bea').includes('Club'), false);
  assert.equal(groups.visibleNames(data.servers, 'cy').includes('Club'), true);
});

test('the owner and a stranger cannot leave', () => {
  const data = storeWith('Club', { ownerId: 'ada', memberIds: ['ada', 'bea'], channels: { general: [] } });
  const owner = groups.leaveGroup(data, 'Club', 'ada');
  assert.equal(owner.ok, false);
  assert.equal(owner.error, 'owner');
  assert.deepEqual(data.servers.Club.memberIds, ['ada', 'bea']);
  const stranger = groups.leaveGroup(data, 'Club', 'cy');
  assert.equal(stranger.error, 'unauthorized');
  const missing = groups.leaveGroup(data, 'Nope', 'bea');
  assert.equal(missing.error, 'missing');
});

test('the wizard can go back, skip, and refuse a blank name or a bad picture', () => {
  let state = groups.wizardStart();
  assert.equal(state.step, 1);
  state = groups.wizardTemplate(state, 'study');
  assert.equal(state.step, 2);
  state = groups.wizardBack(state);
  assert.equal(state.step, 1);
  state = groups.wizardOwn(state);
  state = groups.wizardSkip(state);
  assert.equal(state.step, 3);
  assert.equal(state.kind, '');
  state = groups.wizardKind(groups.wizardOwn(groups.wizardStart()), 'friends');
  assert.equal(state.kind, 'friends');
  const blank = groups.createGroup({ servers: {} }, { name: '  ', userId: 'ada', channelIds: ['general'] });
  assert.equal(blank.error, 'name');
  const badIcon = groups.createGroup({ servers: {} }, { name: 'Study', userId: 'ada', channelIds: ['homework'], icon: 'data:text/html,hi' });
  assert.equal(badIcon.error, 'icon');
  const okIcon = 'data:image/png;base64,aaaa';
  const made = groups.createGroup({ servers: {} }, { name: 'Study', userId: 'ada', channelIds: ['homework', 'class-chat'], icon: okIcon, template: 'study', kind: 'community' });
  assert.equal(made.ok, true);
  assert.deepEqual(Object.keys(made.group.channels), ['homework', 'class-chat']);
  assert.equal(made.group.ownerId, 'ada');
  const again = groups.createGroup({ servers: { Study: made.group } }, { name: 'Study', userId: 'ada', channelIds: ['general'] });
  assert.equal(again.error, 'taken');
});

test('join uses a local invite code and reports a bad code', () => {
  const data = { servers: {} };
  const made = groups.createGroup(data, { name: 'Friends', userId: 'ada', channelIds: ['friends'] });
  const bad = groups.joinLocal(data, 'nope', 'bea');
  assert.equal(bad.ok, false);
  const joined = groups.joinLocal(data, made.group.inviteCode, 'bea');
  assert.equal(joined.ok, true);
  assert.ok(data.servers.Friends.memberIds.includes('ada'));
  assert.ok(data.servers.Friends.memberIds.includes('bea'));
  const twice = groups.joinLocal(data, made.group.inviteCode.toLowerCase(), 'bea');
  assert.equal(data.servers.Friends.memberIds.filter(id => id === 'bea').length, 1);
  assert.equal(twice.ok, true);
});

test('the menu stays on screen', () => {
  const spot = groups.clampMenu(900, 700, 200, 120, 800, 600);
  assert.ok(spot.left + 200 <= 792);
  assert.ok(spot.top + 120 <= 592);
  assert.ok(spot.left >= 8 && spot.top >= 8);
});
