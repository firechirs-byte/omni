const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const nav = require('../nav-path.js');

test('lobby, connections, the app, and back stay labeled', () => {
  const lobby = nav.describe(nav.home());
  assert.equal(lobby.where, 'Lobby');
  assert.equal(lobby.path, 'Lobby');
  assert.equal(lobby.action, 'Open Omni');
  const links = nav.describe(nav.connections());
  assert.equal(links.where, 'Connections');
  assert.equal(links.path, 'Lobby / Connections');
  assert.equal(links.action, 'Open Omni');
  const app = nav.describe(nav.openApp(), 'Gaming', 'voice-lounge');
  assert.equal(app.where, 'Gaming · #voice-lounge');
  assert.equal(app.path, 'Lobby / Gaming · #voice-lounge');
  assert.equal(app.action, 'Back to Lobby');
  const back = nav.describe(nav.backToLobby());
  assert.equal(back.where, 'Lobby');
  assert.equal(back.action, 'Open Omni');
});

test('the lobby page uses those labels and keeps Open Omni on every tab', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lobby.js'), 'utf8');
  assert.match(src, /id="lobbyOpenTop"/);
  assert.match(src, /You are in /);
  assert.match(src, /Back to Lobby/);
  assert.match(src, /side\.id = 'sideLobby'/);
  assert.equal(src.includes('detail.hidden = true'), false);
});
