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
  function lobbyUpdate(input) {
    const src = input || {};
    const base = { willDownload: false };
    if (newer(src.knownNewer, src.currentVersion)) {
      return Object.assign(base, {
        kind: 'update-needed',
        label: 'Update needed',
        detail: 'A newer Omni version is known (' + src.knownNewer + '). This copy will not download it. Replace the Omni folder when you have that zip.'
      });
    }
    if (src.enabled === true && feedOk(src.feedUrl)) {
      return Object.assign(base, {
        kind: 'unavailable',
        label: 'Updates aren\'t set up',
        detail: 'No newer version was provided to this app, and this copy does not download updates.'
      });
    }
    return Object.assign(base, {
      kind: 'unavailable',
      label: 'Updates aren\'t set up',
      detail: 'Omni is not checking for updates. No update feed is turned on, and nothing will be downloaded.'
    });
  }
  return { newer, lobbyUpdate };
});
