// Procedural WebAudio: wind/glide noise, skate hum, thruster, and punchy SFX.
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
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
    this.out = ctx.createGain(); this.out.gain.value = this.vol ? this.vol.master : 1; // settings
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.5 * (this.vol ? this.vol.music : 1); // settings
    this.master.connect(this.out); this.musicBus.connect(this.out); this.out.connect(ctx.destination); // settings

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // glide noise (suit-transmitted rumble)
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    // a soft low rumble rather than hiss: lowpassed, and it never opens up into static
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'lowpass'; this.windF.Q.value = 0.3;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    src.connect(this.windF).connect(this.windG).connect(this.master);
    src.start();

    // skate hum
    this.hum = ctx.createOscillator(); this.hum.type = 'sawtooth'; this.hum.frequency.value = 60;
    this.humF = ctx.createBiquadFilter(); this.humF.type = 'lowpass'; this.humF.frequency.value = 400;
    this.humG = ctx.createGain(); this.humG.gain.value = 0;
    this.hum.connect(this.humF).connect(this.humG).connect(this.master);
    this.hum.start();

    // thruster
    const src2 = ctx.createBufferSource();
    src2.buffer = this.noise; src2.loop = true;
    this.jetF = ctx.createBiquadFilter(); this.jetF.type = 'lowpass'; this.jetF.frequency.value = 520;
    this.jetG = ctx.createGain(); this.jetG.gain.value = 0;
    src2.connect(this.jetF).connect(this.jetG).connect(this.master);
    src2.start();

    // the racecourse crowd: noise through two "voice" bands, swelling with excitement
    const src3 = ctx.createBufferSource();
    src3.buffer = this.noise; src3.loop = true;
    this.crowdG = ctx.createGain(); this.crowdG.gain.value = 0;
    for (const [f, q, v] of [[650, 0.9, 1], [1700, 1.4, 0.55], [3200, 2, 0.2]]) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const g = ctx.createGain(); g.gain.value = v;
      src3.connect(bp).connect(g).connect(this.crowdG);
    }
    this.crowdG.connect(this.master);
    src3.start(0, 0.7);
    this.crowdLevel = 0;
    this.crowdBoost = 0;

    this.initMusic();
  }

  // Racecourse crowd: 0 = silent, ~0.1 a murmur, 1 = on its feet. roar() adds a swell and some whoops.
  setCrowd(level) { this.crowdLevel = level; }
  roar(amount = 1) {
    if (!this.ctx) return;
    this.crowdBoost = Math.min(1.5, this.crowdBoost + amount);
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

  // ---------- synthwave: a slow A-minor groove whose layers and volume follow your speed ----------
  initMusic() {
    const ctx = this.ctx;
    this.musicOn = this.musicOn ?? true;
    this.music = ctx.createGain(); this.music.gain.value = 0;
    this.musicTone = ctx.createBiquadFilter(); this.musicTone.type = 'lowpass'; this.musicTone.frequency.value = 900; this.musicTone.Q.value = 0.4;
    this.music.connect(this.musicTone).connect(this.musicBus); // settings
    // dreamy echo for pads, arp and snare
    this.echoIn = ctx.createGain(); this.echoIn.gain.value = 1;
    const delay = ctx.createDelay(1); delay.delayTime.value = (60 / 96) * 0.75;
    this.delay = delay;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 1600;
    this.echoIn.connect(delay).connect(damp).connect(fb).connect(delay);
    damp.connect(this.music);
    this.bpm = 96;
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
    // zone tracks: the game says where you are (setZone) and the music crossfades to that place's
    // track. 'free' is the speed-driven roaming groove, 'menu' the title screen.
    this.track = this.want = this.menu ? 'menu' : 'free';
    this.fade = 1;
    this.bpm = this.trackInfo(this.track).bpm;
    delay.delayTime.value = (60 / this.bpm) * 0.75;
  }

  // Which track should be playing: 'free' | 'casino' | 'downs' | 'lab' | 'dark' (the menu: setMenu).
  setZone(z) { if (!this.menu) this.want = z; }

  mtof(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  // One synth note. Extras: q (filter resonance), filter (type), vib (vibrato depth in cents) at
  // vibRate Hz, from (glide in from this frequency), sweep (cutoff multiplier over the note), dest.
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

  // a rhodes-ish electric piano: a soft sine body with a bell an octave up that dies fast
  epiano(t, n, dur, vol) {
    this.voice('sine', this.mtof(n), t, dur, vol, { attack: 0.005, cutoff: 3000, echo: 0.2 });
    this.voice('triangle', this.mtof(n + 12), t, dur * 0.35, vol * 0.35, { attack: 0.003, cutoff: 5000 });
  }

  // a twangy plucked string (the western guitar): sawtooth through a resonant bandpass, slapback echo
  pluck(t, n, vol, echo = 0.5) {
    this.voice('sawtooth', this.mtof(n), t, 0.32, vol, { attack: 0.002, cutoff: this.mtof(n) * 3, q: 3, filter: 'bandpass', sweep: 0.5, echo });
  }

  // a resonant noise "bloop" (bubbling lab glassware)
  bloop(t, f0, vol) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 18;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f0 * 2.6, t + 0.18);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    s.connect(f).connect(g).connect(this.music);
    const e = ctx.createGain(); e.gain.value = 0.4; g.connect(e).connect(this.echoIn);
    s.start(t, Math.random()); s.stop(t + 0.25);
  }

  kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(this.music); o.start(t); o.stop(t + 0.4);
  }

  snare(t, vol) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.9;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    s.connect(f).connect(g); g.connect(this.music);
    const e = ctx.createGain(); e.gain.value = 0.5; g.connect(e).connect(this.echoIn);
    s.start(t, Math.random()); s.stop(t + 0.3);
    this.voice('triangle', 190, t, 0.12, vol * 0.6);
  }

  hat(t, vol) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 7000; f.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f).connect(g).connect(this.music);
    s.start(t, Math.random()); s.stop(t + 0.08);
  }

  // Schedule one 16th note. Layers come in as `lvl` (0..1, from speed) rises.
  playStep(t, step, lvl) {
    const sixteenth = 60 / this.bpm / 4;
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const chord = this.chords[bar];
    // pad: always there, a warm bed
    if (s === 0) for (const n of chord) for (const d of [-7, 7]) this.voice('sawtooth', this.mtof(n), t, sixteenth * 16 + 0.6, 0.022, { attack: 0.7, cutoff: 900 + lvl * 900, echo: 0.35, detune: d });
    // bass: pulsing 8ths on the root
    if (s % 2 === 0) {
      const root = chord[0] - 24 + (s === 6 || s === 14 ? 12 : 0);
      this.voice('sawtooth', this.mtof(root), t, sixteenth * 1.8, 0.11 + lvl * 0.05, { cutoff: 260 + lvl * 380 });
    }
    if (lvl > 0.3 && s % 4 === 0) this.kick(t);
    if (lvl > 0.45 && (s === 4 || s === 12)) this.snare(t, 0.16);
    if (lvl > 0.6 && s % 4 === 2) this.hat(t, 0.025);
    // arpeggio over the chord, up an octave
    if (lvl > 0.72) {
      const n = chord[[0, 1, 2, 1][s % 4]] + 12 + (s >= 8 ? 12 : 0);
      this.voice('square', this.mtof(n), t, sixteenth * 0.9, 0.028, { cutoff: 2200, echo: 0.45 });
    }
  }

  // Title-screen track: the same synths, faster and brighter. Em - C - G - D, four-on-the-floor,
  // offbeat open hats, a driving octave bass and a hooky lead.
  menuStep(t, step) {
    const sixteenth = 60 / this.bpm / 4;
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const chords = [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]];
    const chord = chords[bar];
    if (s === 0) for (const n of chord) for (const d of [-9, 9]) this.voice('sawtooth', this.mtof(n), t, sixteenth * 16 + 0.4, 0.02, { attack: 0.25, cutoff: 1900, echo: 0.3, detune: d });
    // octave-bouncing bass on every 8th
    if (s % 2 === 0) this.voice('sawtooth', this.mtof(chord[0] - 24 + ((s / 2) % 2 ? 12 : 0)), t, sixteenth * 1.6, 0.13, { cutoff: 700 });
    if (s % 4 === 0) this.kick(t);
    if (s === 4 || s === 12) this.snare(t, 0.2);
    if (s % 4 === 2) this.hat(t, 0.05);
    else if (s % 2 === 1) this.hat(t, 0.018);
    // lead: a two-bar hook, answered an octave up on the second pass
    const hook = [0, -1, 2, -1, 1, -1, 2, 0, -1, 2, -1, 1, 0, -1, 2, -1];
    const k = hook[s];
    if (k >= 0 && (bar % 2 === 0 || s < 12)) {
      const n = chord[k] + 12 + (Math.floor(step / 64) % 2 ? 12 : 0);
      this.voice('square', this.mtof(n), t, sixteenth * 1.4, 0.034, { cutoff: 3200, echo: 0.5 });
    }
    // sparkle arp on the last bar of each phrase
    if (bar === 3 && s % 2 === 1) this.voice('triangle', this.mtof(chord[(s >> 1) % 3] + 24), t, sixteenth * 0.8, 0.025, { cutoff: 5000, echo: 0.4 });
  }

  // ---------- zone tracks ----------

  // CASINO: late-night lounge synthwave. A ii-V-I-vi in F with 9ths and 13ths, a walking bass,
  // swung brush hats, electric-piano comping, and a muted, vibrato-laden lead that noodles in
  // and out every other phrase.
  casinoStep(t, step) {
    const six = 60 / this.bpm / 4;
    const bar = Math.floor(step / 16) % 4, s = step % 16, phrase = Math.floor(step / 64);
    const chords = [[55, 58, 62, 65, 69], [48, 52, 58, 62, 69], [53, 57, 60, 64, 67], [50, 53, 57, 60, 64]];
    const ch = chords[bar];
    const swing = (s % 4 === 2) ? six * 0.33 : 0; // swung 8ths
    if (s === 0) for (const n of ch.slice(1)) this.voice('sawtooth', this.mtof(n), t, six * 16 + 0.5, 0.009, { attack: 0.6, cutoff: 1100, echo: 0.3, detune: n % 2 ? 6 : -6 });
    // walking bass: root, third, fifth, then a chromatic step into the next root
    const next = chords[(bar + 1) % 4][0];
    const walk = [ch[0], ch[0] + (ch[1] - ch[0] > 3 ? 4 : 3), ch[0] + 7, next + 1];
    if (s % 4 === 0) this.voice('triangle', this.mtof(walk[s / 4] - 24), t, six * 3.4, 0.2, { attack: 0.01, cutoff: 900 });
    // brushes and a ride, swung; a soft kick on 1 and 3
    if (s % 2 === 0) this.hat(t + swing, s % 4 === 0 ? 0.022 : 0.034);
    if (s === 4 || s === 12) this.snare(t, 0.06);
    if (s === 0 || s === 8) this.kick(t);
    // e-piano comping: the "and" of 2 and beat 4
    if (s === 6 || s === 12) for (const n of ch.slice(1, 4)) this.epiano(t + (s === 6 ? swing : 0), n + 12, six * 3, 0.035);
    // the muted lead, every other phrase
    if (phrase % 2 === 1) {
      const lick = [[9, -1, 7, -1, 4, -1, 2, 4, -1, -1, 7, -1, 5, 4, 2, -1], [0, -1, 2, 4, 5, -1, 4, 2, -1, 0, -1, -2, 0, -1, -1, -1]][bar % 2];
      const k = lick[s];
      if (k !== -1) this.voice('square', this.mtof(65 + (k === -2 ? -1 : k)), t + swing, six * 1.8, 0.03, { attack: 0.03, cutoff: 1500, q: 2, echo: 0.35, vib: 18, vibRate: 5 });
    }
  }

  // DOWNS: space-western. A minor with a harmonic-minor E7, a galloping kick-and-shaker rhythm,
  // a twangy guitar rolling through the chords, a lonesome whistle lead with long slides, and a
  // sci-fi zap on the turnaround.
  downsStep(t, step) {
    const six = 60 / this.bpm / 4;
    const bar = Math.floor(step / 16) % 4, s = step % 16, phrase = Math.floor(step / 64);
    const chords = [[45, 52, 57, 60, 64], [50, 57, 62, 65, 69], [52, 56, 59, 62, 64], [45, 52, 57, 60, 64]];
    const ch = chords[bar];
    // the gallop: kick on the beat, then a ta-ta on the shaker
    if (s % 4 === 0) this.kick(t);
    if (s % 4 === 2 || s % 4 === 3) this.hat(t, 0.03);
    if (s === 12) this.snare(t, 0.08);
    // boom-chicka bass: root and fifth
    if (s % 8 === 0) this.voice('sawtooth', this.mtof(ch[0] - 12), t, six * 3, 0.14, { cutoff: 420 });
    if (s % 8 === 4) this.voice('sawtooth', this.mtof(ch[1] - 12), t, six * 3, 0.1, { cutoff: 420 });
    // the twangy guitar
    const roll = [0, 2, 1, 3, 2, 4, 3, 2];
    if (s % 2 === 0) this.pluck(t, ch[roll[(s / 2) % 8]] + 12, 0.07);
    // a thin pad, like wind over a mesa
    if (s === 0) this.voice('triangle', this.mtof(ch[2] + 12), t, six * 16, 0.012, { attack: 1.2, cutoff: 1400, echo: 0.4 });
    // the whistle: long notes that slide in, every other phrase
    if (phrase % 2 === 0) {
      const tune = [[76, 0, 0, 0, 0, 0, 74, 0, 72, 0, 0, 0, 71, 0, 0, 0], [74, 0, 0, 0, 0, 0, 0, 0, 77, 0, 76, 0, 74, 0, 0, 0], [71, 0, 0, 0, 0, 0, 74, 0, 76, 0, 0, 0, 0, 0, 0, 0], [69, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]][bar];
      const n = tune[s];
      if (n) {
        const rest = tune.slice(s + 1).findIndex((x) => x);
        const len = rest < 0 ? 16 - s : rest + 1;
        this.voice('sine', this.mtof(n), t, six * Math.max(2, len) * 0.95, 0.06, { attack: 0.06, cutoff: 4000, echo: 0.5, vib: 22, vibRate: 6, from: this.mtof(n - 2) });
      }
    }
    // a laser-zap twang on the turnaround
    if (bar === 3 && s === 14) this.voice('sawtooth', 1800, t, 0.4, 0.04, { from: 300, cutoff: 3000, echo: 0.5 });
  }

  // LAB: clinical, sterile and slightly wrong. Whole-tone and #11 harmony that never resolves,
  // glassy sine pings in odd groupings, bubbling resonant bloops, instrument clicks, a slow sub
  // pulse like a heartbeat in the machine room, and a theremin that wanders in on alternate phrases.
  labStep(t, step) {
    const six = 60 / this.bpm / 4;
    const bar = Math.floor(step / 16) % 4, s = step % 16, phrase = Math.floor(step / 64);
    const chords = [[48, 52, 55, 59, 66], [46, 50, 54, 58], [44, 48, 52, 56], [47, 51, 54, 58, 61]];
    const ch = chords[bar];
    if (s === 0) for (const n of ch) this.voice('sine', this.mtof(n), t, six * 16 + 0.8, 0.018, { attack: 1.4, cutoff: 1800, echo: 0.3, detune: ((n % 3) - 1) * 9 });
    if (s === 0 || s === 7) this.voice('sine', this.mtof(ch[0] - 24), t, six * 3, 0.2, { cutoff: 300 });
    // pings in sevens and elevens against the four-beat bar
    if (step % 7 === 0 || step % 11 === 5) this.voice('sine', this.mtof(ch[(step >> 1) % ch.length] + 24), t, 0.5, 0.035, { attack: 0.002, cutoff: 8000, echo: 0.6 });
    if (s % 4 === 3) this.hat(t, 0.02);
    if (s === 10) this.voice('square', 2400, t, 0.02, 0.02, { cutoff: 6000 });
    if ((step * 5) % 13 < 2) this.bloop(t, 300 + ((step * 37) % 9) * 60, 0.05);
    if (phrase % 2 === 1 && (s === 0 || s === 8)) {
      const n = [66, 70, 64, 68, 72, 67, 71, 63][(bar * 2 + (s ? 1 : 0)) % 8];
      this.voice('sine', this.mtof(n), t, six * 7.5, 0.05, { attack: 0.3, cutoff: 3000, echo: 0.4, vib: 35, vibRate: 6.5, from: this.mtof(n - 3) });
    }
  }

  // DARK SIDE: aggressive darksynth. D phrygian, a driven 16th-note bass, four-on-the-floor with a
  // big echoing snare, gated pad stabs, and a growling saw riff on alternate phrases.
  darkStep(t, step) {
    const six = 60 / this.bpm / 4;
    const bar = Math.floor(step / 16) % 4, s = step % 16, phrase = Math.floor(step / 64);
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

  // tempo, loudness and brightness per track (the free-roam track follows your speed instead)
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

  updateMusic(speed) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // crossfade: fade the current track out, switch, fade the new one in
    if (this.want !== this.track) {
      this.fade = Math.max(0, this.fade - 0.02);
      if (this.fade <= 0) this.switchTrack(this.want);
    } else this.fade = Math.min(1, this.fade + 0.015);
    if (this.track !== 'free') {
      const info = this.trackInfo(this.track);
      this.music.gain.setTargetAtTime(this.musicOn ? info.vol * this.fade : 0, t, 0.3);
      this.musicTone.frequency.setTargetAtTime(info.tone, t, 0.4);
      const fn = { menu: this.menuStep, casino: this.casinoStep, downs: this.downsStep, lab: this.labStep, dark: this.darkStep }[this.track];
      const six = 60 / this.bpm / 4;
      if (this.nextNote < t - 0.5) this.nextNote = t + 0.05;
      while (this.nextNote < t + 0.2) {
        if (this.musicOn && this.fade > 0.02) fn.call(this, this.nextNote, this.step);
        this.nextNote += six;
        this.step++;
      }
      return;
    }
    const target = Math.min(1, speed / 110);
    this.level += (target - this.level) * (target > this.level ? 0.02 : 0.008);
    const vol = this.musicOn ? (0.05 + this.level * 0.55) * this.fade : 0;
    this.music.gain.setTargetAtTime(vol, t, 0.4);
    this.musicTone.frequency.setTargetAtTime(700 + this.level * 3300, t, 0.4);
    const sixteenth = 60 / this.bpm / 4;
    if (this.nextNote < t - 0.5) this.nextNote = t + 0.05; // tab was asleep: don't burst-fire
    while (this.nextNote < t + 0.2) {
      if (this.musicOn && this.fade > 0.02) this.playStep(this.nextNote, this.step, this.level);
      this.nextNote += sixteenth;
      this.step++;
    }
  }

  // settings: master / music / effects volume (0..1); safe to call before init()
  setVolumes(master, music, sfx) {
    this.vol = { master, music, sfx };
    if (!this.ctx || !this.out) return;
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(master, t, 0.03);
    this.musicBus.gain.setTargetAtTime(0.5 * music, t, 0.03);
    this.master.gain.setTargetAtTime(0.5 * sfx, t, 0.03);
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    return this.musicOn;
  }

  update(speed, skating, grounded, thrusting) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = Math.min(1, speed / 90);
    // rumble swells with speed but stays low and soft (no high-frequency hiss at top speed)
    this.windG.gain.setTargetAtTime(Math.min(0.5, s) * 0.16 * (grounded ? 1 : 0.6), t, 0.15);
    this.windF.frequency.setTargetAtTime(140 + Math.min(1, s) * 380, t, 0.15);
    this.humG.gain.setTargetAtTime(skating && grounded ? 0.05 + s * 0.06 : 0, t, 0.05);
    this.hum.frequency.setTargetAtTime(55 + s * 120, t, 0.1);
    this.jetG.gain.setTargetAtTime(thrusting ? 0.16 : 0, t, 0.05);
    // the crowd breathes: slow swells on top of the level, plus any recent roar
    this.crowdBoost = Math.max(0, this.crowdBoost - 0.006);
    const sw = 0.8 + 0.12 * Math.sin(t * 0.9) + 0.08 * Math.sin(t * 2.3 + 1);
    this.crowdG.gain.setTargetAtTime((this.crowdLevel + this.crowdBoost * 0.6) * sw * 0.32, t, 0.25);
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
  pickup() { this.tone(660, 0.1, 'triangle', 0.2); setTimeout(() => this.tone(990, 0.15, 'triangle', 0.2), 90); }
  cash() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'triangle', 0.18), i * 80)); }
  alarm() { this.tone(740, 0.2, 'square', 0.1); setTimeout(() => this.tone(520, 0.2, 'square', 0.1), 200); }
  hurt() { this.tone(160, 0.25, 'sawtooth', 0.2, 0.5); }
  jump() { this.tone(300, 0.15, 'sine', 0.15, 2.2); }
  click() { this.tone(1200, 0.04, 'square', 0.06); }
}
