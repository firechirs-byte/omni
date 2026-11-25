/* =====================================================================
   Omni — sounds.js
   Every sound in Omni is made right here in code with the Web Audio API.
   There are NO sound files. Each sound is built from simple tones, like
   a tiny synthesizer, so nothing is copied from anybody else.

   How it works:
     1. STYLES  – the "instrument" (wave shape, how it fades, pitch slide…)
     2. TUNES   – which notes each event plays
     3. Sounds.play('send') plays the 'send' tune on the current mode's instrument

   Browsers don't let pages make noise until you click or press a key
   (the "autoplay rule"). So sound only switches on after your first click.
   ===================================================================== */
const Sounds = (() => {

  /* ---------- 1. STYLES (instruments) ----------
     wave:      'sine' (smooth), 'triangle' (soft), 'square' (buzzy, retro game)
     base:      starting pitch in Hz (440 = the note A)
     attack:    seconds to fade in
     tail:      seconds to fade out after the note ends
     glide:     start the pitch this many times higher/lower, then slide to the real note
                (1.5 = drop down like a laser, 0.55 = slide up like a bubble "bloop")
     overtone:  add a quiet extra tone this many times higher (makes a bell shimmer)
     detune:    add a second slightly-out-of-tune copy (makes synths sound fatter) */
  const STYLES = {
    synth:  { name: '🎮 Punchy synth', wave: 'triangle', base: 392, attack: 0.008, tail: 0.05, glide: 1.08, glideTime: 0.03, level: 0.07, detune: 4 },
    chime:  { name: '🎓 Soft chime',   wave: 'sine',     base: 523, attack: 0.012, tail: 0.16, glide: 1,    level: 0.08, overtone: 2 },
    beep:   { name: '🦺 Clean beep',   wave: 'sine',     base: 494, attack: 0.006, tail: 0.04, glide: 1,    level: 0.08 },
    bubble: { name: '💬 Bubbly pop',   wave: 'sine',     base: 440, attack: 0.008, tail: 0.06, glide: 0.85, glideTime: 0.04, level: 0.08 }
  };
  // Which instrument each mode uses when the style is set to "Match the mode"
  const MODE_STYLE = { gaming: 'synth', school: 'chime', work: 'beep', casual: 'bubble' };

  /* ---------- 2. TUNES ----------
     Each note is [semitones above the base pitch, start time (s), length (s)].
     12 semitones = one octave higher. 0, 4, 7 = a happy major chord. */
  const TUNES = {
    send:            [[7, 0, .03]],                          // one short tick
    receive:         [[0, 0, .04], [7, .05, .05]],           // two quiet notes
    dm:              [[4, 0, .04], [9, .06, .06]],           // short ping
    mention:         [[12, 0, .04], [16, .06, .07]],         // still stands out, but brief
    toast:           [[5, 0, .025]],                        // tiny blip
    join:            [[0, 0, .045], [7, .06, .07]],          // hello
    leave:           [[5, 0, .04], [0, .06, .07]],           // bye
    hand:            [[9, 0, .05]],                          // one ding
    reaction:        [[12, 0, .035]],                       // one sparkle
    updateAvailable: [[0, 0, .05], [7, .07, .08]],          // something new
    updated:         [[0, 0, .04], [4, .05, .04], [7, .1, .08]],
    installed:       [[0, 0, .06], [7, .07, .09]]
  };
  // Which settings switch controls each sound
  const CATEGORY = {
    send: 'messages', receive: 'messages', dm: 'messages', mention: 'messages', toast: 'messages',
    join: 'calls', leave: 'calls', hand: 'calls', reaction: 'calls',
    updateAvailable: 'updates', updated: 'updates', installed: 'updates'
  };
  const SOFTER = { toast: 0.35, send: 0.55, receive: 0.7, dm: 0.75, mention: 0.85, reaction: 0.6 };

  /* ---------- Settings (saved in localStorage, shared by all modes) ---------- */
  const KEY = 'omni_v3_sound';
  const prefs = { on: true, volume: 32, style: 'auto', messages: true, calls: true, updates: true };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* use defaults */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage full */ } };

  /* ---------- The audio engine ---------- */
  let ctx = null, out = null, mode = 'gaming', lastPlay = 0, pending = null, busyUntil = 0, lastName = '';
  const history = [];   // names of the last sounds played (handy for testing)

  // Called on your first click / key press: now the browser lets us make sound
  function unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) { ctx = new AC(); out = ctx.createGain(); out.connect(ctx.destination); }
    if (ctx.state === 'suspended') ctx.resume();
    // An update/installed sound that happened before you clicked plays now (if recent)
    if (pending) { const p = pending; pending = null; if (Date.now() - p.at < 20000) play(p.name); }
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, unlock, { capture: true }));

  const styleName = () => prefs.style !== 'auto' && STYLES[prefs.style] ? prefs.style : MODE_STYLE[mode] || 'beep';

  // Play one note: an oscillator (the tone) going through a gain (the volume knob)
  function tone(s, freq, start, length, vol) {
    const end = start + length + s.tail;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(s.level * vol, start + s.attack);      // fade in
    env.gain.exponentialRampToValueAtTime(s.level * vol * 0.6, start + length);  // hold
    env.gain.exponentialRampToValueAtTime(0.0001, end);                          // fade out
    env.connect(out);
    const layers = [[s.wave, 1, 1, 0]];                         // [wave, pitch ×, loudness, detune]
    if (s.overtone) layers.push(['sine', s.overtone, 0.25, 0]); // bell shimmer
    if (s.detune) layers.push([s.wave, 1, 0.6, s.detune]);      // fatter synth
    layers.forEach(([wave, mult, loud, detune]) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = wave; osc.detune.value = detune; g.gain.value = loud;
      osc.frequency.setValueAtTime(freq * mult * s.glide, start);
      if (s.glide !== 1) osc.frequency.exponentialRampToValueAtTime(freq * mult, start + s.glideTime);
      osc.connect(g).connect(env);
      osc.start(start); osc.stop(end + 0.02);
    });
  }

  /* play(name)        – plays if sound is on and that category is switched on
     play(name, true)  – "force": plays anyway (used by the Test buttons) */
  function play(name, force = false) {
    const tune = TUNES[name];
    if (!tune) return false;
    if (!force && (!prefs.on || !prefs[CATEGORY[name]])) return false;
    // don't blip for a toast if another sound has just played
    if (name === 'toast' && !force && Date.now() - lastPlay < 250) return false;
    if (!ctx) {   // not allowed to make sound yet: keep update sounds for later
      if (CATEGORY[name] === 'updates') pending = { name, at: Date.now() };
      return false;
    }
    const nowClock = ctx.currentTime;
    // The same cue twice in a row, or a message blip while another cue is still going, is skipped.
    if (!force && name === lastName && nowClock < busyUntil) return false;
    if (!force && CATEGORY[name] === 'messages' && nowClock < busyUntil) return false;
    const vol = (prefs.volume / 100) * (SOFTER[name] || 1);
    if (vol <= 0) return false;
    const s = STYLES[styleName()], now = nowClock + 0.01;
    tune.forEach(([semi, t, len]) => tone(s, s.base * 2 ** (semi / 12), now + t, len, vol));
    const span = tune.reduce((max, note) => Math.max(max, note[1] + note[2]), 0) + Math.min(s.tail, 0.12);
    busyUntil = now + span;
    lastName = name;
    lastPlay = Date.now();
    history.push(name); if (history.length > 30) history.shift();
    return true;
  }

  // Test button: play every sound in a category, one after another
  function test(category) {
    const names = Object.keys(CATEGORY).filter(n => CATEGORY[n] === category);
    names.forEach((n, i) => setTimeout(() => play(n, true), i * 600));
    return names;
  }

  return {
    play, test, unlock, prefs, history, STYLES, CATEGORY,
    set(key, value) { prefs[key] = value; save(); },
    setMode(m) { mode = m; },
    get state() { return ctx ? ctx.state : 'locked'; },
    get styleName() { return styleName(); }
  };
})();
