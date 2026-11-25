const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const state = require('../update-state.js');

test('a disabled feed is not described as up to date or ready to download', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'update-config.json'), 'utf8'));
  const result = state.lobbyUpdate({ enabled: config.enabled, feedUrl: config.feedUrl, currentVersion: '4.3.4', knownNewer: null });
  assert.equal(result.kind, 'unavailable');
  assert.equal(result.willDownload, false);
  assert.equal(result.label.includes('up to date'), false);
  assert.equal(result.label.includes('Update needed'), false);
});

test('update needed appears only for a newer known version and still does not download', () => {
  const needed = state.lobbyUpdate({ enabled: true, feedUrl: 'https://example.com/omni', currentVersion: '4.3.4', knownNewer: '4.4.0' });
  assert.equal(needed.kind, 'update-needed');
  assert.equal(needed.willDownload, false);
  const same = state.lobbyUpdate({ enabled: true, feedUrl: 'https://example.com/omni', currentVersion: '4.3.4', knownNewer: '4.3.4' });
  assert.equal(same.kind, 'unavailable');
  const older = state.lobbyUpdate({ enabled: true, feedUrl: 'https://example.com/omni', currentVersion: '4.3.4', knownNewer: '4.3.3' });
  assert.equal(older.kind, 'unavailable');
  const http = state.lobbyUpdate({ enabled: true, feedUrl: 'http://example.com/omni', currentVersion: '4.3.4', knownNewer: null });
  assert.equal(http.kind, 'unavailable');
  assert.equal(http.willDownload, false);
});

test('a mocked newer release still does not download, install, or use the network', () => {
  let called = false;
  const result = state.lobbyUpdate({
    enabled: true,
    feedUrl: 'https://example.com/omni',
    currentVersion: '4.3.4',
    knownNewer: '4.3.6',
    platform: 'windows',
    fetch() { called = true; },
    install() { called = true; }
  });
  assert.equal(called, false);
  assert.equal(result.kind, 'update-needed');
  assert.equal(result.willDownload, false);
  assert.equal(result.willInstall, false);
  assert.equal(result.checksNetwork, false);
  assert.match(result.detail, /does not download or install/);
  assert.match(result.detail, /signed installer/);
  assert.equal(result.detail.includes('up to date'), false);
});

test('the lobby does not invent a newer version', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lobby.js'), 'utf8');
  assert.match(src, /knownNewer:\s*null/);
  assert.equal(src.includes('electron-updater'), false);
  assert.equal(src.includes('http.get'), false);
});
