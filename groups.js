/* Local groups: who may see a group, who may leave, and the create/join steps.
   This does not talk to Firebase. Online join stays in firebase.js. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OmniGroups = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TEMPLATES = {
    gaming: { label: 'Gaming', mode: 'gaming' },
    friends: { label: 'Friends', mode: 'casual' },
    study: { label: 'Study group', mode: 'school' },
    club: { label: 'School club', mode: 'school' }
  };

  function code() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return out;
  }

  function normalizeGroup(group, userId) {
    const src = group || {};
    const ownerId = src.ownerId || userId;
    const memberIds = Array.isArray(src.memberIds) && src.memberIds.length ? src.memberIds.slice() : [ownerId];
    if (!memberIds.includes(ownerId)) memberIds.unshift(ownerId);
    return Object.assign({}, src, { ownerId, memberIds });
  }

  function normalizeStore(store, userId) {
    const servers = store && store.servers || {};
    Object.keys(servers).forEach(name => { servers[name] = normalizeGroup(servers[name], userId); });
    return store;
  }

  function role(group, userId) {
    const g = normalizeGroup(group, userId);
    if (g.online) return 'online';
    if (g.ownerId === userId) return 'owner';
    if (g.memberIds.includes(userId)) return 'member';
    return 'none';
  }

  function visibleNames(servers, userId) {
    return Object.keys(servers || {}).filter(name => role(servers[name], userId) !== 'none');
  }

  function menuFor(group, userId) {
    const who = role(group, userId);
    const g = normalizeGroup(group, userId);
    const items = [];
    if (who === 'none') return { role: who, items, note: '' };
    if (g.inviteCode && who !== 'online') items.push({ id: 'copy-invite', label: 'Copy invite code' });
    if (who === 'member') items.push({ id: 'leave', label: 'Leave group', danger: true });
    const note = who === 'owner' ? 'You started this group, so Leave is not shown.'
      : who === 'online' ? 'Online chats stay in Settings.' : '';
    return { role: who, items, note };
  }

  function leaveGroup(store, name, userId) {
    const servers = store && store.servers;
    if (!servers || !servers[name]) return { ok: false, error: 'missing' };
    const g = normalizeGroup(servers[name], userId);
    if (g.online) return { ok: false, error: 'unauthorized' };
    if (g.ownerId === userId) return { ok: false, error: 'owner' };
    if (!g.memberIds.includes(userId)) return { ok: false, error: 'unauthorized' };
    const memberIds = g.memberIds.filter(id => id !== userId);
    const channels = g.channels;
    servers[name] = Object.assign({}, g, { memberIds, channels });
    return { ok: true, name, group: servers[name] };
  }

  function iconProblem(icon) {
    if (!icon) return '';
    if (typeof icon !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(icon)) return 'Use a PNG, JPEG, or WebP picture.';
    if (icon.length > 280000) return 'That picture is too large. Choose one under about 200 KB.';
    return '';
  }

  function createGroup(store, input) {
    const src = input || {};
    const name = String(src.name || '').trim().slice(0, 28);
    if (!name) return { ok: false, error: 'name', message: 'A group needs a name.' };
    if (!store.servers) store.servers = {};
    if (store.servers[name]) return { ok: false, error: 'taken', message: 'You already have a group with that name.' };
    const picture = iconProblem(src.icon || '');
    if (picture) return { ok: false, error: 'icon', message: picture };
    const ids = Array.isArray(src.channelIds) && src.channelIds.length ? src.channelIds : ['general'];
    const channels = {};
    ids.forEach(id => { channels[id] = []; });
    store.servers[name] = {
      channels,
      ownerId: src.userId,
      memberIds: [src.userId],
      icon: src.icon || '',
      kind: src.kind || '',
      template: src.template || 'own',
      inviteCode: code()
    };
    return { ok: true, name, group: store.servers[name] };
  }

  function joinLocal(store, rawCode, userId) {
    const invite = String(rawCode || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(invite)) return { ok: false, error: 'code', message: 'Invite codes are 8 letters or numbers.' };
    const name = Object.keys(store.servers || {}).find(key => (store.servers[key].inviteCode || '').toUpperCase() === invite);
    if (!name) return { ok: false, error: 'code', message: 'No group on this device uses that code.' };
    const g = normalizeGroup(store.servers[name], userId);
    if (!g.memberIds.includes(userId)) g.memberIds.push(userId);
    store.servers[name] = g;
    return { ok: true, name, group: g };
  }

  function wizardStart() {
    return { step: 1, template: '', kind: '', name: '', icon: '', error: '' };
  }
  function wizardOwn(state) { return Object.assign({}, state, { step: 2, template: 'own', error: '' }); }
  function wizardTemplate(state, id) {
    if (!TEMPLATES[id]) return Object.assign({}, state, { error: 'Unknown template.' });
    return Object.assign({}, state, { step: 2, template: id, error: '' });
  }
  function wizardJoin(state) { return Object.assign({}, state, { step: 'join', error: '' }); }
  function wizardKind(state, kind) {
    if (kind !== 'friends' && kind !== 'community') return Object.assign({}, state, { error: 'Choose friends or a community.' });
    return Object.assign({}, state, { step: 3, kind, error: '' });
  }
  function wizardSkip(state) { return Object.assign({}, state, { step: 3, kind: '', error: '' }); }
  function wizardBack(state) {
    if (state.step === 3) return Object.assign({}, state, { step: 2, error: '' });
    if (state.step === 2 || state.step === 'join') return Object.assign({}, state, { step: 1, error: '' });
    return state;
  }
  function wizardIcon(state, icon) {
    const problem = iconProblem(icon);
    if (problem) return Object.assign({}, state, { error: problem });
    return Object.assign({}, state, { icon: icon || '', error: '' });
  }

  function clampMenu(x, y, width, height, viewW, viewH) {
    return {
      left: Math.max(8, Math.min(x, viewW - width - 8)),
      top: Math.max(8, Math.min(y, viewH - height - 8))
    };
  }

  return {
    TEMPLATES, normalizeGroup, normalizeStore, role, visibleNames, menuFor, leaveGroup,
    iconProblem, createGroup, joinLocal, wizardStart, wizardOwn, wizardTemplate, wizardJoin,
    wizardKind, wizardSkip, wizardBack, wizardIcon, clampMenu
  };
});
