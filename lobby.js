/* Desktop lobby. The website does not open this. */
function showLobby() {
  if (typeof DESKTOP === 'undefined' || !DESKTOP) return;
  let root = document.getElementById('lobby');
  if (!root) root = buildLobby();
  document.body.classList.add('show-lobby');
  paintConnections();
  paintUpdate();
}
function hideLobby() {
  document.body.classList.remove('show-lobby');
}
function currentUid() {
  return (typeof Online !== 'undefined' && Online.uid) ? Online.uid : '';
}
function buildLobby() {
  const root = document.createElement('div');
  root.id = 'lobby';
  const onMac = typeof navigator !== 'undefined' && /\bOmniOS\/Mac\b/.test(navigator.userAgent);
  const place = onMac ? 'Mac' : 'Windows';
  const profile = onMac ? 'Application Support/Omni for this Mac user' : 'this Windows profile';
  root.innerHTML = '<div class="lobby-shell"><header class="lobby-top"><div><p class="lobby-kicker">Omni</p><h1>Lobby</h1>' +
    '<p class="lobby-lead">Signed in on this ' + place + '. Your chats stay in ' + profile + '.</p>' +
    '<p id="lobbyPlace" class="lobby-place"></p></div>' +
    '<div class="lobby-tabs" role="tablist"><button type="button" id="lobbyTabHome" role="tab">Lobby</button>' +
    '<button type="button" id="lobbyTabLinks" role="tab">Connections</button>' +
    '<button type="button" class="join-call" id="lobbyOpenTop">Open Omni</button></div></header>' +
    '<div class="lobby-body"><div class="lobby-main">' +
    '<section id="lobbyHome"><div class="lobby-grid"><article class="lobby-jump"><h2>Jump in</h2>' +
    '<p>Open the modes, channels, and voice lounge.</p><button type="button" class="join-call" id="lobbyOpen">Open Omni</button></article>' +
    '<article class="lobby-note"><h2>On this computer</h2><p>One Omni window. Sign-in stays in ' + profile + '.</p>' +
    '<div class="lobby-update" id="lobbyUpdate" role="status"><strong id="lobbyUpdateLabel"></strong><p id="lobbyUpdateDetail"></p></div></article></div></section>' +
    '<section id="lobbyLinks" hidden><p id="lobbyUnverified">Not verified. Omni does not check that you own these Minecraft or Roblox names.</p>' +
    '<div id="lobbyForms" class="lobby-grid"></div></section></div>' +
    '<aside class="lobby-activity" aria-label="About this lobby"><h2>Library</h2>' +
    '<p>Connections are names you type. They are not live game status.</p></aside></div></div>';
  document.body.appendChild(root);
  root.querySelector('#lobbyOpen').onclick = hideLobby;
  root.querySelector('#lobbyOpenTop').onclick = hideLobby;
  root.querySelector('#lobbyTabHome').onclick = () => setLobbyTab('home');
  root.querySelector('#lobbyTabLinks').onclick = () => setLobbyTab('links');
  wireLobbyReturn();
  setLobbyTab('home');
  return root;
}
function wireLobbyReturn() {
  const btn = document.getElementById('lobbyBtn');
  if (btn) { btn.hidden = false; btn.textContent = 'Back to Lobby'; btn.onclick = showLobby; }
  let side = document.getElementById('sideLobby');
  const group = document.querySelector('.channel-group');
  if (!side && group) {
    side = document.createElement('button');
    side.id = 'sideLobby';
    side.type = 'button';
    side.className = 'item';
    side.textContent = 'Back to Lobby';
    const list = document.getElementById('channelList');
    group.insertBefore(side, list || null);
  }
  if (side) side.onclick = showLobby;
}
function setLobbyTab(which) {
  const home = document.getElementById('lobbyHome');
  const links = document.getElementById('lobbyLinks');
  if (!home || !links) return;
  home.hidden = which !== 'home';
  links.hidden = which !== 'links';
  const homeTab = document.getElementById('lobbyTabHome');
  const linkTab = document.getElementById('lobbyTabLinks');
  if (homeTab) homeTab.setAttribute('aria-selected', which === 'home' ? 'true' : 'false');
  if (linkTab) linkTab.setAttribute('aria-selected', which === 'links' ? 'true' : 'false');
  const place = document.getElementById('lobbyPlace');
  if (place && typeof OmniNav !== 'undefined') {
    const described = OmniNav.describe(which === 'links' ? OmniNav.connections() : OmniNav.home());
    place.textContent = 'You are in ' + described.where + '. Next: ' + described.action + '.';
  }
  if (which === 'links') paintConnections();
}
function paintUpdate() {
  const button = document.getElementById('lobbyUpdate');
  const detail = document.getElementById('lobbyUpdateDetail');
  if (!button || typeof OmniUpdateState === 'undefined') return;
  const onMac = typeof navigator !== 'undefined' && /\bOmniOS\/Mac\b/.test(navigator.userAgent);
  const state = OmniUpdateState.lobbyUpdate({
    enabled: false,
    feedUrl: '',
    currentVersion: typeof APP_VERSION === 'string' ? APP_VERSION : '',
    knownNewer: null,
    platform: onMac ? 'mac' : 'windows'
  });
  const label = document.getElementById('lobbyUpdateLabel');
  if (label) label.textContent = state.label;
  button.dataset.kind = state.kind;
  detail.textContent = state.detail;
  detail.hidden = false;
}
function paintConnections() {
  const box = document.getElementById('lobbyForms');
  if (!box || typeof OmniConnections === 'undefined') return;
  const uid = currentUid();
  const data = OmniConnections.load(uid, localStorage);
  box.textContent = '';
  if (!uid) {
    const p = document.createElement('p');
    p.textContent = 'Sign in to save gamer names on this device.';
    box.appendChild(p);
  }
  OmniConnections.GAMES.forEach(game => {
    const title = game === 'minecraft' ? 'Minecraft' : 'Roblox';
    const card = document.createElement('div');
    card.dataset.game = game;
    card.className = 'lobby-game';
    const h = document.createElement('h2');
    h.textContent = title;
    const name = document.createElement('input');
    name.maxLength = game === 'minecraft' ? 16 : 20;
    name.value = data[game].name;
    name.placeholder = 'Gamer name';
    name.autocomplete = 'off';
    const url = document.createElement('input');
    url.value = data[game].url;
    url.placeholder = game === 'minecraft' ? 'https://www.minecraft.net/…' : 'https://www.roblox.com/…';
    url.inputMode = 'url';
    const err = document.createElement('p');
    err.className = 'form-error';
    const row = document.createElement('div');
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Save';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open link';
    open.hidden = !data[game].url;
    save.onclick = () => {
      const result = OmniConnections.saveGame(uid, game, name.value, url.value, localStorage);
      err.textContent = result.ok ? 'Saved on this device for your Omni sign-in.' : result.error;
      if (result.ok) paintConnections();
    };
    remove.onclick = () => { OmniConnections.clearGame(uid, game, localStorage); paintConnections(); };
    open.onclick = () => {
      const safe = OmniConnections.cleanLink(game, data[game].url);
      if (safe) window.open(safe, '_blank', 'noopener,noreferrer');
    };
    row.append(save, remove, open);
    card.append(h, name, url, err, row);
    box.appendChild(card);
  });
}
if (typeof DESKTOP !== 'undefined' && DESKTOP) {
  const wire = () => wireLobbyReturn();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
}
