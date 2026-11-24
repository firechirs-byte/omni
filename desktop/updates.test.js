const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const updates = require('./updates');

test('the shipped config does not check or download', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'update-config.json'), 'utf8'));
  const result = updates.assess(config);
  assert.equal(result.status, 'not-configured');
  assert.equal(result.checked, false);
  assert.equal(result.willDownload, false);
});

test('a feed still does not download an unpacked app', () => {
  const off = updates.assess({ enabled: true, feedUrl: 'http://example.com/updates' });
  assert.equal(off.willDownload, false);
  assert.equal(off.status, 'not-configured');
  const token = updates.assess({ enabled: true, feedUrl: 'https://user:token@example.com/updates' });
  assert.equal(token.willDownload, false);
  const https = updates.assess({ enabled: true, feedUrl: 'https://example.com/updates' });
  assert.equal(https.status, 'blocked');
  assert.equal(https.checked, false);
  assert.equal(https.willDownload, false);
});

test('the window name stays Omni and updates are only checked locally', () => {
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(pkg.productName, 'Omni');
  assert.equal(pkg.build.productName, 'Omni');
  assert.equal(pkg.build.win.executableName, 'Omni');
  assert.equal(pkg.build.appId, 'io.github.firechirs-byte.omni');
  assert.match(main, /checkOnLaunch\(\)/);
  assert.match(main, /setAppUserModelId\('io\.github\.firechirs-byte\.omni'\)/);
  assert.match(main, /setTitle\('Omni'\)/);
  assert.equal(main.includes('setPath(\'userData\''), true);
  assert.match(main, /if \(selfTest\) \{[\s\S]*setPath\('userData'/);
});

test('the updater does not fetch or spawn', () => {
  const src = fs.readFileSync(path.join(__dirname, 'updates.js'), 'utf8');
  assert.equal(src.includes('electron-updater'), false);
  assert.equal(src.includes('http.get'), false);
  assert.equal(src.includes('execFile'), false);
  assert.equal(src.includes('shell.openExternal'), false);
});
