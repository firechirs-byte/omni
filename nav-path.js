/* Where the desktop app is, and the labeled step away from that place.
   This does not open windows or change the signed-in profile. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OmniNav = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function home() {
    return { screen: 'lobby', tab: 'home' };
  }
  function connections() {
    return { screen: 'lobby', tab: 'links' };
  }
  function openApp() {
    return { screen: 'app', tab: 'home' };
  }
  function backToLobby() {
    return home();
  }
  function describe(state, modeName, channel) {
    const src = state && state.screen ? state : home();
    if (src.screen === 'app') {
      const mode = modeName || 'Omni';
      const where = channel ? mode + ' · #' + channel : mode;
      return { where: where, path: 'Lobby / ' + where, action: 'Back to Lobby', here: 'app' };
    }
    if (src.tab === 'links') {
      return { where: 'Connections', path: 'Lobby / Connections', action: 'Open Omni', here: 'connections' };
    }
    return { where: 'Lobby', path: 'Lobby', action: 'Open Omni', here: 'lobby' };
  }
  return { home, connections, openApp, backToLobby, describe };
});
