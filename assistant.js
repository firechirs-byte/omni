/* =====================================================================
   Omni — assistant.js   ("Ask Omni", the AI helper panel)
   The browser NEVER holds an AI key. It sends your question to
   AI_ENDPOINT (from config.js): your own server function, e.g. the
   Supabase Edge Function in supabase/functions/ask-omni/index.ts.
   That function keeps the AI key secret and adds kid-safe rules.
   With no AI_ENDPOINT set, the panel just explains how to connect it.
   ===================================================================== */
const ASK = { log: [], busy: false };
const askEndpoint = () => (typeof OMNI_CONFIG !== 'undefined' && OMNI_CONFIG.AI_ENDPOINT) || '';

function openAsk() { $('#askPanel').classList.add('open'); $('#askBtn').classList.add('on'); renderAsk(); setTimeout(() => $('#askInput').focus(), 50); }
function closeAsk() { $('#askPanel').classList.remove('open'); $('#askBtn').classList.remove('on'); }
$('#askBtn').onclick = () => $('#askPanel').classList.contains('open') ? closeAsk() : openAsk();
$('#askClose').onclick = closeAsk;

function renderAsk() {
  const on = !!askEndpoint();
  $('#askStatus').textContent = on ? 'Connected · answers come from an AI, so double-check important things' : 'Not connected yet';
  $('#askInput').disabled = $('#askSend').disabled = !on || ASK.busy;
  if (!on) {
    $('#askLog').innerHTML = named(`<div class="ask-note"><b>Ask Omni needs to be connected.</b><br><br>` +
      `It's a homework and coding helper that will answer questions in a kid-safe way. To switch it on, a grown-up sets up the ` +
      `server function in <code>supabase/functions/ask-omni</code> (it keeps the AI key secret on the server) and puts its address in ` +
      `<code>config.js</code> as <code>AI_ENDPOINT</code>.<br><br>See README → “Going online with Supabase”, step 6.<br><br>` +
      `An AI key must <b>never</b> go into the app's files, because anyone could read it there.</div>`);
    return;
  }
  if (typeof Online !== 'undefined' && Online.configured && !Online.ready) {
    $('#askInput').disabled = $('#askSend').disabled = true;
    $('#askLog').innerHTML = `<div class="ask-note"><b>Sign in online to use Ask Omni.</b><br><br>Open Settings → Online account. (This stops strangers using up the AI.)</div>`;
    return;
  }
  $('#askLog').innerHTML = (ASK.log.length ? '' : `<div class="ask-note">Ask me about homework, coding, or how Omni works. I won't ask for personal info, and you shouldn't share it.</div>`) +
    ASK.log.map(m => `<div class="ask-msg ${m.role === 'user' ? 'user' : 'bot'}">${esc(m.content)}</div>`).join('') +
    (ASK.busy ? '<div class="ask-msg bot">Thinking…</div>' : '');
  $('#askLog').scrollTop = $('#askLog').scrollHeight;
}

$('#askForm').onsubmit = async e => {
  e.preventDefault();
  const q = $('#askInput').value.trim(); if (!q || ASK.busy || !askEndpoint()) return;
  const clean = guard(q); if (clean === null) return;          // the family filter checks questions too
  ASK.log.push({ role: 'user', content: clean }); $('#askInput').value = ''; ASK.busy = true; renderAsk();
  try {
    const headers = { 'Content-Type': 'application/json' };
    // Supabase functions check who's asking: send your sign-in token (never an AI key!)
    const token = typeof Online !== 'undefined' && Online.session?.access_token;
    if (token) headers.Authorization = 'Bearer ' + token;
    if (OMNI_CONFIG.SUPABASE_ANON_KEY) headers.apikey = OMNI_CONFIG.SUPABASE_ANON_KEY;
    const res = await fetch(askEndpoint(), { method: 'POST', headers, body: JSON.stringify({ messages: ASK.log.slice(-10) }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'The helper is unavailable (' + res.status + ')');
    const st = Filter.state;
    const reply = String(body.reply || '').slice(0, 4000);
    ASK.log.push({ role: 'assistant', content: st.setup && st.enabled ? Filter.clean(reply) : reply });
  } catch (err) {
    ASK.log.push({ role: 'assistant', content: 'Sorry, I couldn\'t answer: ' + err.message });
  }
  ASK.busy = false; renderAsk(); Sounds.play('receive');
};
$('#askInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#askForm').requestSubmit(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#askPanel').classList.contains('open') && $('#modalBackdrop').style.display !== 'grid') closeAsk(); });
