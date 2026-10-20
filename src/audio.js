// Procedural WebAudio: wind/glide noise, skate hum, thruster, and punchy SFX.

// Music clock (startMusicClock): tick rate, and how far ahead of the audio clock steps are queued (a frame or clock
// wake-up can be this late before the music gaps)
const MUSIC_TICK_MS = 30;
const MUSIC_AHEAD = 0.4;

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.mix = { hum: 1, wind: 1 }; // ambient loop level trims (the trailer lowers them)
    this.levelFloor = 0; // floor for the roaming groove's level (the trailer raises it)
    this.skateTone = 'hum'; // skate voice (cosmetics: one per pair of skates)
    this.skateVoice = null; // the one built and running (setSkateTone)
    this.skatePitch = { f0: 55, s: 0 }; // last pitch set (a new voice starts there)
    this.onSfx = null; // pickup / payout hook for controller rumble (main.js)
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      this.enabled = false;
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5 * (this.vol ? this.vol.sfx : 1); // settings: master = effects bus
    this.out = ctx.createGain(); this.out.gain.value = this.vol ? (this.vol.mute ? 0 : this.vol.master) : 1; // settings (the only node to the speakers: mute silences all)
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.5 * (this.vol ? this.vol.music : 1); // settings
    this.master.connect(this.out); this.musicBus.connect(this.out); this.out.connect(ctx.destination); // settings

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // a looping noise source through filter f and gain g into the effects bus
    const loop = (f, g) => { const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.connect(f).connect(g).connect(this.master); s.start(); };
    // glide noise (suit-transmitted rumble), lowpassed: a soft rumble, never static
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'lowpass'; this.windF.Q.value = 0.3;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    loop(this.windF, this.windG);

    // skate hum: a shared level (humG, rises with speed) over the worn skates' voice (setSkateTone). Kept low and soft.
    this.humG = ctx.createGain(); this.humG.gain.value = 0;
    this.humG.connect(this.master);
    this.setSkateTone(this.skateTone);

    // thruster
    this.jetF = ctx.createBiquadFilter(); this.jetF.type = 'lowpass'; this.jetF.frequency.value = 520;
    this.jetG = ctx.createGain(); this.jetG.gain.value = 0;
    loop(this.jetF, this.jetG);

    this.initMusic();
  }

  // Racecourse crowd (race.js): setCrowd(level) does nothing since the noise bed went (it read as static); roar() adds whoops.
  setCrowd() {}
  roar(amount = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = Math.round(3 + amount * 6);
    for (let i = 0; i < n; i++) {
      // a "whoo!": a voice-ish saw sliding up through a formant
      const t0 = t + Math.random() * 0.6, f0 = 260 + Math.random() * 260;
      const o = this.ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f0 * (1.4 + Math.random() * 0.5), t0 + 0.35);
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 + Math.random() * 700; bp.Q.value = 2.5;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.035 * Math.min(1.2, amount), t0 + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      o.connect(bp).connect(g).connect(this.master);
      o.start(t0); o.stop(t0 + 0.55);
    }
  }

  // ---------- synthwave: A-minor groove, layers follow speed ----------
  initMusic() {
    const ctx = this.ctx;
    this.musicOn = this.musicOn ?? true;
    this.music = ctx.createGain(); this.music.gain.value = 0;
    this.musicTone = ctx.createBiquadFilter(); this.musicTone.type = 'lowpass'; this.musicTone.frequency.value = 900; this.musicTone.Q.value = 0.4;
    this.music.connect(this.musicTone).connect(this.musicBus); // settings
    // dreamy echo for pads, arp and snare
    this.echoIn = ctx.createGain(); this.echoIn.gain.value = 1;
    const delay = this.delay = ctx.createDelay(1); // (its time follows the track's tempo, below)
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 1600;
    this.echoIn.connect(delay).connect(damp).connect(fb).connect(delay);
    damp.connect(this.music);
    this.step = 0;
    this.nextNote = ctx.currentTime + 0.1;
    this.level = 0;
    // Am – F – C – G, one bar each (MIDI notes)
    this.chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    // a gritty drive for the dark-side track's bass and riff
    this.drive = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 3.2) * 0.8; }
    this.drive.curve = curve;
    this.drive.oversample = '2x';
    this.drive.connect(this.music);
    // zone tracks: setZone crossfades to the place's track. 'free' = speed-driven groove, 'menu' = title screen.
    this.track = this.want = this.menu ? 'menu' : 'free';
    this.fade = 1;
    this.bpm = this.trackInfo(this.track).bpm;
    delay.delayTime.value = (60 / this.bpm) * 0.75;
    this.stepFns = { free: this.playStep, menu: this.menuStep, casino: this.casinoStep, downs: this.downsStep, lab: this.labStep, dark: this.darkStep };
    this.startMusicClock();
  }

  // Queues steps on its own timer, not the game's frame, so long frames or no frames (hidden tab, trailer &pump) don't
  // gap the groove. A worker keeps time (page timers throttle in the background); setInterval if workers fail.
  startMusicClock() {
    if (this.clock) return;
    const tick = () => this.scheduleMusic();
    const interval = () => { this.clock = setInterval(tick, MUSIC_TICK_MS); };
    try {
      const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${MUSIC_TICK_MS});`], { type: 'text/javascript' }));
      const w = new Worker(url);
      URL.revokeObjectURL(url);
      w.onmessage = tick;
      w.onerror = () => { w.terminate(); interval(); };
      this.clock = w;
    } catch { interval(); }
  }

  // Which track should be playing: 'free' | 'casino' | 'downs' | 'lab' | 'dark' (the menu: setMenu).
  setZone(z) { if (!this.menu) this.want = z; }

  mtof(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  // One synth note. q: resonance; filter: type; vib: vibrato cents at vibRate Hz; from: glide-in Hz;
  // sweep: cutoff multiplier over the note; dest: output node.
  voice(type, freq, t, dur, vol, { attack = 0.01, cutoff = 2000, echo = 0, detune = 0, q = 0.7, filter = 'lowpass', vib = 0, vibRate = 5.5, from = 0, sweep = 0, dest = null } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.detune.value = detune;
    if (from) { o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(freq, t + Math.min(0.25, dur * 0.4)); } else o.frequency.value = freq;
    const f = ctx.createBiquadFilter(); f.type = filter; f.frequency.value = cutoff; f.Q.value = q;
    if (sweep) { f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, cutoff * sweep), t + dur); }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(dest || this.music);
    if (echo) { const e = ctx.createGain(); e.gain.value = echo; g.connect(e).connect(this.echoIn); }
    if (vib) {
      const l = ctx.createOscillator(); l.frequency.value = vibRate;
      const lg = ctx.createGain(); lg.gain.value = vib;
      l.connect(lg).connect(o.detune); l.start(t); l.stop(t + dur + 0.05);
    }
    o.start(t); o.stop(t + dur + 0.05);
  }

  // rhodes-ish e-piano: sine body plus a fast-dying bell an octave up
  epiano(t, n, dur, vol) {
    this.voice('sine', this.mtof(n), t, dur, vol, { attack: 0.005, cutoff: 3000, echo: 0.2 });
    this.voice('triangle', this.mtof(n + 12), t, dur * 0.35, vol * 0.35, { attack: 0.003, cutoff: 5000 });
  }

  // twangy western guitar: saw through a resonant bandpass, slapback echo
  pluck(t, n, vol, echo = 0.5) {
    this.voice('sawtooth', this.mtof(n), t, 0.32, vol, { attack: 0.002, cutoff: this.mtof(n) * 3, q: 3, filter: 'bandpass', sweep: 0.5, echo });
  }

  // a resonant noise "bloop" (bubbling lab glassware)
  bloop(t, f0, vol) {
    const f = this.noiseHit(t, 0, 18, vol, 0.22, 0.25, 0.4);
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f0 * 2.6, t + 0.18);
  }

  // a band-passed noise hit into the music, some of it into the echo (snare, hat, bloop). freq 0: the caller sweeps the
  // filter it returns
  noiseHit(t, freq, q, vol, decay, stop, echo = 0) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; if (freq) f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    s.connect(f).connect(g).connect(this.music);
    if (echo) { const e = ctx.createGain(); e.gain.value = echo; g.connect(e).connect(this.echoIn); }
    s.start(t, Math.random()); s.stop(t + stop);
    return f;
  }

  kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(this.music); o.start(t); o.stop(t + 0.4);
  }

  snare(t, vol) {
    this.noiseHit(t, 1500, 0.9, vol, 0.22, 0.3, 0.5);
    this.voice('triangle', 190, t, 0.12, vol * 0.6);
  }

  hat(t, vol) { this.noiseHit(t, 7000, 1.2, vol, 0.05, 0.08); }

  // A 16th step's place: six its length (s), bar in the 4-bar loop, s the 16th in the bar, phrase the 4-bar phrase.
  grid(step) { return { six: 60 / this.bpm / 4, bar: Math.floor(step / 16) % 4, s: step % 16, phrase: Math.floor(step / 64) }; }

  // Schedule one 16th note. Layers come in as `lvl` (0..1, from speed) rises.
  playStep(t, step, lvl) {
    const { six, bar, s } = this.grid(step);
    const chord = this.chords[bar];
    // pad: always there, a warm bed
    if (s === 0) for (const n of chord) for (const d of [-7, 7]) this.voice('sawtooth', this.mtof(n), t, six * 16 + 0.6, 0.022, { attack: 0.7, cutoff: 900 + lvl * 900, echo: 0.35, detune: d });
    // bass: pulsing 8ths on the root
    if (s % 2 === 0) {
      const root = chord[0] - 24 + (s === 6 || s === 14 ? 12 : 0);
      this.voice('sawtooth', this.mtof(root), t, six * 1.8, 0.11 + lvl * 0.05, { cutoff: 260 + lvl * 380 });
    }
    if (lvl > 0.3 && s % 4 === 0) this.kick(t);
    if (lvl > 0.45 && (s === 4 || s === 12)) this.snare(t, 0.16);
    if (lvl > 0.6 && s % 4 === 2) this.hat(t, 0.025);
    // arpeggio over the chord, up an octave
    if (lvl > 0.72) {
      const n = chord[[0, 1, 2, 1][s % 4]] + 12 + (s >= 8 ? 12 : 0);
      this.voice('square', this.mtof(n), t, six * 0.9, 0.028, { cutoff: 2200, echo: 0.45 });
    }
  }

  // Title track: faster, brighter. Em, C, G, D; four-on-the-floor, offbeat hats, octave bass, hooky lead.
  menuStep(t, step) {
    const { six, bar, s, phrase } = this.grid(step);
    const chords = [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]];
    const chord = chords[bar];
    if (s === 0) for (const n of chord) for (const d of [-9, 9]) this.voice('sawtooth', this.mtof(n), t, six * 16 + 0.4, 0.02, { attack: 0.25, cutoff: 1900, echo: 0.3, detune: d });
    // octave-bouncing bass on every 8th
    if (s % 2 === 0) this.voice('sawtooth', this.mtof(chord[0] - 24 + ((s / 2) % 2 ? 12 : 0)), t, six * 1.6, 0.13, { cutoff: 700 });
    if (s % 4 === 0) this.kick(t);
    if (s === 4 || s === 12) this.snare(t, 0.2);
    if (s % 4 === 2) this.hat(t, 0.05);
    else if (s % 2 === 1) this.hat(t, 0.018);
    // lead: two-bar hook, an octave up on the second pass
    const hook = [0, -1, 2, -1, 1, -1, 2, 0, -1, 2, -1, 1, 0, -1, 2, -1];
    const k = hook[s];
    if (k >= 0 && (bar % 2 === 0 || s < 12)) {
      const n = chord[k] + 12 + (phrase % 2 ? 12 : 0);
      this.voice('square', this.mtof(n), t, six * 1.4, 0.034, { cutoff: 3200, echo: 0.5 });
    }
    // sparkle arp on the last bar of each phrase
    if (bar === 3 && s % 2 === 1) this.voice('triangle', this.mtof(chord[(s >> 1) % 3] + 24), t, six * 0.8, 0.025, { cutoff: 5000, echo: 0.4 });
  }

  // ---------- zone tracks ----------

  // CASINO: lounge synthwave. ii-V-I-vi in F with 9ths and 13ths, walking bass, swung brushes, e-piano comping,
  // a muted vibrato lead every other phrase.
  casinoStep(t, step) {
    const { six, bar, s, phrase } = this.grid(step);
    const chords = [[55, 58, 62, 65, 69], [48, 52, 58, 62, 69], [53, 57, 60, 64, 67], [50, 53, 57, 60, 64]];
    const ch = chords[bar];
    const swing = (s % 4 === 2) ? six * 0.33 : 0; // swung 8ths
    if (s === 0) for (const n of ch.slice(1)) this.voice('sawtooth', this.mtof(n), t, six * 16 + 0.5, 0.009, { attack: 0.6, cutoff: 1100, echo: 0.3, detune: n % 2 ? 6 : -6 });
    // walking bass: root, third, fifth, chromatic step into the next root
    const next = chords[(bar + 1) % 4][0];
    const walk = [ch[0], ch[0] + (ch[1] - ch[0] > 3 ? 4 : 3), ch[0] + 7, next + 1];
    if (s % 4 === 0) this.voice('triangle', this.mtof(walk[s / 4] - 24), t, six * 3.4, 0.2, { attack: 0.01, cutoff: 900 });
    // swung brushes; soft kick on 1 and 3
    if (s % 2 === 0) this.hat(t + swing, s % 4 === 0 ? 0.022 : 0.034);
    if (s === 4 || s === 12) this.snare(t, 0.06);
    if (s === 0 || s === 8) this.kick(t);
    // e-piano comping: the "and" of 2 and beat 4
    if (s === 6 || s === 12) for (const n of ch.slice(1, 4)) this.epiano(t + (s === 6 ? swing : 0), n + 12, six * 3, 0.035);
    // muted lead, every other phrase
    if (phrase % 2 === 1) {
      const lick = [[9, -1, 7, -1, 4, -1, 2, 4, -1, -1, 7, -1, 5, 4, 2, -1], [0, -1, 2, 4, 5, -1, 4, 2, -1, 0, -1, -2, 0, -1, -1, -1]][bar % 2];
      const k = lick[s];
      if (k !== -1) this.voice('square', this.mtof(65 + (k === -2 ? -1 : k)), t + swing, six * 1.8, 0.03, { attack: 0.03, cutoff: 1500, q: 2, echo: 0.35, vib: 18, vibRate: 5 });
    }
  }

  // DOWNS: space-western. A minor with a harmonic-minor E7, galloping kick and shaker, rolling twangy guitar,
  // a sliding whistle lead, a sci-fi zap on the turnaround.
  downsStep(t, step) {
    const { six, bar, s, phrase } = this.grid(step);
    const chords = [[45, 52, 57, 60, 64], [50, 57, 62, 65, 69], [52, 56, 59, 62, 64], [45, 52, 57, 60, 64]];
    const ch = chords[bar];
    // gallop: kick on the beat, ta-ta on the shaker
    if (s % 4 === 0) this.kick(t);
    if (s % 4 === 2 || s % 4 === 3) this.hat(t, 0.03);
    if (s === 12) this.snare(t, 0.08);
    // boom-chicka bass: root and fifth
    if (s % 8 === 0) this.voice('sawtooth', this.mtof(ch[0] - 12), t, six * 3, 0.14, { cutoff: 420 });
    if (s % 8 === 4) this.voice('sawtooth', this.mtof(ch[1] - 12), t, six * 3, 0.1, { cutoff: 420 });
    // guitar
    const roll = [0, 2, 1, 3, 2, 4, 3, 2];
    if (s % 2 === 0) this.pluck(t, ch[roll[(s / 2) % 8]] + 12, 0.07);
    // thin pad
    if (s === 0) this.voice('triangle', this.mtof(ch[2] + 12), t, six * 16, 0.012, { attack: 1.2, cutoff: 1400, echo: 0.4 });
    // whistle: long sliding notes, every other phrase
    if (phrase % 2 === 0) {
      const tune = [[76, 0, 0, 0, 0, 0, 74, 0, 72, 0, 0, 0, 71, 0, 0, 0], [74, 0, 0, 0, 0, 0, 0, 0, 77, 0, 76, 0, 74, 0, 0, 0], [71, 0, 0, 0, 0, 0, 74, 0, 76, 0, 0, 0, 0, 0, 0, 0], [69, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]][bar];
      const n = tune[s];
      if (n) {
        const rest = tune.slice(s + 1).findIndex((x) => x);
        const len = rest < 0 ? 16 - s : rest + 1;
        this.voice('sine', this.mtof(n), t, six * Math.max(2, len) * 0.95, 0.06, { attack: 0.06, cutoff: 4000, echo: 0.5, vib: 22, vibRate: 6, from: this.mtof(n - 2) });
      }
    }
    // zap on the turnaround
    if (bar === 3 && s === 14) this.voice('sawtooth', 1800, t, 0.4, 0.04, { from: 300, cutoff: 3000, echo: 0.5 });
  }

  // LAB: sterile and slightly wrong. Unresolved whole-tone and #11 harmony, glassy pings in odd groupings, bloops,
  // clicks, a slow sub pulse, a theremin on alternate phrases.
  labStep(t, step) {
    const { six, bar, s, phrase } = this.grid(step);
    const chords = [[48, 52, 55, 59, 66], [46, 50, 54, 58], [44, 48, 52, 56], [47, 51, 54, 58, 61]];
    const ch = chords[bar];
    if (s === 0) for (const n of ch) this.voice('sine', this.mtof(n), t, six * 16 + 0.8, 0.018, { attack: 1.4, cutoff: 1800, echo: 0.3, detune: ((n % 3) - 1) * 9 });
    if (s === 0 || s === 7) this.voice('sine', this.mtof(ch[0] - 24), t, six * 3, 0.2, { cutoff: 300 });
    // pings in 7s and 11s against the 4-beat bar
    if (step % 7 === 0 || step % 11 === 5) this.voice('sine', this.mtof(ch[(step >> 1) % ch.length] + 24), t, 0.5, 0.035, { attack: 0.002, cutoff: 8000, echo: 0.6 });
    if (s % 4 === 3) this.hat(t, 0.02);
    if (s === 10) this.voice('square', 2400, t, 0.02, 0.02, { cutoff: 6000 });
    if ((step * 5) % 13 < 2) this.bloop(t, 300 + ((step * 37) % 9) * 60, 0.05);
    if (phrase % 2 === 1 && (s === 0 || s === 8)) {
      const n = [66, 70, 64, 68, 72, 67, 71, 63][(bar * 2 + (s ? 1 : 0)) % 8];
      this.voice('sine', this.mtof(n), t, six * 7.5, 0.05, { attack: 0.3, cutoff: 3000, echo: 0.4, vib: 35, vibRate: 6.5, from: this.mtof(n - 3) });
    }
  }

  // DARK SIDE: darksynth. D phrygian, driven 16th bass, four-on-the-floor, big echoing snare, gated pad stabs,
  // a growling saw riff on alternate phrases.
  darkStep(t, step) {
    const { six, bar, s, phrase } = this.grid(step);
    const chords = [[50, 53, 57], [51, 55, 58], [46, 50, 53], [48, 51, 55]];
    const ch = chords[bar];
    const bn = ch[0] - 24 + (s >= 14 ? 12 : 0);
    this.voice('sawtooth', this.mtof(bn), t, six * 0.9, s % 4 === 2 ? 0.16 : 0.1, { cutoff: 380 + (s % 4 === 2 ? 500 : 0), q: 4, dest: this.drive });
    if (s % 4 === 0) this.kick(t);
    if (s === 4 || s === 12) this.snare(t, 0.24);
    if (s % 2 === 1) this.hat(t, 0.03);
    if (s % 2 === 0) for (const n of ch) this.voice('sawtooth', this.mtof(n), t, six * 1.6, 0.012, { attack: 0.01, cutoff: 1400, detune: (s % 4) * 4 - 6 });
    if (phrase % 2 === 1) {
      const riff = [0, -1, 1, 0, -1, 2, -1, 1, 0, -1, -1, 2, 1, -1, 0, -1];
      const k = riff[s];
      if (k >= 0) this.voice('sawtooth', this.mtof(ch[k] + 12), t, six * 1.6, 0.05, { cutoff: 1800, q: 6, sweep: 0.4, echo: 0.3, dest: this.drive });
    }
    if (bar === 3 && s === 0 && phrase % 2 === 0) this.voice('sawtooth', this.mtof(74), t, six * 16, 0.02, { attack: 1.5, from: this.mtof(62), cutoff: 2400, echo: 0.4 });
  }

  // tempo, loudness, brightness per track ('free' follows speed instead)
  trackInfo(id) {
    return {
      free: { bpm: 96 },
      menu: { bpm: 120, vol: 0.5, tone: 5200 },
      casino: { bpm: 100, vol: 0.42, tone: 3800 },
      downs: { bpm: 104, vol: 0.45, tone: 4200 },
      lab: { bpm: 84, vol: 0.4, tone: 4600 },
      dark: { bpm: 132, vol: 0.4, tone: 3600 },
    }[id];
  }

  setMenu(on) {
    if (this.menu === on) return;
    this.menu = on;
    this.want = on ? 'menu' : 'free';
    if (on) { this.switchTrack('menu'); this.fade = 1; }
  }

  switchTrack(id) {
    this.track = id;
    this.bpm = this.trackInfo(id).bpm;
    this.step = 0;
    if (this.delay) this.delay.delayTime.setTargetAtTime((60 / this.bpm) * 0.75, this.ctx.currentTime, 0.1);
  }

  // Per frame: loudness and tone (per track, or from speed on 'free') and the crossfade. Notes are queued by
  // scheduleMusic on the music clock.
  updateMusic(speed) {
    const t = this.ctx.currentTime;
    // crossfade: fade out, switch, fade in
    if (this.want !== this.track) {
      this.fade = Math.max(0, this.fade - 0.02);
      if (this.fade <= 0) this.switchTrack(this.want);
    } else this.fade = Math.min(1, this.fade + 0.015);
    if (this.track !== 'free') {
      const info = this.trackInfo(this.track);
      this.music.gain.setTargetAtTime(this.musicPlays ? info.vol * this.fade : 0, t, 0.3);
      this.musicTone.frequency.setTargetAtTime(info.tone, t, 0.4);
    } else {
      const target = Math.max(this.levelFloor || 0, Math.min(1, speed / 110));
      this.level += (target - this.level) * (target > this.level ? 0.02 : 0.008);
      const vol = this.musicPlays ? (0.05 + this.level * 0.55) * this.fade : 0;
      this.music.gain.setTargetAtTime(vol, t, 0.4);
      this.musicTone.frequency.setTargetAtTime(700 + this.level * 3300, t, 0.4);
    }
    // usually a no-op; backstop for starved timers with frames still coming (trailer &pump via window.step)
    this.scheduleMusic();
  }

  // Queue every 16th step within MUSIC_AHEAD of the audio clock, for the current track.
  scheduleMusic() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const fn = this.stepFns[this.track];
    if (this.nextNote < t - 0.5) this.nextNote = t + 0.05; // after a stall or hidden tab: don't burst-fire
    while (this.nextNote < t + MUSIC_AHEAD) {
      if (this.musicPlays && this.fade > 0.02) fn.call(this, this.nextNote, this.step, this.level);
      this.nextNote += 60 / this.bpm / 4;
      this.step++;
    }
  }

  // settings: master / music / effects (0..1) and mute; safe before init()
  setVolumes(master, music, sfx, mute = false) {
    this.vol = { master, music, sfx, mute };
    if (!this.ctx || !this.out) return;
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(mute ? 0 : master, t, 0.03);
    this.musicBus.gain.setTargetAtTime(0.5 * music, t, 0.03);
    this.master.gain.setTargetAtTime(0.5 * sfx, t, 0.03);
  }

  // Skate voices (each a small graph into its own gain, into humG). Only the worn pair's voice is built (setSkateTone):
  //   hum      sawtooth drone through a low-pass (Q-Lock Standard and the plain ones)
  //   glide    two soft triangles a hair apart, slowly beating, a breath of hiss
  //   rumble   filtered square an octave down, with a wheel-throb
  //   jackpot  gold rollers: warm hum with a shimmer of fifths and octaves
  // A voice is { g, level, pitch(f0, t, s, k), stop(when) }: k scales glide times (0 = jump, for a fresh voice);
  // stop ends its oscillators and unhooks it.
  makeSkateVoice(kind) {
    const ctx = this.ctx;
    const srcs = []; // all sources in the voice: they stop together
    const voice = (level) => { const g = ctx.createGain(); g.gain.value = 0; g.connect(this.humG); return { g, level }; };
    const osc = (type, out, f = 60) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(out); o.start(); srcs.push(o); return o; };
    const lp = (f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = f; b.Q.value = q; return b; };
    const wobble = (param, f, depth) => { const d = ctx.createGain(); d.gain.value = depth; d.connect(param); return osc('sine', d, f); }; // LFO on param
    const done = (v) => {
      v.id = kind;
      v.stop = (when) => { for (const o of srcs) o.stop(when); srcs[0].onended = () => v.g.disconnect(); };
      return v;
    };
    if (kind === 'glide') {
      const v = voice(0.55); // levels matched to the hum's loudness; brighter voices a touch under
      const f = lp(700, 0.4); f.connect(v.g);
      const a = osc('triangle', f), b = osc('triangle', f);
      const air = ctx.createBufferSource(); air.buffer = this.noise; air.loop = true;
      const af = ctx.createBiquadFilter(); af.type = 'bandpass'; af.frequency.value = 1400; af.Q.value = 0.8;
      const ag = ctx.createGain(); ag.gain.value = 0.05;
      air.connect(af).connect(ag).connect(v.g); air.start(); srcs.push(air);
      v.pitch = (f0, t, s, k = 1) => {
        a.frequency.setTargetAtTime(f0 * 1.5, t, 0.12 * k);
        b.frequency.setTargetAtTime(f0 * 1.5 * 1.006, t, 0.12 * k); // slow beat between the two
        af.frequency.setTargetAtTime(1100 + s * 900, t, 0.2 * k);
      };
      return done(v);
    }
    if (kind === 'rumble') {
      const v = voice(0.62);
      const f = lp(260, 1.1);
      const throb = ctx.createGain(); throb.gain.value = 1;
      f.connect(throb).connect(v.g);
      const o = osc('square', f);
      // wheel-throb: shallow tremolo, quicker with speed
      const lfo = wobble(throb.gain, 5, 0.22);
      v.pitch = (f0, t, s, k = 1) => {
        o.frequency.setTargetAtTime(f0 * 0.5, t, 0.1 * k);
        lfo.frequency.setTargetAtTime(4 + s * 9, t, 0.2 * k);
        f.frequency.setTargetAtTime(220 + s * 160, t, 0.15 * k);
      };
      return done(v);
    }
    if (kind === 'jackpot') {
      const v = voice(0.5);
      const f = lp(1600, 0.5); f.connect(v.g);
      const base = osc('triangle', f);
      const shimmer = ctx.createGain(); shimmer.gain.value = 0.35; shimmer.connect(f);
      const fifth = osc('sine', shimmer), oct = osc('sine', shimmer), oct2 = osc('sine', shimmer);
      // shimmer breathes slowly so it glints rather than whines
      wobble(shimmer.gain, 0.35, 0.25);
      // metal: ring modulation at a bell's odd ratio gives an inharmonic coin ring, swelling in a slow spin
      const ring = ctx.createGain(); ring.gain.value = 0; // gain driven by the modulator
      const ringOut = ctx.createGain(); ringOut.gain.value = 0.28;
      const ringBp = ctx.createBiquadFilter(); ringBp.type = 'bandpass'; ringBp.Q.value = 2.2;
      ring.connect(ringBp).connect(ringOut).connect(v.g);
      const carrier = osc('sine', ring);
      const mod = osc('sine', ring.gain);
      const spin = wobble(ringOut.gain, 1.6, 0.18);
      v.pitch = (f0, t, s, k = 1) => {
        base.frequency.setTargetAtTime(f0 * 2, t, 0.1 * k);
        fifth.frequency.setTargetAtTime(f0 * 3, t, 0.1 * k);
        oct.frequency.setTargetAtTime(f0 * 4.003, t, 0.1 * k);
        oct2.frequency.setTargetAtTime(f0 * 8.01, t, 0.1 * k);
        carrier.frequency.setTargetAtTime(f0 * 5.4, t, 0.1 * k);
        mod.frequency.setTargetAtTime(f0 * 5.4 * 1.414, t, 0.1 * k);
        ringBp.frequency.setTargetAtTime(f0 * 7, t, 0.1 * k);
        spin.frequency.setTargetAtTime(1.2 + s * 3.5, t, 0.3 * k); // spins faster with speed
      };
      return done(v);
    }
    // hum
    const v = voice(1);
    const f = lp(400); f.connect(v.g);
    const o = osc('sawtooth', f);
    v.pitch = (f0, t, s, k = 1) => o.frequency.setTargetAtTime(f0, t, 0.1 * k);
    return done(v);
  }

  // Skate voice ('hum' | 'glide' | 'rumble' | 'jackpot'), short crossfade. The new one starts at the old pitch; the old
  // one is stopped and unhooked once faded.
  setSkateTone(id) {
    this.skateTone = id in { hum: 1, glide: 1, rumble: 1, jackpot: 1 } ? id : 'hum';
    if (!this.ctx || !this.humG) return;
    const old = this.skateVoice;
    if (old && old.id === this.skateTone) return;
    const t = this.ctx.currentTime;
    if (old) {
      old.g.gain.setTargetAtTime(0, t, 0.08);
      old.stop(t + 0.8); // ten time constants: inaudible
    }
    const v = this.skateVoice = this.makeSkateVoice(this.skateTone);
    v.pitch(this.skatePitch.f0, t, this.skatePitch.s, 0);
    v.g.gain.setTargetAtTime(v.level, t, 0.08);
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    return this.musicOn;
  }

  // settings → Audio → Mute all audio
  get muted() { return !!(this.vol && this.vol.mute); }

  // don't synthesise music into a muted or switched-off bus
  get musicPlays() { return this.musicOn && !this.muted; }

  // Per frame. `quiet`: world frozen (pause, map, dialog): the loops (wind, hum, thrusters) fade out; music and menu
  // blips carry on.
  update(speed, skating, grounded, thrusting, quiet = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = Math.min(1, speed / 90);
    const k = quiet ? 0 : 1;
    // rumble swells with speed but stays low (no hiss at top speed)
    this.windG.gain.setTargetAtTime(Math.min(0.5, s) * 0.16 * (grounded ? 1 : 0.6) * this.mix.wind * k, t, 0.15);
    this.windF.frequency.setTargetAtTime(140 + Math.min(1, s) * 380, t, 0.15);
    this.humG.gain.setTargetAtTime(skating && grounded ? (0.05 + s * 0.06) * this.mix.hum * k : 0, t, 0.05);
    const f0 = 55 + s * 120;
    this.skatePitch.f0 = f0; this.skatePitch.s = s;
    if (this.skateVoice) this.skateVoice.pitch(f0, t, s);
    this.jetG.gain.setTargetAtTime(thrusting && !quiet ? 0.16 : 0, t, 0.05);
    this.updateMusic(speed);
  }

  tone(freq, dur, type = 'square', vol = 0.2, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  burst(dur, freq, vol = 0.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(60, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  shoot() { this.tone(880, 0.18, 'square', 0.12, 0.3); }
  enemyShot() { this.tone(420, 0.15, 'sawtooth', 0.06, 0.5); }
  boom(big) { this.burst(big ? 1.2 : 0.6, big ? 1800 : 1200, big ? 0.8 : 0.5); }
  thud(v) { this.burst(0.25, 300 + v * 10, Math.min(0.6, v / 40)); }
  pickup() { if (this.onSfx) this.onSfx('pickup'); this.tone(660, 0.1, 'triangle', 0.2); setTimeout(() => this.tone(990, 0.15, 'triangle', 0.2), 90); }
  cash() { if (this.onSfx) this.onSfx('cash'); [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'triangle', 0.18), i * 80)); }
  alarm() { this.tone(740, 0.2, 'square', 0.1); setTimeout(() => this.tone(520, 0.2, 'square', 0.1), 200); }
  hurt() { this.tone(160, 0.25, 'sawtooth', 0.2, 0.5); }
  jump() { this.tone(300, 0.15, 'sine', 0.15, 2.2); }
  click() { this.tone(1200, 0.04, 'square', 0.06); }
}
