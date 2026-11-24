/* Launch-time update check.
   The shipped config has no feed, so this does not contact the network and
   does not download or run anything. A future feed still does not apply an
   update until the owner turns that on for a signed installer. */
const fs = require('fs');
const path = require('path');

function loadConfig(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { enabled: false, feedUrl: '' };
  }
}

function assess(config) {
  const cfg = config || {};
  const idle = (status, reason) => ({ status, checked: false, willDownload: false, reason });
  if (cfg.enabled !== true || !String(cfg.feedUrl || '').trim()) {
    return idle('not-configured', 'No update feed is enabled. Omni opens normally.');
  }
  let url;
  try { url = new URL(cfg.feedUrl); }
  catch { return idle('not-configured', 'The update address is not a URL.'); }
  if (url.protocol !== 'https:') return idle('not-configured', 'The update address must use https.');
  if (url.username || url.password) return idle('not-configured', 'The update address must not contain a password or token.');
  return idle('blocked', 'A feed is written down, but this unpacked copy does not download updates. Automatic updates need a signed installer and an owner-approved https feed.');
}

function checkOnLaunch(configPath) {
  const config = loadConfig(configPath || path.join(__dirname, 'update-config.json'));
  return assess(config);
}

module.exports = { assess, checkOnLaunch, loadConfig };
