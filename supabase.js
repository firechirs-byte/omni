/* =====================================================================
   Omni — supabase.js   (going online: OPTIONAL, off until config.js is filled in)

   While SUPABASE_URL / SUPABASE_ANON_KEY in config.js are empty, this file
   does nothing except show "Connect online" hints. Nothing is downloaded
   and nothing leaves the device.

   When they ARE set:
     • supabase-js is loaded from a CDN (only then)
     • Omni checks the project: is the key right? was schema.sql run?
     • sign up / sign in with email + password (or an emailed sign-in link)
     • an "Online" server appears in the left rail with your online group
       chats; online direct messages appear in your Messages list
     • messages arrive live (Supabase Realtime), edits + deletes sync
     • your profile picture is uploaded to the "avatars" bucket
   Everything else (local servers, local DMs, notes) stays on this device.
   The privacy rules live in the database: supabase/schema.sql (RLS).
   ===================================================================== */
const Online = (() => {
  const cfg = typeof OMNI_CONFIG !== 'undefined' ? OMNI_CONFIG : {};
  const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  const SERVER = 'Online';            // the name of the online server in the rail
  // state: 'off' (no config) · 'connecting' · 'bad-key' · 'needs-schema' · 'offline' · 'ready'
  let state = configured ? 'connecting' : 'off', problem = '';
  let sb = null, session = null, profile = null, live = null;
  // what we know from the server (kept in memory, copied into Omni's lists by attach())
  const OL = { channels: {}, msgs: {}, people: {}, members: {} };   // channels/msgs/members by channel id, people by user id

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('offline'));
      document.head.append(s);
    });
  }
  // Explain a Supabase error in kid-friendly words
  // Turn Supabase's sign-up/sign-in errors into words a kid (or parent) can act on
  function friendly(err) {
    const m = err?.message || String(err);
    if (/email address not authorized/i.test(m)) return new Error('Supabase can\'t email that address yet: its built-in email only reaches the project team. A parent needs to set up email (SMTP), or turn off "Confirm email". See README step 3.');
    if (/rate limit/i.test(m)) return new Error('Too many emails were sent in the last hour. Wait a bit, or set up custom email (README step 3).');
    if (/email not confirmed/i.test(m)) return new Error('Email not confirmed yet: open the email from Supabase and click the link first.');
    if (/invalid login credentials/i.test(m)) return new Error('That email and password don\'t match an account.');
    return err;
  }
  function explain(err) {
    const msg = err?.message || String(err || '');
    if (/invalid api key|no api key|jws|jwt/i.test(msg)) return 'bad-key';
    if (err?.code === 'PGRST205' || err?.code === '42P01' || /schema cache|does not exist|could not find the (table|function)/i.test(msg)) return 'needs-schema';
    return '';
  }

  async function init() {
    if (!configured) return false;
    if (sb) return state === 'ready';
    try { await loadScript(CDN); } catch { state = 'offline'; problem = 'Could not download the Supabase library (are you offline?).'; updateChip(); return false; }
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, storageKey: 'omni_v4_auth' } });
    // Is the key right, and was schema.sql run? (a "permission denied" answer means the table exists: good)
    const { error } = await sb.from('profiles').select('id').limit(1);
    const why = error && explain(error);
    if (why === 'bad-key') { state = 'bad-key'; problem = 'Supabase said the key in config.js is not valid for this project.'; }
    else if (why === 'needs-schema') { state = 'needs-schema'; problem = 'The Omni tables are missing. Run supabase/schema.sql in the Supabase SQL Editor.'; }
    else if (error && /fetch|network/i.test(error.message)) { state = 'offline'; problem = 'Could not reach Supabase (offline?).'; }
    else state = 'ready';
    if (state !== 'ready') { console.warn('Omni online:', problem); updateChip(); return false; }
    session = (await sb.auth.getSession()).data.session;
    sb.auth.onAuthStateChange((event, s) => {
      const was = session?.user?.id; session = s;
      if ((s?.user?.id || null) !== (was || null)) setTimeout(() => (s ? afterSignIn() : afterSignOut()), 0);   // setTimeout: Supabase's advice for auth callbacks
    });
    if (session) await afterSignIn(); else updateChip();
    return true;
  }
  const must = () => { if (!sb || state !== 'ready') throw new Error(problem || 'Not connected'); };
  const uid = () => session?.user?.id || null;
  const check = ({ data: d, error }) => { if (error) throw error; return d; };

  /* ---------- accounts ---------- */
  const redirect = () => /^https?:/.test(location.protocol) ? location.href.split('#')[0] : undefined;   // file:// can't be a redirect
  async function signUp({ email, password, displayName, isMinor, parentEmail }) {
    must();
    // the profile row is created by a database trigger from this "metadata" (see schema.sql)
    const res = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirect(), data: { display_name: displayName, is_minor: !!isMinor, parent_email: parentEmail || null } } });
    if (res.error) throw friendly(res.error);
    return { needsConfirm: !res.data.session };   // email confirmation is ON by default in Supabase
  }
  async function signIn(email, password) { must(); const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw friendly(error); }
  async function magicLink(email) { must(); const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect(), shouldCreateUser: false } }); if (error) throw friendly(error); }
  async function signOut() { must(); await sb.auth.signOut(); }

  async function afterSignIn() {
    try {
      profile = (check(await sb.rpc('my_profile')) || [])[0] || null;
      if (profile) {
        // your online name + picture win; a picture you only have locally gets uploaded
        if (profile.display_name && profile.display_name !== settings.name) { settings.name = profile.display_name; saveSettings(); }
        if (profile.avatar_url && !myAvatar) { myAvatar = profile.avatar_url; store(AVATAR_KEY, myAvatar); }
        else if (myAvatar && myAvatar.startsWith('data:') && !profile.avatar_url) avatarChanged(myAvatar);
      }
      await refresh();
      subscribe();
    } catch (err) { console.warn('Omni online:', err.message); toast('Online: ' + err.message, 4000); }
    updateChip(); renderAll();
  }
  function afterSignOut() {
    if (live) { sb.removeChannel(live); live = null; }
    profile = null; Object.keys(OL).forEach(k => OL[k] = {});
    attach(); updateChip(); toast('Signed out. Online chats are hidden until you sign in again.', 3500);
  }

  /* ---------- profiles ---------- */
  async function saveProfile(changes) {
    must(); const allowed = {};
    ['display_name', 'status', 'avatar_url'].forEach(k => { if (k in changes) allowed[k] = changes[k]; });   // never is_minor / parent fields
    check(await sb.from('profiles').update(allowed).eq('id', uid()));
    Object.assign(profile || {}, allowed);
  }
  async function loadPeople(ids) {
    const need = ids.filter(id => id && !OL.people[id]);
    if (!need.length) return;
    (check(await sb.from('profiles').select('id, display_name, avatar_url, status').in('id', need)) || []).forEach(p => OL.people[p.id] = p);
  }

  /* ---------- storage (pictures) ---------- */
  async function uploadPicture(bucket, dataURL, name) {
    must();
    const blob = await (await fetch(dataURL)).blob();
    const path = `${uid()}/${name}`;   // each person can only write inside their own folder (schema.sql)
    check(await sb.storage.from(bucket).upload(path, blob, { upsert: true, contentType: blob.type }));
    return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }
  async function avatarChanged(dataURL) {
    if (!ready()) return;
    try {
      const url = dataURL ? await uploadPicture('avatars', dataURL, 'avatar.' + (dataURL.includes('webp') ? 'webp' : 'jpg')) + '?v=' + Date.now() : null;
      await saveProfile({ avatar_url: url });
    } catch (err) { toast('Picture not saved online: ' + err.message, 3500); }
  }
  async function profileChanged() {
    if (!ready()) return;
    try { await saveProfile({ display_name: settings.name.slice(0, 24), status: (settings.status || '').slice(0, 40) || null }); }
    catch (err) { toast('Name not saved online: ' + err.message, 3500); }
  }

  /* ---------- chats: download everything you're a member of ---------- */
  function rowToMsg(row) {
    const mine = row.user_id === uid();
    const st = Filter.state;   // other people's words also go through the family filter
    const text = row.text && !mine && st.setup && st.enabled ? Filter.clean(row.text) : row.text || '';
    return { text, gif: row.gif_url ? { src: row.gif_url, alt: 'GIF' } : undefined, ts: Date.parse(row.created_at), edited: row.edited_at ? Date.parse(row.edited_at) : undefined,
      from: mine ? settings.name : row.author_name || OL.people[row.user_id]?.display_name || 'Someone', mine, rid: row.id, uid: row.user_id };
  }
  async function refresh() {
    must();
    const chans = check(await sb.from('channels').select('id, kind, name, mode, invite_code, created_by').order('created_at')) || [];
    OL.channels = Object.fromEntries(chans.map(c => [c.id, c]));
    const ids = Object.keys(OL.channels);
    OL.members = {};
    if (ids.length) {
      (check(await sb.from('channel_members').select('channel_id, user_id').in('channel_id', ids)) || [])
        .forEach(m => (OL.members[m.channel_id] ||= []).push(m.user_id));
      await loadPeople([...new Set(Object.values(OL.members).flat())]);
      const rows = check(await sb.from('messages').select('*').in('channel_id', ids).order('created_at', { ascending: false }).limit(500)) || [];
      OL.msgs = {}; ids.forEach(id => OL.msgs[id] = []);
      rows.reverse().forEach(r => OL.msgs[r.channel_id]?.push(rowToMsg(r)));
    }
    attach();
  }
  // DM partner = the other member of a DM channel
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
  // Which online channel is on screen? (null for local chats)
  function current() {
    if (!ready()) return null;
    if (view.type === 'dm') return view.id.startsWith('ol-') ? OL.channels[view.id.slice(3)] || null : null;
    if (data.server !== SERVER) return null;
    return Object.values(OL.channels).find(c => c.kind === 'group' && c.key === view.id) || null;
  }

  /* ---------- live updates ---------- */
  function subscribe() {
    if (live) sb.removeChannel(live);
    live = sb.channel('omni-live-' + uid())
      // RLS means you only receive messages from chats you're in
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, p => onMessage(p.eventType, p.eventType === 'DELETE' ? p.old : p.new))
      // someone started a DM with you / added you to a chat → download it
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channel_members', filter: `user_id=eq.${uid()}` }, () => refresh().then(() => { renderAll(); toast('A new online chat appeared'); }).catch(() => {}))
      .subscribe(status => { if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('Omni online: live updates', status); });
  }
  async function onMessage(type, row) {
    if (type === 'DELETE') {
      // deleted rows only carry their id
      for (const list of Object.values(OL.msgs)) { const at = list.findIndex(m => m.rid === row.id); if (at >= 0) list.splice(at, 1); }
    } else {
      const list = OL.msgs[row.channel_id];
      if (!list) return refresh().then(renderAll).catch(() => {});   // a chat we didn't know about yet
      const have = list.find(m => m.rid === row.id);
      if (type === 'UPDATE') { if (have) { const m = rowToMsg(row); have.text = m.text; have.edited = m.edited || Date.now(); } }
      else if (!have) {
        // our own message: match it to the copy we already show (it's waiting for its id)
        const pending = row.user_id === uid() && list.find(m => m.pending && m.text === (row.text || '') );
        if (pending) { pending.rid = row.id; delete pending.pending; }
        else {
          if (!OL.people[row.user_id]) await loadPeople([row.user_id]).catch(() => {});
          list.push(rowToMsg(row));
          if (row.user_id !== uid()) Sounds.play(OL.channels[row.channel_id]?.kind === 'dm' ? 'dm' : 'receive');
        }
      }
    }
    saveData(); renderChat(); renderDMs();
  }

  /* ---------- called by app.js / extras.js after you send, edit or delete ---------- */
  async function gifURL(gif) {
    const src = gif?.src || '';
    if (/^https:\/\//.test(src)) return src;
    const abs = new URL(src, location.href).href;
    if (abs.startsWith('https://')) return abs;                       // Omni's own GIFs, when Omni is hosted on https
    try { return await uploadPicture('gifs', src.startsWith('data:') ? src : abs, Date.now() + '.gif'); } catch { return null; }
  }
  async function sent(m) {
    const ch = current(); if (!ch) return;
    m.pending = true; m.uid = uid();
    try {
      const gif_url = m.gif ? await gifURL(m.gif) : null;
      const text = m.text || (m.gif && !gif_url ? '[GIF]' : null);
      const row = check(await sb.from('messages').insert({ channel_id: ch.id, user_id: uid(), text, gif_url }).select('id').single());
      if (m.pending) { m.rid = row.id; delete m.pending; }
      // (if Realtime got here first, onMessage already matched it)
      const dup = OL.msgs[ch.id].filter(x => x.rid === row.id); if (dup.length > 1) OL.msgs[ch.id].splice(OL.msgs[ch.id].lastIndexOf(dup[1]), 1);
      saveData();
    } catch (e) { delete m.pending; m.failed = true; toast('Not sent online: ' + e.message, 3500); }
  }
  async function edited(m) { if (ready() && m.rid) { try { check(await sb.from('messages').update({ text: m.text, edited_at: new Date().toISOString() }).eq('id', m.rid)); } catch (e) { toast('Edit not saved online: ' + e.message, 3500); } } }
  async function deleted(m) { if (ready() && m.rid) { try { check(await sb.from('messages').delete().eq('id', m.rid)); } catch (e) { toast('Not deleted online: ' + e.message, 3500); } } }

  /* ---------- making + joining chats ---------- */
  async function createChat(name) {
    must();
    const c = check(await sb.from('channels').insert({ name, mode: settings.mode, created_by: uid() }).select('id, invite_code').single());
    await refresh(); return OL.channels[c.id];
  }
  async function joinChat(code) { must(); const id = check(await sb.rpc('join_channel', { code })); await refresh(); return OL.channels[id]; }
  async function startDM(friend) { must(); const id = check(await sb.rpc('start_dm', { friend })); await refresh(); return OL.channels[id]; }
  async function leaveChat(id) { must(); check(await sb.from('channel_members').delete().eq('channel_id', id).eq('user_id', uid())); await refresh(); }

  function topicFor() {
    const ch = current(); if (!ch) return '';
    return ch.kind === 'dm' ? 'Direct message · online · only you two can read it'
      : `Online chat · invite code ${ch.invite_code} · ${(OL.members[ch.id] || []).length} member(s) · only members can read it`;
  }
  const avatarOf = id => OL.people[id]?.avatar_url || '';
  const ready = () => !!(sb && state === 'ready' && uid());

  function updateChip() {
    const chip = $('#onlineChip'); if (!chip) return;
    const on = ready();
    const text = { off: 'On this device only', connecting: 'Connecting…', 'bad-key': 'Online key rejected', 'needs-schema': 'Online database not set up',
      offline: 'Offline · this device only', ready: on ? 'Online as ' + (profile?.display_name || session.user.email) : 'Online ready · not signed in' }[state];
    const cta = { off: 'Connect online', connecting: '', 'bad-key': 'How to fix', 'needs-schema': 'How to fix', offline: 'Retry', ready: on ? 'Account' : 'Sign in' }[state];
    chip.classList.toggle('on', on); chip.classList.toggle('warn', ['bad-key', 'needs-schema'].includes(state));
    $('#onlineText').textContent = text; chip.querySelector('.chip-cta').textContent = cta;
  }

  return {
    configured, init, signUp, signIn, magicLink, signOut, saveProfile, avatarChanged, profileChanged, refresh, attach, current, topicFor, avatarOf,
    createChat, joinChat, startDM, leaveChat, sent, edited, deleted, updateChip, SERVER,
    get ready() { return ready(); }, get state() { return state; }, get problem() { return problem; },
    get session() { return session; }, get profile() { return profile; }, get chats() { return Object.values(OL.channels); }
  };
})();

/* ---------- The "Online account" card in Settings ---------- */
function onlineCardHTML() {
  const head = (extra = '') => `<b>${icon('cloud')} Online account ${extra}</b>`;
  if (!Online.configured) {
    return `<div class="modal-card wide">${head('<span class="soon">Not connected</span>')}` +
      `<span>Omni is <b>local-only</b> right now: messages stay on this device and nobody else receives them. ` +
      `To connect it, a grown-up creates a free Supabase project, runs <b>supabase/schema.sql</b>, and pastes the project URL + anon key into <b>config.js</b>. ` +
      `README → “Going online with Supabase” has every step.</span></div>`;
  }
  if (Online.state !== 'ready') {
    const fix = { 'bad-key': 'Open Supabase → Project Settings → API Keys, copy the <b>publishable</b> (or legacy <b>anon</b>) key for <em>this</em> project, and paste it into config.js as SUPABASE_ANON_KEY.',
      'needs-schema': 'Open Supabase → SQL Editor → New query, paste all of <b>supabase/schema.sql</b>, press Run, then reload Omni.',
      offline: 'Check the internet connection, then reload Omni.', connecting: 'Still connecting…' }[Online.state] || '';
    return `<div class="modal-card wide">${head('<span class="soon">Not ready</span>')}<span>${esc(Online.problem || 'Connecting…')}</span><span>${fix}</span>` +
      `<span>Until then Omni keeps working on this device only.</span></div>`;
  }
  if (Online.ready) {
    const chats = Online.chats.filter(c => c.kind === 'group');
    return `<div class="modal-card wide">${head()}<span>Signed in as <b>${esc(Online.profile?.display_name || Online.session.user.email)}</b> (${esc(Online.session.user.email)}).</span>` +
      `<span>Your friend code: <b class="code">${esc(Online.profile?.friend_code || '…')}</b> <button class="close" id="olCopyCode">${icon('copy')} Copy</button><br>` +
      `Only give it to people you know in real life: it lets them send you direct messages.</span>` +
      `<div class="row"><span class="row-left"><button class="confirm" id="olNewChat">${icon('plus')} New online chat</button><button class="close" id="olJoin">${icon('link')} Join with code</button>` +
      `<button class="close" id="olDM">${icon('at')} Message a friend</button></span><button class="close" id="olOut">${icon('leave')} Sign out</button></div>` +
      (chats.length ? `<div class="ol-chats">${chats.map(c => `<div class="row"><span>#${esc(c.key || c.name)} · code <b class="code">${esc(c.invite_code)}</b></span><button class="close" data-ol-leave="${c.id}">Leave</button></div>`).join('')}</div>` : '') +
      `<span class="form-error" id="olErr"></span></div>`;
  }
  return `<div class="modal-card wide">${head()}<span>Sign in to chat with friends online. Your local servers and notes stay on this device.</span>` +
    `<div class="row"><input class="mini-input" id="olEmail" type="email" placeholder="Email" autocomplete="email"><input class="mini-input" id="olPass" type="password" placeholder="Password" autocomplete="current-password"></div>` +
    `<div class="row"><span class="row-left"><button class="confirm" id="olIn">Sign in</button><button class="close" id="olMagic">Email me a sign-in link</button></span><button class="close" id="olNew">Create account…</button></div>` +
    `<span class="form-error" id="olErr"></span></div>`;
}
function bindOnline() {
  const err = m => { if ($('#olErr')) $('#olErr').textContent = m; };
  const run = async (fn, okMsg, close = true) => { try { await Online.init(); await fn(); if (okMsg) toast(okMsg, 3500); if (close) closeModal(); } catch (e) { err(e.message || String(e)); } };
  const on = (id, fn) => { if ($(id)) $(id).onclick = fn; };
  on('#olIn', () => run(() => Online.signIn($('#olEmail').value.trim(), $('#olPass').value), 'Signed in'));
  on('#olMagic', () => run(() => Online.magicLink($('#olEmail').value.trim()), 'Check your email for the sign-in link'));
  on('#olOut', () => run(() => Online.signOut()));
  on('#olNew', openSignUp);
  on('#olCopyCode', () => navigator.clipboard?.writeText(Online.profile?.friend_code || '').then(() => toast('Friend code copied')));
  on('#olNewChat', () => { closeModal(); onlineAsk('new'); });
  on('#olJoin', () => { closeModal(); onlineAsk('join'); });
  on('#olDM', () => { closeModal(); onlineAsk('dm'); });
  $$('[data-ol-leave]').forEach(b => b.onclick = () => run(() => Online.leaveChat(b.dataset.olLeave).then(renderAll), 'Left the chat'));
}
// One small window for: new online chat · join with an invite code · DM a friend code
function onlineAsk(kind) {
  const t = { new: ['New online chat', 'Friends join it with its invite code.', 'chat-name', 'Create'],
    join: ['Join an online chat', 'Type the invite code a friend gave you.', 'Invite code (8 letters/numbers)', 'Join'],
    dm: ['Message a friend', 'Type your friend\'s friend code. They can find theirs in Settings → Online account.', 'Friend code', 'Start chatting'] }[kind];
  modal(t[0], t[1], `<div class="modal-card wide"><input id="olAsk" class="modal-input" placeholder="${t[2]}" maxlength="32" autocomplete="off"><span class="form-error" id="olAskErr"></span></div>`, async () => {
    const v = $('#olAsk').value.trim(); if (!v) return false;
    const fail = e => { $('#olAskErr').textContent = e.message || String(e); return false; };
    try {
      if (kind === 'new') {
        const name = slug(v); if (!name || guard(v, 'name') === null) return false;
        const c = await Online.createChat(name); goOnline(c); toast(`Created #${c.key} · invite code ${c.invite_code}`, 5000);
      } else if (kind === 'join') { const c = await Online.joinChat(v); goOnline(c); toast('Joined #' + c.key); }
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
  modal('Create an Omni account', 'Kids under 18 need a parent or guardian email, so a grown-up knows about the account.',
    `<div class="modal-card"><b>Display name</b><input class="modal-input" id="suName" maxlength="24" value="${esc(settings.name)}"></div>` +
    `<div class="modal-card"><b>Email</b><input class="modal-input" id="suEmail" type="email" autocomplete="email"></div>` +
    `<div class="modal-card"><b>Password (8+ characters)</b><input class="modal-input" id="suPass" type="password" autocomplete="new-password"></div>` +
    `<div class="modal-card"><label class="check-line"><input type="checkbox" id="suMinor" checked> <em>I am under 18</em></label><input class="modal-input" id="suParent" type="email" placeholder="Parent / guardian email"></div>` +
    `<div class="modal-card wide"><span class="form-error" id="suErr"></span></div>`, async () => {
      const err = m => { $('#suErr').textContent = m; return false; };
      const name = $('#suName').value.trim(), email = $('#suEmail').value.trim(), pass = $('#suPass').value;
      const minor = $('#suMinor').checked, parent = $('#suParent').value.trim();
      if (!name || guard(name, 'name') === null) return err('Please choose a friendly display name.');
      if (!/^\S+@\S+\.\S+$/.test(email)) return err('Please enter a real email address.');
      if (pass.length < 8) return err('The password needs at least 8 characters.');
      if (minor && !/^\S+@\S+\.\S+$/.test(parent)) return err('Please add a parent or guardian email.');
      let r;
      try { await Online.init(); r = await Online.signUp({ email, password: pass, displayName: name, isMinor: minor, parentEmail: parent }); }
      catch (e) { return err(e.message || String(e)); }
      toast(r.needsConfirm ? 'Account created! Open the email from Supabase and click the link, then sign in here.' : 'Account created and signed in', 6000);
    }, 'Create account');
}
$('#onlineChip').onclick = () => {
  if (Online.configured) {
    if (Online.state === 'offline') return location.reload();
    return $('#settingsBtn').click();
  }
  modal('Connect Omni online', 'Right now Omni is local-only: everything is saved in this browser and nobody else receives your messages.',
    `<div class="modal-card wide"><b>What going online needs</b><ul><li>A free <b>Supabase</b> project (database + sign-in + live messages).</li>` +
    `<li>Run <b>supabase/schema.sql</b> in its SQL editor. It sets up the tables and the privacy rules.</li>` +
    `<li>Paste the project URL and anon key into <b>config.js</b>.</li><li>Optional: a Giphy/Tenor key for GIF search, and the Ask Omni server function.</li></ul></div>` +
    `<div class="modal-card wide"><span>Ask a parent to help. The full step-by-step guide is in README.md → “Going online with Supabase”.</span></div>`, null, 'OK');
};
// In the Online server, "add channel" makes an online chat; with an online DM open, "new message" asks for a friend code
document.addEventListener('click', e => {
  if (!Online.ready) return;
  if (e.target.closest('#addChannelBtn') && data.server === Online.SERVER) { e.stopImmediatePropagation(); onlineAsk('new'); }
  else if (e.target.closest('#addContactBtn') && data.server === Online.SERVER) { e.stopImmediatePropagation(); onlineAsk('dm'); }
}, true);
Online.updateChip();
if (Online.configured) Online.init().catch(e => console.warn('Omni online:', e.message));
