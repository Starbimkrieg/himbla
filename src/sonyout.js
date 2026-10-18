// PlayStation pad output over WebHID: rumble, the lightbar, the player LEDs and (DualSense) the adaptive triggers.
//
// The browser Gamepad API can't do any of this for a Sony pad except, sometimes, a plain rumble (and over Bluetooth
// often not even that), so it is written straight to the pad as an HID output report, over the same link gyro.js
// reads the motion sensors through (GyroPad opens the device; this only sends to it).
//
// Report layouts, checked against the Linux hid-playstation / hid-sony drivers and the open-source dualsense-ts
// and pydualsense packages (WebHID takes the report id separately, so every offset is from after it):
//   DualSense  USB  id 0x02, 47 bytes: the "common" block below
//              BT   id 0x31, 77 bytes: sequence<<4, 0x10, the common block, 24 zero bytes, CRC-32
//   DualShock4 USB  id 0x05, 31 bytes: flags, 0, 0, weak, strong, r, g, b, ...
//              BT   id 0x11, 77 bytes: 0xC0|poll, 0, then those, zeros, CRC-32
//   (Bluetooth CRC: standard CRC-32 of 0xA2, the report id, and every byte before the CRC; stored little-endian.)
// DualSense common block:  0 flags0 (0x01 rumble, 0x02 haptics select, 0x04 / 0x08 right / left trigger)
//   1 flags1 (0x04 lightbar, 0x10 player LEDs)   2 weak motor   3 strong motor   10..20 right trigger effect
//   21..31 left trigger effect   38 flags2 (0x02 lightbar setup, 0x04 rumble v2)   41 lightbar setup
//   43 player LEDs (5 bits)   44..46 lightbar red, green, blue.

const SONY_DS5 = 'ds5', SONY_DS4 = 'ds4';

// ---- CRC-32 (the Bluetooth reports carry one) ----
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes, from = 0, to = bytes.length, crc = 0xffffffff) {
  for (let i = from; i < to; i++) crc = CRC[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return crc >>> 0;
}
// the checksum of a Bluetooth output report: over the 0xA2 seed, the report id and the data up to the checksum
export function btCrc(id, data) {
  let c = crc32([0xa2, id]);
  c = crc32(data, 0, data.length - 4, c);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- DualSense trigger effects: 11 bytes, a mode and ten parameters ----
export const TRIGGER_OFF = new Uint8Array(11);
// the ten zones of a trigger's travel (0 = untouched, 9 = all the way down), from `position` to the end, each with
// the same strength 1..8: a 10-bit mask of the zones and 3 bits of strength per zone
function zones(position, strength) {
  let active = 0, packed = 0;
  const b = (strength - 1) & 7;
  for (let i = position; i < 10; i++) { active |= 1 << i; packed |= b << (3 * i); }
  return [active, packed];
}
const clampI = (x, lo, hi) => Math.max(lo, Math.min(hi, Math.round(x)));
// a wall: resistance from `position` (0-9) on, `strength` 1-8
export function feedback(position, strength) {
  const e = new Uint8Array(11);
  position = clampI(position, 0, 9); strength = clampI(strength, 0, 8);
  if (!strength) return e;
  const [a, p] = zones(position, strength);
  e[0] = 0x21; e[1] = a & 0xff; e[2] = (a >> 8) & 0xff;
  e[3] = p & 0xff; e[4] = (p >>> 8) & 0xff; e[5] = (p >>> 16) & 0xff; e[6] = (p >>> 24) & 0xff;
  return e;
}
// a click: resistance that gives way (like a gun's trigger) between zones `start` (2-7) and `end` (start+1..8)
export function weapon(start, end, strength) {
  const e = new Uint8Array(11);
  start = clampI(start, 2, 7); end = clampI(end, start + 1, 8); strength = clampI(strength, 0, 8);
  if (!strength) return e;
  const m = (1 << start) | (1 << end);
  e[0] = 0x25; e[1] = m & 0xff; e[2] = (m >> 8) & 0xff; e[3] = (strength - 1) & 7;
  return e;
}
// a buzz in the trigger from `position` on: amplitude 1-8, `hz` 1-255
export function vibration(position, amplitude, hz) {
  const e = new Uint8Array(11);
  position = clampI(position, 0, 9); amplitude = clampI(amplitude, 0, 8); hz = clampI(hz, 0, 255);
  if (!amplitude || !hz) return e;
  const [a, p] = zones(position, amplitude);
  e[0] = 0x26; e[1] = a & 0xff; e[2] = (a >> 8) & 0xff;
  e[3] = p & 0xff; e[4] = (p >>> 8) & 0xff; e[5] = (p >>> 16) & 0xff; e[6] = (p >>> 24) & 0xff;
  e[9] = hz;
  return e;
}

// ---- reports ----
// st: { weak, strong (0-255), rt, lt (effects), rgb [r, g, b] | null, leds (0-31), setup (first lightbar write) }
// kind: 'usb' | 'bt'; seq: the Bluetooth sequence number (0-15). Returns { id, data }.
export function buildReport(model, kind, seq, st) {
  const rgb = st.rgb;
  if (model === SONY_DS5) {
    const c = new Uint8Array(47);
    c[0] = 0x03 | 0x0c;
    c[1] = rgb ? 0x04 | 0x10 : 0;
    c[2] = st.weak; c[3] = st.strong;
    c.set(st.rt || TRIGGER_OFF, 10);
    c.set(st.lt || TRIGGER_OFF, 21);
    c[38] = 0x04 | (rgb && st.setup ? 0x02 : 0);
    if (rgb) {
      c[41] = st.setup ? 0x02 : 0;
      c[43] = st.leds & 0x1f;
      c[44] = rgb[0]; c[45] = rgb[1]; c[46] = rgb[2];
    }
    if (kind === 'usb') return { id: 0x02, data: c };
    const d = new Uint8Array(77);
    d[0] = (seq & 15) << 4; d[1] = 0x10;
    d.set(c, 2);
    new DataView(d.buffer).setUint32(73, btCrc(0x31, d), true);
    return { id: 0x31, data: d };
  }
  // DualShock 4: rumble and the lightbar
  const c = new Uint8Array(10);
  c[0] = 0x01 | (rgb ? 0x02 : 0);
  c[3] = st.weak; c[4] = st.strong;
  if (rgb) { c[5] = rgb[0]; c[6] = rgb[1]; c[7] = rgb[2]; }
  if (kind === 'usb') {
    const d = new Uint8Array(31);
    d.set(c, 0);
    return { id: 0x05, data: d };
  }
  const d = new Uint8Array(77);
  d[0] = 0xc4; // (HID, CRC-32 and a 4 ms poll)
  d.set(c, 2);
  new DataView(d.buffer).setUint32(73, btCrc(0x11, d), true);
  return { id: 0x11, data: d };
}

const FAIL_PAUSE = 10000; // ms to leave the pad alone after three writes in a row fail
const GAP = 30;           // ms between reports at most (the lightbar and triggers change smoothly; a kick goes out at once)
const KEEP = 1000;        // ms: re-send an unchanged state this often
const HOLD = 300;         // ms: rumble that isn't refreshed this long is cut (the game stalled)

export class SonyOut {
  constructor(gyro) {
    this.gyro = gyro;
    this.st = { weak: 0, strong: 0, rt: TRIGGER_OFF, lt: TRIGGER_OFF, rgb: null, leds: 0, setup: false };
    this.sentKey = '';
    this.sentAt = -1e9;
    this.rumbleAt = 0;
    this.busy = false;
    this.seq = 0;
    this.fails = 0;
    this.pause = 0;     // performance.now() until which writes are held off
    this.lastErr = '';
    this.sent = 0;      // reports written (the dev overlay / settings status)
    this.dev = null;    // the device the layout below belongs to
    this.kind = null;
    this.urgent = false;
    // (a rumble the game stopped refreshing is cut: a stalled frame must not leave the pad buzzing)
    setInterval(() => {
      const s = this.st;
      if ((s.weak || s.strong) && performance.now() - this.rumbleAt > HOLD) { s.weak = s.strong = 0; this.urgent = true; this.flush(); }
    }, 100);
  }

  // 'usb' | 'bt' for the pad that's open, from the output reports its descriptor lists (null: not usable)
  layout() {
    const d = this.gyro.dev;
    if (d !== this.dev) {
      this.dev = d; this.kind = null; this.sentKey = ''; this.st.setup = true; this.fails = 0; this.pause = 0; this.lastErr = '';
      if (d) {
        const ids = new Set();
        for (const col of d.collections || []) for (const r of col.outputReports || []) ids.add(r.reportId);
        if (this.gyro.model === SONY_DS5) this.kind = ids.has(0x31) ? 'bt' : ids.has(0x02) ? 'usb' : null;
        else this.kind = ids.has(0x11) ? 'bt' : ids.has(0x05) ? 'usb' : null;
      }
    }
    return this.kind;
  }

  get ready() {
    const d = this.gyro.dev;
    return !!(d && d.opened && this.layout() && performance.now() >= this.pause);
  }

  get model() { return this.gyro.model; }
  get triggers() { return this.gyro.model === SONY_DS5; }

  // 0..1
  rumble(strong, weak) {
    const s = this.st;
    const q = (x) => Math.round(Math.max(0, Math.min(1, x)) * 15) * 17; // (16 steps: no flood of tiny changes)
    const ns = q(strong), nw = q(weak);
    if (ns > s.strong || nw > s.weak) this.urgent = true;
    s.strong = ns; s.weak = nw;
    if (ns || nw) this.rumbleAt = performance.now();
  }

  triggerFx(rt, lt) { this.st.rt = rt || TRIGGER_OFF; this.st.lt = lt || TRIGGER_OFF; }

  // colour 0-255 each (null: leave the pad's own), leds: 5 bits
  light(rgb, leds) {
    const q = (v) => Math.min(255, Math.round(v / 8) * 8);
    this.st.rgb = rgb ? [q(rgb[0]), q(rgb[1]), q(rgb[2])] : null;
    this.st.leds = leds | 0;
  }

  // everything off (a pause, the tab hidden, the settings turned it off)
  quiet() {
    this.st.weak = this.st.strong = 0;
    this.st.rt = this.st.lt = TRIGGER_OFF;
    this.urgent = true;
    this.flush();
  }

  // Send the wanted state if it has changed (or a second has passed). Called once a frame.
  flush() {
    if (this.busy || !this.ready) return;
    const now = performance.now(), s = this.st;
    const key = `${s.weak}|${s.strong}|${s.leds}|${s.rgb ? s.rgb.join(',') : '-'}|${s.rt.join(',')}|${s.lt.join(',')}`;
    if (key === this.sentKey && now - this.sentAt < KEEP) return;
    if (!this.urgent && now - this.sentAt < GAP) return;
    this.urgent = false;
    const { id, data } = buildReport(this.gyro.model, this.kind, this.seq, s);
    this.seq = (this.seq + 1) & 15;
    this.busy = true; this.sentAt = now; this.sentKey = key;
    const dev = this.gyro.dev;
    dev.sendReport(id, data).then(() => {
      this.busy = false; this.fails = 0; this.sent++;
      if (s.rgb) s.setup = false;
    }).catch((err) => {
      this.busy = false; this.sentKey = '';
      this.lastErr = (err && err.message) || String(err);
      if (++this.fails >= 3) { this.pause = performance.now() + FAIL_PAUSE; this.fails = 0; }
    });
  }

  get status() {
    const d = this.gyro.dev;
    if (!d) return '';
    if (!this.layout()) return 'this controller exposes no output report';
    if (performance.now() < this.pause) return `could not write to it (${this.lastErr})`;
    return '';
  }
}
