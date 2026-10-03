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
    synth:  { name: '🎮 Punchy synth', wave: 'square',   base: 440, attack: 0.004, tail: 0.06, glide: 1.5,  glideTime: 0.04, level: 0.12, detune: 14 },
    chime:  { name: '🎓 Soft chime',   wave: 'sine',     base: 660, attack: 0.01,  tail: 0.6,  glide: 1,    level: 0.32, overtone: 3 },
    beep:   { name: '🦺 Clean beep',   wave: 'triangle', base: 880, attack: 0.004, tail: 0.03, glide: 1,    level: 0.3 },
    bubble: { name: '💬 Bubbly pop',   wave: 'sine',     base: 520, attack: 0.004, tail: 0.08, glide: 0.55, glideTime: 0.06, level: 0.4 }
  };
  // Which instrument each mode uses when the style is set to "Match the mode"
  const MODE_STYLE = { gaming: 'synth', school: 'chime', work: 'beep', casual: 'bubble' };

  /* ---------- 2. TUNES ----------
     Each note is [semitones above the base pitch, start time (s), length (s)].
     12 semitones = one octave higher. 0, 4, 7 = a happy major chord. */
  const TUNES = {
    send:            [[7, 0, .05]],                                   // quick "tick"
    receive:         [[0, 0, .08], [7, .09, .1]],                     // two notes up
    dm:              [[4, 0, .07], [9, .08, .07], [16, .16, .12]],    // three-note ping
    mention:         [[12, 0, .07], [12, .1, .07], [19, .2, .14]],    // "hey-hey-YOU"
    toast:           [[5, 0, .04]],                                   // tiny soft blip
    join:            [[0, 0, .08], [4, .09, .08], [7, .18, .14]],     // going up = hello
    leave:           [[7, 0, .08], [4, .09, .08], [0, .18, .16]],     // going down = bye
    hand:            [[9, 0, .07], [14, .08, .16]],                   // "ding-ding!"
    reaction:        [[16, 0, .04], [21, .05, .06]],                  // sparkle
    updateAvailable: [[0, 0, .1], [5, .12, .1], [9, .24, .18]],       // "something new"
    updated:         [[0, 0, .08], [4, .08, .08], [7, .16, .08], [12, .24, .22]], // fanfare
    installed:       [[0, 0, .3], [7, 0, .3], [12, 0, .3], [16, .12, .32]]        // happy chord
  };
  // Which settings switch controls each sound
  const CATEGORY = {
    send: 'messages', receive: 'messages', dm: 'messages', mention: 'messages', toast: 'messages',
    join: 'calls', leave: 'calls', hand: 'calls', reaction: 'calls',
    updateAvailable: 'updates', updated: 'updates', installed: 'updates'
  };
  const SOFTER = { toast: 0.45, send: 0.8 };   // some sounds should be quieter

  /* ---------- Settings (saved in localStorage, shared by all modes) ---------- */
  const KEY = 'omni_v3_sound';
  const prefs = { on: true, volume: 60, style: 'auto', messages: true, calls: true, updates: true };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* use defaults */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage full */ } };

  /* ---------- The audio engine ---------- */
  let ctx = null, out = null, mode = 'gaming', lastPlay = 0, pending = null;
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
    const vol = (prefs.volume / 100) * (SOFTER[name] || 1);
    if (vol <= 0) return false;
    const s = STYLES[styleName()], now = ctx.currentTime + 0.01;
    tune.forEach(([semi, t, len]) => tone(s, s.base * 2 ** (semi / 12), now + t, len, vol));
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
