const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const policy = require('./policy');

const base = '/opt/omni';

test('app origin is only omni://app', () => {
  assert.equal(policy.isAppUrl('omni://app/index.html'), true);
  assert.equal(policy.isAppUrl('omni://app/'), true);
  assert.equal(policy.isAppUrl('omni://other/index.html'), false);
  assert.equal(policy.isAppUrl('https://firechirs-byte.github.io/omni/'), false);
  assert.equal(policy.isAppUrl('file:///opt/omni/index.html'), false);
  assert.equal(policy.isAppUrl('not a url'), false);
});

test('external links are http(s) without credentials', () => {
  assert.equal(policy.safeExternalUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(policy.safeExternalUrl('http://example.com'), 'http://example.com/');
  assert.equal(policy.safeExternalUrl('javascript:alert(1)'), null);
  assert.equal(policy.safeExternalUrl('file:///etc/passwd'), null);
  assert.equal(policy.safeExternalUrl('omni://app/index.html'), null);
  assert.equal(policy.safeExternalUrl('data:text/html,hi'), null);
  assert.equal(policy.safeExternalUrl('https://user:pass@example.com'), null);
  assert.equal(policy.safeExternalUrl('https://user@example.com'), null);
});

test('only the website files are readable', () => {
  assert.equal(policy.resolveAppFile(base, 'omni://app/', path.posix), '/opt/omni/index.html');
  assert.equal(policy.resolveAppFile(base, 'omni://app/index.html', path.posix), '/opt/omni/index.html');
  assert.equal(
    policy.resolveAppFile(base, 'omni://app/fonts/inter.woff2', path.posix),
    '/opt/omni/fonts/inter.woff2'
  );
  assert.equal(policy.resolveAppFile(base, 'omni://app/gifs/wave.gif', path.posix), '/opt/omni/gifs/wave.gif');
  assert.equal(policy.resolveAppFile(base, 'omni://app/auth-gate.js', path.posix), '/opt/omni/auth-gate.js');
  assert.equal(policy.resolveAppFile(base, 'omni://app/sw.js', path.posix), null);
  assert.equal(policy.resolveAppFile(base, 'omni://app/package.json', path.posix), null);
  assert.equal(policy.resolveAppFile(base, 'omni://app/desktop/main.js', path.posix), null);
  assert.equal(policy.resolveAppFile(base, 'omni://app/firebase/firestore.rules', path.posix), null);
  assert.equal(policy.resolveAppFile(base, 'omni://evil/index.html', path.posix), null);
});

test('path traversal cannot leave the app folder', () => {
  assert.equal(policy.resolveAppFile(base, 'omni://app/../package.json', path.posix), null);
  assert.equal(policy.resolveAppFile(base, 'omni://app/%2e%2e/package.json', path.posix), null);
  assert.equal(policy.resolveAppFile(base, 'omni://app/fonts/../../package.json', path.posix), null);
  assert.equal(policy.resolveAppFile(base, 'omni://app/fonts/%2e%2e/%2e%2e/etc/passwd', path.posix), null);
  assert.equal(policy.resolveAppFile(base, 'https://example.com/index.html', path.posix), null);
});

test('windows paths cannot escape the app folder', () => {
  const winBase = 'C:\\Omni';
  assert.equal(policy.resolveAppFile(winBase, 'omni://app/index.html', path.win32), 'C:\\Omni\\index.html');
  assert.equal(policy.resolveAppFile(winBase, 'omni://app/C:/Windows/system32/calc.exe', path.win32), null);
  assert.equal(policy.resolveAppFile(winBase, 'omni://app/%2e%2e/%2e%2e/Windows/system32', path.win32), null);
  assert.equal(policy.resolveAppFile(winBase, 'omni://app/fonts/..\\..\\Windows\\notepad.exe', path.win32), null);
});

test('media permissions stay on the Omni window', () => {
  const app = 'omni://app/index.html';
  assert.equal(policy.mediaAllowed({ requestingUrl: app, isMainFrame: true, permission: 'media' }), true);
  assert.equal(policy.mediaAllowed({ requestingUrl: app, isMainFrame: true, permission: 'display-capture' }), true);
  assert.equal(policy.mediaAllowed({ requestingUrl: app, isMainFrame: false, permission: 'media' }), false);
  assert.equal(policy.mediaAllowed({ requestingUrl: 'https://example.com', isMainFrame: true, permission: 'media' }), false);
  assert.equal(policy.mediaAllowed({ requestingUrl: app, isMainFrame: true, permission: 'geolocation' }), false);
  assert.equal(policy.mediaAllowed({ requestingUrl: app, isMainFrame: true, permission: 'notifications' }), false);
  assert.equal(policy.mediaAllowed({ requestingUrl: '', isMainFrame: true, permission: 'media' }), false);
  assert.equal(policy.mediaAllowed({ requestingUrl: 'https://example.com/embed', isMainFrame: false, permission: 'fullscreen' }), true);
});

test('the chat window does not turn Node on', () => {
  const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const mainFn = src.slice(src.indexOf('function createWindow'), src.indexOf('async function runSelfTest'));
  assert.match(mainFn, /nodeIntegration:\s*false/);
  assert.match(mainFn, /contextIsolation:\s*true/);
  assert.match(mainFn, /sandbox:\s*true/);
  assert.match(mainFn, /webviewTag:\s*false/);
  assert.match(mainFn, /nodeIntegrationInSubFrames:\s*false/);
  assert.match(mainFn, /nodeIntegrationInWorker:\s*false/);
  assert.doesNotMatch(mainFn, /preload/);
  assert.doesNotMatch(src, /nodeIntegration:\s*true/);
  assert.doesNotMatch(src, /--no-sandbox/);
  const preload = fs.readFileSync(path.join(__dirname, 'picker-preload.js'), 'utf8');
  assert.match(preload, /omni-desktop-picker-choice/);
  assert.doesNotMatch(preload, /require\('fs'\)|require\('child_process'\)|shell\.openExternal/);
});
