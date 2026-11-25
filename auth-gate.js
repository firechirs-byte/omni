/* Desktop sign-in gate. The website does not use this.
   Passwords are never part of the decision and are never stored here. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OmniAuthGate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function decide(input) {
    const src = input || {};
    if (!src.desktop) return { locked: false, screen: 'app' };
    if (!src.authRestored) return { locked: true, screen: 'restoring' };
    if (src.signedIn) return { locked: false, screen: 'app' };
    if (src.offline) return { locked: true, screen: 'offline' };
    return { locked: true, screen: 'login' };
  }
  return { decide };
});
