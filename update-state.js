/* What the Lobby may say about updates. It never downloads or runs anything. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OmniUpdateState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function parts(value) {
    const match = String(value || '').match(/^(\d+)\.(\d+)\.(\d+)$/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  }
  function newer(remote, current) {
    const next = parts(remote), now = parts(current);
    if (!next || !now) return false;
    for (let i = 0; i < 3; i++) if (next[i] !== now[i]) return next[i] > now[i];
    return false;
  }
  function feedOk(feedUrl) {
    try {
      const url = new URL(String(feedUrl || ''));
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch { return false; }
  }
  function platformName(value) {
    if (value === 'mac') return 'Mac';
    if (value === 'windows') return 'Windows';
    return 'this computer';
  }
  function lobbyUpdate(input) {
    const src = input || {};
    const version = src.currentVersion ? 'Omni ' + src.currentVersion : 'This Omni copy';
    const platform = platformName(src.platform);
    const base = { willDownload: false, willInstall: false, checksNetwork: false };
    const manual = ' Replace this folder yourself. A Mac app and a Windows folder are different packages and do not update each other. Automatic install needs an owner-approved https feed and a signed installer. Neither is set up, and this does not download or install anything.';
    if (newer(src.knownNewer, src.currentVersion)) {
      return Object.assign(base, {
        kind: 'update-needed',
        label: 'A newer copy is known',
        detail: src.knownNewer + ' is newer than ' + version + ' on ' + platform + '.' + manual
      });
    }
    if (src.enabled === true && feedOk(src.feedUrl)) {
      return Object.assign(base, {
        kind: 'unavailable',
        label: 'This copy does not update itself',
        detail: version + ' on ' + platform + ' was not given a newer version.' + manual
      });
    }
    return Object.assign(base, {
      kind: 'unavailable',
      label: 'This copy does not update itself',
      detail: version + ' on ' + platform + ' is not checking a feed.' + manual
    });
  }
  return { newer, lobbyUpdate };
});
