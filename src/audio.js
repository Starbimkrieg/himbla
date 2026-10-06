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
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.Q.value = 0.8;
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
    this.jetF = ctx.createBiquadFilter(); this.jetF.type = 'lowpass'; this.jetF.frequency.value = 900;
    this.jetG = ctx.createGain(); this.jetG.gain.value = 0;
    src2.connect(this.jetF).connect(this.jetG).connect(this.master);
    src2.start();
  }

  update(speed, skating, grounded, thrusting) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = Math.min(1, speed / 90);
    this.windG.gain.setTargetAtTime(s * 0.35 * (grounded ? 1 : 0.6), t, 0.1);
    this.windF.frequency.setTargetAtTime(200 + s * 1800, t, 0.1);
    this.humG.gain.setTargetAtTime(skating && grounded ? 0.05 + s * 0.06 : 0, t, 0.05);
    this.hum.frequency.setTargetAtTime(55 + s * 120, t, 0.1);
    this.jetG.gain.setTargetAtTime(thrusting ? 0.25 : 0, t, 0.05);
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
