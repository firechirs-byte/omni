/* =====================================================================
   Omni — firebase.js   (going online: OPTIONAL, off until config.js is filled in)

   While FIREBASE_CONFIG in config.js is empty, this file does nothing
   except show "Connect online" hints. Nothing is downloaded and nothing
   leaves the device.

   When it IS set:
     • the Firebase library is downloaded from Google (only then)
     • sign up / sign in with email + password
     • an "Online" server appears in the left rail with your online group
       chats; online direct messages appear in your Messages list
     • messages arrive live, edits + deletes sync
     • your name, status and profile picture are shared with the people
       you chat with (nobody else)
   Everything else (local servers, local DMs, notes) stays on this device.
   The privacy rules live on Google's servers: firebase/firestore.rules.

   Where things are stored (Cloud Firestore):
     profiles/{you}             your name, status, picture (only you read it)
     private/{you}              email, birth year, parent email, friend code (only you)
     usernames/{name}           @username → who it belongs to (unique)
     friendCodes/{code}         friend code → who it belongs to
     inviteCodes/{code}         invite code → which chat
     chats/{id}                 a group chat or DM, with its list of members
     chats/{id}/members/{uid}   each member's public card (name, status, picture)
     chats/{id}/messages/{id}   the messages
   ===================================================================== */
const Online = (() => {
  const cfg = typeof OMNI_CONFIG !== 'undefined' ? OMNI_CONFIG : {};
  const fbc = cfg.FIREBASE_CONFIG || {};
  const configured = !!(fbc.apiKey && fbc.projectId);
  const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';   // Firebase JS SDK v10 (modular)
  const SERVER = 'Online';            // the name of the online server in the rail
  // state: 'off' (no config) · 'connecting' · 'bad-key' · 'needs-setup' · 'offline' · 'ready'
  let state = configured ? 'connecting' : 'off', problem = '';
  let F = null, auth = null, db = null, user = null, profile = null, signingUp = false;
  let stopChats = null;                // stops the "my chats" live listener
  const stops = {};                    // per chat: stop functions for its members + messages listeners
  // what we know from the server (kept in memory, copied into Omni's lists by attach())
  const OL = { channels: {}, msgs: {}, people: {}, members: {}, cards: {} };

  // Explain Firebase errors in words a kid (or parent) can act on
  function friendly(err) {
    const c = err?.code || '', m = err?.message || String(err);
    const say = {
      'auth/email-already-in-use': 'There is already an account with that email. Try signing in (or "Forgot password?").',
      'auth/invalid-credential': 'That email and password don\'t match an account.',
      'auth/wrong-password': 'That email and password don\'t match an account.',
      'auth/user-not-found': 'That email and password don\'t match an account.',
      'auth/invalid-email': 'That doesn\'t look like a real email address.',
      'auth/weak-password': 'The password is too weak: use at least 8 characters.',
      'auth/too-many-requests': 'Too many tries. Wait a few minutes and try again.',
      'auth/network-request-failed': 'Could not reach Firebase. Check the internet connection.',
      'auth/operation-not-allowed': 'Email/password sign-in is switched off. A parent turns it on in the Firebase console: Authentication → Sign-in method → Email/Password → Enable.',
      'auth/unauthorized-domain': 'This web address isn\'t allowed yet. A parent adds it in the Firebase console: Authentication → Settings → Authorized domains.',
      'auth/requires-recent-login': 'Please sign in again first.',
      'permission-denied': 'Firebase said no (permission denied).',
      'unavailable': 'Could not reach Firebase (offline?).'
    }[c.replace(/^firestore\//, '')];
    if (say) return new Error(say);
    if (/api[- ]key/i.test(m)) return new Error('Firebase said the apiKey in config.js is not valid.');
    return err instanceof Error ? err : new Error(m);
  }

  async function init() {
    if (!configured) return false;
    if (F) return state === 'ready';
    try {
      // dynamic import(): the library is only downloaded when Omni is configured to go online
      const [app, a, fs] = await Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(f => import(SDK + f)));
      F = { ...app, ...a, ...fs };
    } catch { state = 'offline'; problem = 'Could not download the Firebase library (are you offline?).'; updateChip(); return false; }
    try {
      const fbApp = F.initializeApp(fbc);
      auth = F.getAuth(fbApp);
      db = F.getFirestore(fbApp);
      await auth.authStateReady();
      // Is the database there, and do the rules work? Asking for a code that doesn't
      // exist should answer "not found" (signed in) or "permission denied" (signed out).
      await withTimeout(F.getDoc(F.doc(db, 'inviteCodes', 'PROBE000')), 12000);
      state = 'ready';
    } catch (err) {
      const c = err?.code || '', m = err?.message || '';
      if (c === 'permission-denied') state = 'ready';
      else if (/api[- ]key/i.test(m) || c === 'auth/invalid-api-key' || c === 'invalid-argument') { state = 'bad-key'; problem = 'Firebase said the settings in config.js (FIREBASE_CONFIG) are not valid.'; }
      else if (c === 'not-found' || c === 'failed-precondition' || /does not exist|not been used|disabled/i.test(m)) { state = 'needs-setup'; problem = 'The Firestore database is missing or switched off for this Firebase project.'; }
      else { state = 'offline'; problem = 'Could not reach Firebase (offline?).'; }
    }
    if (state !== 'ready') { console.warn('Omni online:', problem); updateChip(); return false; }
    F.onAuthStateChanged(auth, u => {
      const was = user?.uid || null; user = u;
      if ((u?.uid || null) !== was && !signingUp) (u ? afterSignIn() : afterSignOut());
    });
    if (!auth.currentUser) updateChip();
    return true;
  }
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise((_, no) => setTimeout(() => no(Object.assign(new Error('timeout'), { code: 'unavailable' })), ms))]);
  }
  const must = () => { if (!F || state !== 'ready') throw new Error(problem || 'Not connected'); };
  const uid = () => user?.uid || null;
  const ref = (...path) => F.doc(db, ...path);

  // 8 letters/numbers that are easy to read out loud (no 0/O or 1/I)
  function makeCode() {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(8));
    return [...r].map(n => abc[n % abc.length]).join('');
  }
  const cleanCode = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  // usernames: 3–20 characters, a-z 0-9 _ . , starting with a letter (same rule as firestore.rules)
  const cleanUsername = v => String(v || '').trim().replace(/^@/, '').toLowerCase();
  function usernameProblem(u) {
    if (!/^[a-z][a-z0-9_.]{2,19}$/.test(u)) return 'Usernames are 3–20 characters: lowercase letters, numbers, _ and . , starting with a letter.';
    const f = Filter.apply(u, 'name');
    if (!f.ok || f.changed) return 'That username has a word the family filter doesn\'t allow. Please pick another.';
    return '';
  }
  async function usernameFree(u) { return !(await F.getDoc(ref('usernames', u))).exists(); }

  /* ---------- accounts ---------- */
  async function signUp({ email, password, displayName, username, birthYear, parentEmail }) {
    must();
    username = cleanUsername(username);
    const bad = usernameProblem(username); if (bad) throw new Error(bad);
    const year = new Date().getFullYear();
    const isMinor = birthYear > year - 19;            // same rule as firestore.rules
    signingUp = true;
    try {
      const cred = await F.createUserWithEmailAndPassword(auth, email, password).catch(e => { throw friendly(e); });
      user = cred.user;
      if (!(await usernameFree(username))) { await user.delete().catch(() => {}); user = null; throw new Error('Sorry, @' + username + ' is taken. Try another username.'); }
      // public profile + private details + friend code, saved together (all or nothing)
      let lastErr;
      for (let tries = 0; tries < 3; tries++) {
        const code = makeCode(), b = F.writeBatch(db);
        b.set(ref('profiles', user.uid), { name: displayName.slice(0, 24), status: '', avatar: okAvatar(myAvatar), username, updatedAt: F.serverTimestamp() });
        b.set(ref('usernames', username), { uid: user.uid });     // reserves the username in the same save
        b.set(ref('private', user.uid), { email: user.email, birthYear, isMinor, parentEmail: isMinor ? parentEmail : (parentEmail || ''), friendCode: code, createdAt: F.serverTimestamp() });
        b.set(ref('friendCodes', code), { uid: user.uid });
        try { await b.commit(); lastErr = null; break; } catch (e) { lastErr = e; }   // (a taken friend code fails: try another)
      }
      if (lastErr) { await user.delete().catch(() => {}); user = null; throw friendly(lastErr); }
    } finally { signingUp = false; }
    await afterSignIn();
    return { needsConfirm: false };
  }
  async function signIn(email, password) { must(); await F.signInWithEmailAndPassword(auth, email, password).catch(e => { throw friendly(e); }); }
  async function resetPassword(email) { must(); await F.sendPasswordResetEmail(auth, email).catch(e => { throw friendly(e); }); }
  async function signOut() { must(); await F.signOut(auth); }
  async function token() { return user ? user.getIdToken() : null; }     // for Ask Omni's server function

  async function afterSignIn() {
    try {
      const [p, priv] = await Promise.all([F.getDoc(ref('profiles', uid())), F.getDoc(ref('private', uid()))]);
      if (!priv.exists()) throw new Error('This account\'s setup didn\'t finish. Ask a parent to delete it (Firebase console → Authentication) and create it again.');
      profile = { ...(p.data() || {}), ...priv.data(), display_name: p.data()?.name || settings.name, friend_code: priv.data().friendCode };
      // your online name + picture win; a picture you only have on this device gets shared
      if (profile.name && profile.name !== settings.name) { settings.name = profile.name; saveSettings(); }
      if (profile.avatar && !myAvatar) { myAvatar = profile.avatar; store(AVATAR_KEY, myAvatar); }
      else if (myAvatar && !profile.avatar) avatarChanged(myAvatar);
      listenChats();
      if (!profile.username) askUsernameOnce();
    } catch (err) { console.warn('Omni online:', err.message); toast('Online: ' + friendly(err).message, 5000); }
    updateChip(); renderAll();
  }
  function afterSignOut() {
    stopAll(); profile = null;
    Object.keys(OL).forEach(k => OL[k] = {});
    attach(); updateChip(); renderAll(); toast('Signed out. Online chats are hidden until you sign in again.', 3500);
  }
  function stopAll() {
    if (stopChats) { stopChats(); stopChats = null; }
    Object.keys(stops).forEach(id => { stops[id].forEach(f => f()); delete stops[id]; });
  }

  /* ---------- profiles ---------- */
  // only small image data URLs are allowed online (firestore.rules checks this too)
  const okAvatar = url => (url && /^data:image\/(webp|jpeg|png);base64,/.test(url) && url.length <= 120000) ? url : '';
  function myCard() { return { name: (settings.name || 'Me').slice(0, 24), status: (settings.status || '').slice(0, 40), avatar: okAvatar(myAvatar), username: profile?.username || '' }; }
  async function saveProfile() {
    must();
    const card = myCard(), { username, ...pub } = card;
    await F.setDoc(ref('profiles', uid()), { ...pub, ...(username ? { username } : {}), updatedAt: F.serverTimestamp() });
    Object.assign(profile || {}, card, { display_name: card.name });
    // copy your public card into every chat you're in, so chat-mates see the change
    const b = F.writeBatch(db); let n = 0;
    Object.keys(OL.channels).forEach(id => { if (OL.cards[id]?.[uid()]) { b.update(ref('chats', id, 'members', uid()), card); n++; } });
    if (n) await b.commit();
  }
  async function avatarChanged(dataURL) {
    if (!ready()) return;
    if (dataURL && !okAvatar(dataURL)) return toast('That picture is too big to share online.', 3500);
    try { await saveProfile(); } catch (err) { toast('Picture not saved online: ' + friendly(err).message, 3500); }
  }
  async function profileChanged() {
    if (!ready()) return;
    try { await saveProfile(); } catch (err) { toast('Name not saved online: ' + friendly(err).message, 3500); }
  }
  // make sure your member card exists in a chat (someone may have started a DM with you)
  async function ensureCard(id) {
    if (OL.cards[id]?.[uid()]) return;
    const r = ref('chats', id, 'members', uid());
    const have = await F.getDoc(r);                         // (the live copy may just not have arrived yet)
    const card = have.exists() ? have.data() : { ...myCard(), code: '', joinedAt: F.serverTimestamp() };
    if (!have.exists()) await F.setDoc(r, card);
    (OL.cards[id] ||= {})[uid()] = card;
  }

  // Accounts made before usernames existed: ask once (Settings → Online account can do it later)
  function askUsernameOnce() {
    const key = 'omni_v4_asked_username_' + uid();
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    setTimeout(() => typeof pickUsername === 'function' && pickUsername(), 600);
  }
  async function setUsername(input) {
    must();
    const u = cleanUsername(input), bad = usernameProblem(u);
    if (bad) throw new Error(bad);
    if (profile?.username) throw new Error('You already have @' + profile.username + '.');
    if (!(await usernameFree(u))) throw new Error('Sorry, @' + u + ' is taken. Try another username.');
    const b = F.writeBatch(db);
    b.set(ref('usernames', u), { uid: uid() });
    b.update(ref('profiles', uid()), { username: u, updatedAt: F.serverTimestamp() });
    Object.keys(OL.channels).forEach(id => { if (OL.cards[id]?.[uid()]) b.update(ref('chats', id, 'members', uid()), { username: u }); });
    await b.commit().catch(e => { throw /permission/i.test(e.code || '') ? new Error('Sorry, @' + u + ' is taken. Try another username.') : friendly(e); });
    profile.username = u; updateChip();
    return u;
  }

  /* ---------- live updates: your chats, their members and messages ---------- */
  function listenChats() {
    stopAll();
    let first = true;
    const q = F.query(F.collection(db, 'chats'), F.where('memberIds', 'array-contains', uid()));
    // includeMetadataChanges: we also hear when a chat we just made has really been saved
    stopChats = F.onSnapshot(q, { includeMetadataChanges: true }, snap => {
      const seen = new Set();
      snap.forEach(d => {
        const c = d.data(); seen.add(d.id);
        // a chat you just created isn't on the server yet: wait before listening to it,
        // or the server would say "you're not a member" (it hasn't saved the chat yet)
        if (d.metadata.hasPendingWrites && !OL.channels[d.id]) { seen.delete(d.id); return; }
        OL.channels[d.id] = Object.assign(OL.channels[d.id] || {}, { id: d.id, kind: c.kind, name: c.name || '', mode: c.mode || '', invite_code: c.inviteCode || '', created_by: c.createdBy, memberIds: c.memberIds || [] });
        OL.members[d.id] = c.memberIds || [];
        if (!stops[d.id]) { listenChat(d.id); if (!first) toast(c.kind === 'dm' ? 'A friend started an online chat with you' : 'A new online chat appeared'); }
      });
      // chats you left (or were removed from)
      Object.keys(OL.channels).forEach(id => { if (!seen.has(id)) { (stops[id] || []).forEach(f => f()); delete stops[id]; delete OL.channels[id]; delete OL.msgs[id]; delete OL.cards[id]; delete OL.members[id]; } });
      first = false;
      attach(); renderAll();
    }, err => console.warn('Omni online: chats', err.code || err.message));
  }
  function listenChat(id) {
    OL.msgs[id] ||= [];
    let firstMsgs = true;
    const offMembers = F.onSnapshot(F.collection(db, 'chats', id, 'members'), snap => {
      OL.cards[id] = {};
      snap.forEach(d => {
        const m = d.data(); OL.cards[id][d.id] = m;
        OL.people[d.id] = { display_name: m.name, avatar_url: m.avatar || '', status: m.status || '', username: m.username || '' };
      });
      if (!OL.cards[id][uid()] && !snap.metadata.fromCache) ensureCard(id).catch(e => console.warn('Omni online: card', e.code || e.message));
      attach(); renderChat(); renderDMs();
    }, err => retry(id, 'members', err));
    const q = F.query(F.collection(db, 'chats', id, 'messages'), F.orderBy('createdAt', 'desc'), F.limit(300));
    const offMsgs = F.onSnapshot(q, snap => {
      const list = OL.msgs[id] ||= [];
      let ping = false;
      snap.docChanges().forEach(ch => {
        const d = ch.doc.data({ serverTimestamps: 'estimate' }), at = list.findIndex(m => m.rid === ch.doc.id);
        if (ch.type === 'removed') { if (at >= 0) list.splice(at, 1); return; }
        const m = toMsg(ch.doc.id, d);
        if (at >= 0) { const have = list[at]; have.text = m.text; have.gif = m.gif; if (m.edited) have.edited = m.edited; delete have.pending; return; }
        // keep the list in time order (newest last)
        let i = list.length; while (i > 0 && (list[i - 1].ts || 0) > m.ts) i--;
        list.splice(i, 0, m);
        if (!firstMsgs && !m.mine) ping = true;
      });
      if (ping) Sounds.play(OL.channels[id]?.kind === 'dm' ? 'dm' : 'receive');
      firstMsgs = false;
      saveData(); renderChat(); renderDMs();
    }, err => retry(id, 'messages', err));
    stops[id] = [offMembers, offMsgs];
  }
  // a listener that was refused (e.g. the chat was only just created) tries again once, a moment later
  function retry(id, what, err) {
    if (!stops[id] || stops[id].retried) return console.warn('Omni online:', what, err.code || err.message);
    stops[id].forEach(f => f());
    setTimeout(() => { if (OL.channels[id] && ready()) { listenChat(id); stops[id].retried = true; } }, 1500);
  }
  function toMsg(id, d) {
    const mine = d.uid === uid();
    const st = Filter.state;   // other people's words also go through the family filter
    const text = d.text && !mine && st.setup && st.enabled ? Filter.clean(d.text) : d.text || '';
    return { text, gif: d.gif ? { src: d.gif, alt: 'GIF' } : undefined, ts: d.createdAt?.toMillis?.() || Date.now(), edited: d.editedAt?.toMillis?.(),
      from: mine ? settings.name : d.name || OL.people[d.uid]?.display_name || 'Someone', mine, rid: id, uid: d.uid };
  }

  // DM partner = the other member of a DM chat
  const partner = ch => OL.people[(OL.members[ch.id] || []).find(u => u !== uid())] || { display_name: 'Friend' };
  const dmId = id => 'ol-' + id;

  /* Copy the online chats into Omni's lists for the current mode:
     data.servers.Online.channels[name] and data.dms['ol-<id>'] share the SAME
     arrays as OL.msgs, so new messages show up in both places. */
  function attach() {
    const signedIn = ready();
    Object.keys(data.dms).forEach(k => { if (data.dms[k].online) delete data.dms[k]; });
    if (!signedIn) {
      if (data.servers[SERVER]?.online) {
        delete data.servers[SERVER];
        if (data.server === SERVER) data.server = Object.keys(data.servers)[0];
        if (view.type === 'channel' && !srv().channels[view.id]) view = { type: 'channel', id: Object.keys(srv().channels)[0] };
      }
      if (view.type === 'dm' && !data.dms[view.id]) view = { type: 'channel', id: Object.keys(srv().channels)[0] };
      saveData(); return;
    }
    const channels = {};
    Object.values(OL.channels).filter(c => c.kind === 'group').forEach(c => {
      let key = c.name, n = 2;
      while (channels[key]) key = `${c.name}-${n++}`;     // two chats with the same name
      channels[key] = OL.msgs[c.id] ||= []; c.key = key;
    });
    // the Online server only shows once you have at least one online group chat
    if (Object.keys(channels).length) data.servers[SERVER] = { channels, online: true };
    else if (data.servers[SERVER]?.online) { delete data.servers[SERVER]; if (data.server === SERVER) data.server = Object.keys(data.servers)[0]; }
    Object.values(OL.channels).filter(c => c.kind === 'dm').forEach(c => {
      const p = partner(c);
      data.dms[dmId(c.id)] = { name: p.display_name, msgs: OL.msgs[c.id] ||= [], online: true, avatar: p.avatar_url || '' };
    });
    if (view.type === 'channel' && !srv().channels[view.id]) view = { type: 'channel', id: Object.keys(srv().channels)[0] };
    if (view.type === 'dm' && !data.dms[view.id]) view = { type: 'channel', id: Object.keys(srv().channels)[0] };
    saveData();
  }
  // Which online chat is on screen? (null for local chats)
  function current() {
    if (!ready()) return null;
    if (view.type === 'dm') return view.id.startsWith('ol-') ? OL.channels[view.id.slice(3)] || null : null;
    if (data.server !== SERVER) return null;
    return Object.values(OL.channels).find(c => c.kind === 'group' && c.key === view.id) || null;
  }

  /* ---------- called by app.js / extras.js after you send, edit or delete ---------- */
  // GIFs must be https links online (Omni's own GIFs work once Omni is hosted on https)
  function gifURL(gif) {
    const src = gif?.src || '';
    try { const abs = new URL(src, location.href).href; return abs.startsWith('https://') && abs.length <= 600 ? abs : ''; } catch { return ''; }
  }
  async function sent(m) {
    const ch = current(); if (!ch) return;
    const r = F.doc(F.collection(db, 'chats', ch.id, 'messages'));   // pick the id first, so the live copy matches this one
    m.rid = r.id; m.uid = uid(); m.pending = true;
    try {
      await ensureCard(ch.id);
      const gif = m.gif ? gifURL(m.gif) : '';
      const text = (m.text || (m.gif && !gif ? '[GIF]' : '')).slice(0, 2000);
      await F.setDoc(r, { uid: uid(), name: OL.cards[ch.id]?.[uid()]?.name || myCard().name, text, gif, createdAt: F.serverTimestamp() });
      delete m.pending; saveData();
    } catch (e) { delete m.pending; m.failed = true; toast('Not sent online: ' + friendly(e).message, 3500); }
  }
  function chatOf(m) { return Object.keys(OL.msgs).find(id => OL.msgs[id].includes(m)) || Object.keys(OL.msgs).find(id => OL.msgs[id].some(x => x.rid === m.rid)); }
  async function edited(m) {
    const id = ready() && m.rid && chatOf(m); if (!id) return;
    try { await F.updateDoc(ref('chats', id, 'messages', m.rid), { text: (m.text || '').slice(0, 2000), editedAt: F.serverTimestamp() }); }
    catch (e) { toast('Edit not saved online: ' + friendly(e).message, 3500); }
  }
  async function deleted(m) {
    const id = ready() && m.rid && (chatOf(m) || current()?.id); if (!id) return;
    try { await F.deleteDoc(ref('chats', id, 'messages', m.rid)); }
    catch (e) { toast('Not deleted online: ' + friendly(e).message, 3500); }
  }

  /* ---------- making + joining chats ---------- */
  // wait until the live listener has the chat (it usually already does)
  async function chatReady(id) {
    for (let i = 0; i < 50 && !OL.channels[id]; i++) await new Promise(r => setTimeout(r, 100));
    return OL.channels[id] || null;
  }
  async function createChat(name) {
    must();
    let lastErr;
    for (let tries = 0; tries < 3; tries++) {
      const code = makeCode(), c = F.doc(F.collection(db, 'chats')), b = F.writeBatch(db);
      b.set(c, { kind: 'group', name: name.slice(0, 32), mode: settings.mode, inviteCode: code, createdBy: uid(), createdAt: F.serverTimestamp(), memberIds: [uid()] });
      b.set(ref('inviteCodes', code), { chatId: c.id, createdBy: uid() });
      b.set(ref('chats', c.id, 'members', uid()), { ...myCard(), code, joinedAt: F.serverTimestamp() });
      try { await b.commit(); return await chatReady(c.id); } catch (e) { lastErr = e; }
    }
    throw friendly(lastErr);
  }
  async function joinChat(input) {
    must();
    const code = cleanCode(input);
    if (code.length !== 8) throw new Error('Invite codes are 8 letters/numbers.');
    const inv = await F.getDoc(ref('inviteCodes', code));
    if (!inv.exists()) throw new Error('No chat has that invite code. Check it with your friend.');
    const id = inv.data().chatId;
    if (OL.channels[id]) return OL.channels[id];                  // already in it
    const b = F.writeBatch(db);
    b.update(ref('chats', id), { memberIds: F.arrayUnion(uid()) });
    b.set(ref('chats', id, 'members', uid()), { ...myCard(), code, joinedAt: F.serverTimestamp() });
    await b.commit().catch(e => { throw friendly(e); });
    return chatReady(id);
  }
  // start a DM with a friend code, or an exact @username (no searching: it must match exactly)
  async function startDM(input) {
    must();
    const byName = String(input || '').trim().startsWith('@');
    const code = byName ? cleanUsername(input) : cleanCode(input);
    if (byName && usernameProblem(code)) throw new Error('That isn\'t a valid @username.');
    if (!byName && code.length !== 8) throw new Error('Friend codes are 8 letters/numbers (or type @username).');
    const fc = await F.getDoc(ref(byName ? 'usernames' : 'friendCodes', code));
    if (!fc.exists()) throw new Error(byName ? 'Nobody has the username @' + code + '.' : 'Nobody has that friend code. Check it with your friend.');
    const other = fc.data().uid;
    if (other === uid()) throw new Error('That\'s you!');
    const id = uid() < other ? `dm_${uid()}_${other}` : `dm_${other}_${uid()}`;
    if (OL.channels[id]) return OL.channels[id];
    const existing = await F.getDoc(ref('chats', id));
    if (!existing.exists()) {
      const b = F.writeBatch(db);
      b.set(ref('chats', id), { kind: 'dm', createdBy: uid(), createdAt: F.serverTimestamp(), memberIds: [uid(), other], ...(byName ? { username: code } : { friendCode: code }) });
      b.set(ref('chats', id, 'members', uid()), { ...myCard(), code: '', joinedAt: F.serverTimestamp() });
      await b.commit().catch(e => { throw friendly(e); });
    }
    return chatReady(id);
  }
  async function leaveChat(id) {
    must();
    const b = F.writeBatch(db);
    b.update(ref('chats', id), { memberIds: F.arrayRemove(uid()) });
    b.delete(ref('chats', id, 'members', uid()));
    await b.commit().catch(e => { throw friendly(e); });
  }

  function topicFor() {
    const ch = current(); if (!ch) return '';
    const p = ch.kind === 'dm' ? partner(ch) : null;
    return ch.kind === 'dm' ? `Direct message${p?.username ? ' with @' + p.username : ''} · online · only you two can read it`
      : `Online chat · invite code ${ch.invite_code} · ${(OL.members[ch.id] || []).length} member(s) · only members can read it`;
  }
  const avatarOf = id => OL.people[id]?.avatar_url || '';
  const usernameOf = id => (id === uid() ? profile?.username : OL.people[id]?.username) || '';
  const ready = () => !!(F && state === 'ready' && uid());

  function updateChip() {
    const chip = $('#onlineChip'); if (!chip) return;
    const on = ready();
    const text = { off: 'On this device only', connecting: 'Connecting…', 'bad-key': 'Online settings rejected', 'needs-setup': 'Online database not set up',
      offline: 'Offline · this device only', ready: on ? 'Online as ' + (profile?.display_name || user.email) : 'Online ready · not signed in' }[state];
    const cta = { off: 'Connect online', connecting: '', 'bad-key': 'How to fix', 'needs-setup': 'How to fix', offline: 'Retry', ready: on ? 'Account' : 'Sign in' }[state];
    chip.classList.toggle('on', on); chip.classList.toggle('warn', ['bad-key', 'needs-setup'].includes(state));
    $('#onlineText').textContent = text; chip.querySelector('.chip-cta').textContent = cta;
  }

  return {
    configured, init, signUp, setUsername, usernameOf, signIn, resetPassword, signOut, token, saveProfile, avatarChanged, profileChanged, attach, current, topicFor, avatarOf,
    createChat, joinChat, startDM, leaveChat, sent, edited, deleted, updateChip, SERVER,
    get ready() { return ready(); }, get state() { return state; }, get problem() { return problem; },
    get email() { return user?.email || ''; }, get profile() { return profile; }, get chats() { return Object.values(OL.channels); }
  };
})();

/* ---------- The "Online account" card in Settings ---------- */
function onlineCardHTML() {
  const head = (extra = '') => `<b>${icon('cloud')} Online account ${extra}</b>`;
  if (!Online.configured) {
    return `<div class="modal-card wide">${head('<span class="soon">Not connected</span>')}` +
      `<span>Omni is <b>local-only</b> right now: messages stay on this device and nobody else receives them. ` +
      `To connect it, a grown-up creates a free Firebase project and pastes its web settings into <b>config.js</b> as FIREBASE_CONFIG. ` +
      `README → “Going online with Firebase” has every step.</span></div>`;
  }
  if (Online.state !== 'ready') {
    const fix = { 'bad-key': 'Open the Firebase console → Project settings → Your apps → Web app, copy the <b>firebaseConfig</b> values, and paste them into config.js as FIREBASE_CONFIG.',
      'needs-setup': 'Open the Firebase console → Build → Firestore Database → Create database, then deploy <b>firebase/firestore.rules</b> (README → Going online).',
      offline: 'Check the internet connection, then reload Omni.', connecting: 'Still connecting…' }[Online.state] || '';
    return `<div class="modal-card wide">${head('<span class="soon">Not ready</span>')}<span>${esc(Online.problem || 'Connecting…')}</span><span>${fix}</span>` +
      `<span>Until then Omni keeps working on this device only.</span></div>`;
  }
  if (Online.ready) {
    const chats = Online.chats.filter(c => c.kind === 'group');
    return `<div class="modal-card wide">${head()}<span>Signed in as <b>${esc(Online.profile?.display_name || Online.email)}</b> ${Online.profile?.username ? '<span class="handle">@' + esc(Online.profile.username) + '</span>' : '<button class="close" id="olPickName">Pick a username</button>'} (${esc(Online.email)}).</span>` +
      `<span>Your friend code: <b class="code">${esc(Online.profile?.friend_code || '…')}</b> <button class="close" id="olCopyCode">${icon('copy')} Copy</button><br>` +
      `Only give it to people you know in real life: it lets them send you direct messages.</span>` +
      `<div class="row"><span class="row-left"><button class="confirm" id="olNewChat">${icon('plus')} New online chat</button><button class="close" id="olJoin">${icon('link')} Join with code</button>` +
      `<button class="close" id="olDM">${icon('at')} Message a friend</button></span><button class="close" id="olOut">${icon('leave')} Sign out</button></div>` +
      (chats.length ? `<div class="ol-chats">${chats.map(c => `<div class="row"><span>#${esc(c.key || c.name)} · code <b class="code">${esc(c.invite_code)}</b></span><button class="close" data-ol-leave="${esc(c.id)}">Leave</button></div>`).join('')}</div>` : '') +
      `<span class="form-error" id="olErr"></span></div>`;
  }
  return `<div class="modal-card wide">${head()}<span>Sign in to chat with friends online. Your local servers and notes stay on this device.</span>` +
    `<div class="row"><input class="mini-input" id="olEmail" type="email" placeholder="Email" autocomplete="email"><input class="mini-input" id="olPass" type="password" placeholder="Password" autocomplete="current-password"></div>` +
    `<div class="row"><span class="row-left"><button class="confirm" id="olIn">Sign in</button><button class="close" id="olForgot">Forgot password?</button></span><button class="close" id="olNew">Create account…</button></div>` +
    `<span class="form-error" id="olErr"></span></div>`;
}
function bindOnline() {
  const err = m => { if ($('#olErr')) $('#olErr').textContent = m; };
  const run = async (fn, okMsg, close = true) => { try { await Online.init(); await fn(); if (okMsg) toast(okMsg, 3500); if (close) closeModal(); } catch (e) { err(e.message || String(e)); } };
  const on = (id, fn) => { if ($(id)) $(id).onclick = fn; };
  on('#olIn', () => run(() => Online.signIn($('#olEmail').value.trim(), $('#olPass').value), 'Signed in'));
  on('#olForgot', () => {
    const email = $('#olEmail').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return err('Type your email above first, then press "Forgot password?".');
    run(() => Online.resetPassword(email), 'If that email has an account, a reset link is on its way', false);
  });
  on('#olOut', () => run(() => Online.signOut()));
  on('#olNew', openSignUp);
  on('#olCopyCode', () => navigator.clipboard?.writeText(Online.profile?.friend_code || '').then(() => toast('Friend code copied')));
  on('#olPickName', () => { closeModal(); pickUsername(); });
  on('#olNewChat', () => { closeModal(); onlineAsk('new'); });
  on('#olJoin', () => { closeModal(); onlineAsk('join'); });
  on('#olDM', () => { closeModal(); onlineAsk('dm'); });
  $$('[data-ol-leave]').forEach(b => b.onclick = () => run(() => Online.leaveChat(b.dataset.olLeave).then(renderAll), 'Left the chat'));
}
// One small window for: new online chat · join with an invite code · DM a friend code
function onlineAsk(kind) {
  const t = { new: ['New online chat', 'Friends join it with its invite code.', 'chat-name', 'Create'],
    join: ['Join an online chat', 'Type the invite code a friend gave you.', 'Invite code (8 letters/numbers)', 'Join'],
    dm: ['Message a friend', 'Type your friend\'s friend code, or their exact @username. They can find both in Settings → Online account.', 'Friend code or @username', 'Start chatting'] }[kind];
  modal(t[0], t[1], `<div class="modal-card wide"><input id="olAsk" class="modal-input" placeholder="${t[2]}" maxlength="32" autocomplete="off"><span class="form-error" id="olAskErr"></span></div>`, async () => {
    const v = $('#olAsk').value.trim(); if (!v) return false;
    const fail = e => { $('#olAskErr').textContent = e.message || String(e); return false; };
    try {
      if (kind === 'new') {
        const name = slug(v); if (!name || guard(v, 'name') === null) return false;
        const c = await Online.createChat(name); goOnline(c); if (c) toast(`Created #${c.key} · invite code ${c.invite_code}`, 5000);
      } else if (kind === 'join') { const c = await Online.joinChat(v); goOnline(c); if (c) toast('Joined #' + c.key); }
      else { const c = await Online.startDM(v); goOnline(c); }
    } catch (e) { return fail(e); }
  }, t[3]);
}
function goOnline(c) {
  renderAll();
  if (!c) return;
  if (c.kind === 'dm') openDM('ol-' + c.id);
  else { data.server = Online.SERVER; saveData(); renderServers(); openChannel(c.key); }
}
function openSignUp() {
  const year = new Date().getFullYear();
  modal('Create an Omni account', 'Kids under 18 need a parent or guardian email, so a grown-up knows about the account. Your email, birth year and parent email are private: only you can see them.',
    `<div class="modal-card"><b>Display name</b><input class="modal-input" id="suName" maxlength="24" value="${esc(settings.name)}"></div>` +
    `<div class="modal-card"><b>Username (unique)</b><input class="modal-input" id="suUser" maxlength="21" placeholder="e.g. keagan_14" autocomplete="username"><span class="handle">3–20: a-z, 0-9, _ and . (start with a letter). Display names don't have to be unique.</span></div>` +
    `<div class="modal-card"><b>Email</b><input class="modal-input" id="suEmail" type="email" autocomplete="email"></div>` +
    `<div class="modal-card"><b>Password (8+ characters)</b><input class="modal-input" id="suPass" type="password" autocomplete="new-password"></div>` +
    `<div class="modal-card"><b>Year you were born</b><input class="modal-input" id="suYear" type="number" min="1900" max="${year}" placeholder="e.g. ${year - 14}"></div>` +
    `<div class="modal-card wide" id="suParentCard"><b>Parent / guardian email</b><input class="modal-input" id="suParent" type="email" placeholder="Needed if you're under 18"></div>` +
    `<div class="modal-card wide"><span class="form-error" id="suErr"></span></div>`, async () => {
      const err = m => { $('#suErr').textContent = m; return false; };
      const name = $('#suName').value.trim(), email = $('#suEmail').value.trim(), pass = $('#suPass').value;
      const username = $('#suUser').value.trim().replace(/^@/, '').toLowerCase();
      if (!/^[a-z][a-z0-9_.]{2,19}$/.test(username)) return err('Usernames are 3–20 characters: lowercase letters, numbers, _ and . , starting with a letter.');
      const by = parseInt($('#suYear').value, 10), parent = $('#suParent').value.trim();
      const minor = by > year - 19;      // born in the last 18 years counts as under 18 (same as the server rules)
      if (!name || guard(name, 'name') === null) return err('Please choose a friendly display name.');
      if (!/^\S+@\S+\.\S+$/.test(email)) return err('Please enter a real email address.');
      if (pass.length < 8) return err('The password needs at least 8 characters.');
      if (!(by >= 1900 && by <= year)) return err('Please enter the year you were born.');
      if (minor && !/^\S+@\S+\.\S+$/.test(parent)) return err('You\'re under 18, so please add a parent or guardian email.');
      try { await Online.init(); await Online.signUp({ email, password: pass, displayName: name, username, birthYear: by, parentEmail: parent }); }
      catch (e) { return err(e.message || String(e)); }
      toast('Account created and signed in', 5000);
    }, 'Create account');
}
// Pick a username (new accounts do this at sign-up; older accounts are asked once)
function pickUsername() {
  modal('Pick a username', 'Usernames are unique, so friends can find the right you. Your display name can stay the same as anyone else\'s.',
    `<div class="modal-card wide"><input id="unInput" class="modal-input" maxlength="21" placeholder="@username" autocomplete="off">` +
    `<span class="handle">3–20 characters: a-z, 0-9, _ and . , starting with a letter.</span><span class="form-error" id="unErr"></span></div>`, async () => {
      try { const u = await Online.setUsername($('#unInput').value); toast('You are now @' + u, 4000); renderAll(); }
      catch (e) { $('#unErr').textContent = e.message || String(e); return false; }
    }, 'Save username');
}
$('#onlineChip').onclick = () => {
  if (Online.configured) {
    if (Online.state === 'offline') return location.reload();
    return $('#settingsBtn').click();
  }
  modal('Connect Omni online', 'Right now Omni is local-only: everything is saved in this browser and nobody else receives your messages.',
    `<div class="modal-card wide"><b>What going online needs</b><ul><li>A free <b>Firebase</b> project (sign-in + database + live messages).</li>` +
    `<li>Turn on Email/Password sign-in and Cloud Firestore, then deploy <b>firebase/firestore.rules</b> (the privacy rules).</li>` +
    `<li>Paste the web app settings into <b>config.js</b> as FIREBASE_CONFIG.</li><li>Optional: a Giphy/Tenor key for GIF search, and the Ask Omni server function.</li></ul></div>` +
    `<div class="modal-card wide"><span>Ask a parent to help. The full step-by-step guide is in README.md → “Going online with Firebase”.</span></div>`, null, 'OK');
};
// In the Online server, "add channel" makes an online chat; "new message" asks for a friend code
document.addEventListener('click', e => {
  if (!Online.ready) return;
  if (e.target.closest('#addChannelBtn') && data.server === Online.SERVER) { e.stopImmediatePropagation(); onlineAsk('new'); }
  else if (e.target.closest('#addContactBtn') && data.server === Online.SERVER) { e.stopImmediatePropagation(); onlineAsk('dm'); }
}, true);
Online.updateChip();
if (Online.configured) Online.init().catch(e => console.warn('Omni online:', e.message));
