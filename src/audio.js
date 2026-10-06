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
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

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

    this.initMusic();
  }

  // ---------- synthwave: a slow A-minor groove whose layers and volume follow your speed ----------
  initMusic() {
    const ctx = this.ctx;
    this.musicOn = this.musicOn ?? true;
    this.music = ctx.createGain(); this.music.gain.value = 0;
    this.musicTone = ctx.createBiquadFilter(); this.musicTone.type = 'lowpass'; this.musicTone.frequency.value = 900; this.musicTone.Q.value = 0.4;
    this.music.connect(this.musicTone).connect(this.master);
    // dreamy echo for pads, arp and snare
    this.echoIn = ctx.createGain(); this.echoIn.gain.value = 1;
    const delay = ctx.createDelay(1); delay.delayTime.value = (60 / 96) * 0.75;
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
  }

  mtof(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  voice(type, freq, t, dur, vol, { attack = 0.01, cutoff = 2000, echo = 0, detune = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.music);
    if (echo) { const e = ctx.createGain(); e.gain.value = echo; g.connect(e).connect(this.echoIn); }
    o.start(t); o.stop(t + dur + 0.05);
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

  updateMusic(speed) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const target = Math.min(1, speed / 110);
    this.level += (target - this.level) * (target > this.level ? 0.02 : 0.008);
    const vol = this.musicOn ? 0.05 + this.level * 0.55 : 0;
    this.music.gain.setTargetAtTime(vol, t, 0.4);
    this.musicTone.frequency.setTargetAtTime(700 + this.level * 3300, t, 0.4);
    const sixteenth = 60 / this.bpm / 4;
    if (this.nextNote < t - 0.5) this.nextNote = t + 0.05; // tab was asleep: don't burst-fire
    while (this.nextNote < t + 0.2) {
      if (this.musicOn) this.playStep(this.nextNote, this.step, this.level);
      this.nextNote += sixteenth;
      this.step++;
    }
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
