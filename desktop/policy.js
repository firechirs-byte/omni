/* Rules for the Omni desktop window.
   The page is only allowed to be our own omni://app files. http(s) links
   are handed to the system browser. Node is never exposed here. */
const APP_PROTOCOL = 'omni:';
const APP_HOST = 'app';

const ROOT_FILES = new Set([
  'index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg',
  'config.js', 'sounds.js', 'filter-words.js', 'filter.js', 'emoji.js',
  'icons.js', 'app.js', 'media.js', 'extras.js', 'safety.js', 'browser.js',
  'firebase.js', 'assistant.js', 'auth-gate.js', 'connections.js', 'update-state.js', 'nav-path.js', 'lobby.js', 'groups.js'
]);
const ROOT_DIRS = new Set(['fonts', 'icons', 'gifs']);
const ALLOWED_EXT = new Set([
  '.html', '.css', '.js', '.webmanifest', '.svg', '.png', '.woff2', '.gif', '.txt', '.json', '.ico'
]);

function isAppUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === APP_PROTOCOL && u.hostname === APP_HOST;
  } catch {
    return false;
  }
}

/* http(s) only, with no username/password baked into the address. */
function safeExternalUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

function resolveAppFile(appPath, requestUrl, pathImpl) {
  const path = pathImpl || require('path');
  let u;
  try { u = new URL(requestUrl); } catch { return null; }
  if (u.protocol !== APP_PROTOCOL || u.hostname !== APP_HOST) return null;
  let pathname = u.pathname || '/';
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  else if (pathname.endsWith('/')) pathname += 'index.html';
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes('\0')) return null;
  const base = path.resolve(appPath);
  const target = path.resolve(base, '.' + decoded);
  const rel = path.relative(base, target);
  if (!rel || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  if (parts.some(part => !part || part === '..' || part === '.' || part.startsWith('.') || part.includes(':') || part.includes('/') || part.includes('\\'))) {
    return null;
  }
  if (parts.length === 1) {
    if (!ROOT_FILES.has(parts[0])) return null;
  } else if (!ROOT_DIRS.has(parts[0])) {
    return null;
  }
  const ext = path.extname(parts[parts.length - 1]).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return null;
  return target;
}

/* Camera, microphone and screen share only for the Omni window itself.
   Fullscreen is also allowed inside an http(s) mini-browser frame. */
function mediaAllowed({ requestingUrl, isMainFrame, permission }) {
  if (!permission || !requestingUrl) return false;
  if (permission === 'fullscreen') {
    return isAppUrl(requestingUrl) || !!safeExternalUrl(requestingUrl);
  }
  const appPerms = new Set(['media', 'display-capture', 'pointerLock', 'clipboard-sanitized-write']);
  if (!appPerms.has(permission)) return false;
  if (!isAppUrl(requestingUrl)) return false;
  if (isMainFrame === false) return false;
  return true;
}

module.exports = {
  APP_PROTOCOL,
  APP_HOST,
  ROOT_FILES,
  isAppUrl,
  safeExternalUrl,
  resolveAppFile,
  mediaAllowed
};
