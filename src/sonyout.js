// PlayStation pad output over WebHID: rumble, lightbar, player LEDs and (DualSense) adaptive triggers.
//
// The Gamepad API can do at most a plain rumble on Sony pads (often not over Bluetooth), so this writes HID output
// reports over gyro.js's link (GyroPad opens the device; this only sends).
//
// Report layouts, checked against Linux hid-playstation / hid-sony, dualsense-ts and pydualsense (WebHID takes the
// report id separately, so offsets start after it):
//   DualSense  USB  id 0x02, 47 bytes: the "common" block below
//              BT   id 0x31, 77 bytes: sequence<<4, 0x10, the common block, 24 zero bytes, CRC-32
//   DualShock4 USB  id 0x05, 31 bytes: flags, 0, 0, weak, strong, r, g, b, ...
//              BT   id 0x11, 77 bytes: 0xC0|poll, 0, then those, zeros, CRC-32
//   (BT CRC: standard CRC-32 of 0xA2, the report id and every byte before it; little-endian.)
// DualSense common block:  0 flags0 (0x01 rumble, 0x02 haptics select, 0x04 / 0x08 right / left trigger)
//   1 flags1 (0x04 lightbar, 0x10 player LEDs)   2 weak motor   3 strong motor   10..20 right trigger effect
//   21..31 left trigger effect   38 flags2 (0x02 lightbar setup, 0x04 rumble v2)   41 lightbar setup
//   43 player LEDs (5 bits)   44..46 lightbar red, green, blue.

const SONY_DS5 = 'ds5';

// ---- CRC-32 (Bluetooth reports) ----
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes, from = 0, to = bytes.length, crc = 0xffffffff) {
  for (let i = from; i < to; i++) crc = CRC[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return crc >>> 0;
}
// BT output report checksum: 0xA2 seed, report id, data up to the checksum
function btCrc(id, data) {
  return (crc32(data, 0, data.length - 4, crc32([0xa2, id])) ^ 0xffffffff) >>> 0;
}

// ---- DualSense trigger effects: 11 bytes, mode + ten parameters ----
export const TRIGGER_OFF = new Uint8Array(11);
// effect `mode` over travel zones `position`..9 (0 = untouched, 9 = fully down) at strength 1..8: a 10-bit zone mask and
// 3 bits per zone, written into e[0..6]
function zones(e, mode, position, strength) {
  let active = 0, packed = 0;
  const b = (strength - 1) & 7;
  for (let i = position; i < 10; i++) { active |= 1 << i; packed |= b << (3 * i); }
  e[0] = mode; e[1] = active & 0xff; e[2] = (active >> 8) & 0xff;
  e[3] = packed & 0xff; e[4] = (packed >>> 8) & 0xff; e[5] = (packed >>> 16) & 0xff; e[6] = (packed >>> 24) & 0xff;
  return e;
}
const clampI = (x, lo, hi) => Math.max(lo, Math.min(hi, Math.round(x)));
// a wall: resistance from `position` (0-9) on, `strength` 1-8
export function feedback(position, strength) {
  const e = new Uint8Array(11);
  position = clampI(position, 0, 9); strength = clampI(strength, 0, 8);
  return strength ? zones(e, 0x21, position, strength) : e;
}
// a click: resistance that gives way like a gun trigger, between zones `start` (2-7) and `end` (start+1..8)
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
  zones(e, 0x26, position, amplitude);
  e[9] = hz;
  return e;
}

// ---- reports ----
// st: { weak, strong (0-255), rt, lt (effects), rgb [r, g, b] | null, leds (0-31), setup (first lightbar write) }
// kind: 'usb' | 'bt'; seq: BT sequence number (0-15). Returns { id, data }.
function buildReport(model, kind, seq, st) {
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
    return kind === 'usb' ? { id: 0x02, data: c } : btReport(0x31, (seq & 15) << 4, 0x10, c);
  }
  // DualShock 4: rumble and lightbar
  const c = new Uint8Array(31);
  c[0] = 0x01 | (rgb ? 0x02 : 0);
  c[3] = st.weak; c[4] = st.strong;
  if (rgb) { c[5] = rgb[0]; c[6] = rgb[1]; c[7] = rgb[2]; }
  return kind === 'usb' ? { id: 0x05, data: c } : btReport(0x11, 0xc4, 0, c); // 0xc4: HID, CRC-32, 4 ms poll
}
// the Bluetooth form: two header bytes, the USB report from byte 2, CRC-32 in the last four
function btReport(id, h0, h1, c) {
  const d = new Uint8Array(77);
  d[0] = h0; d[1] = h1;
  d.set(c, 2);
  new DataView(d.buffer).setUint32(73, btCrc(id, d), true);
  return { id, data: d };
}

const FAIL_PAUSE = 10000; // ms to back off after three failed writes in a row
const GAP = 30;           // ms min between reports (urgent kicks skip it)
const KEEP = 1000;        // ms: re-send an unchanged state this often
const HOLD = 300;         // ms: unrefreshed rumble is cut (game stalled)

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
    this.pause = 0;     // performance.now() until writes resume
    this.lastErr = '';
    this.dev = null;    // device `kind` belongs to
    this.kind = null;
    this.urgent = false;
    // cut stale rumble so a stalled frame can't leave the pad buzzing
    setInterval(() => {
      const s = this.st;
      if ((s.weak || s.strong) && performance.now() - this.rumbleAt > HOLD) { s.weak = s.strong = 0; this.urgent = true; this.flush(); }
    }, 100);
  }

  // 'usb' | 'bt' from the open pad's listed output reports (null: unusable)
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

  get triggers() { return this.gyro.model === SONY_DS5; }

  // 0..1
  rumble(strong, weak) {
    const s = this.st;
    const q = (x) => Math.round(Math.max(0, Math.min(1, x)) * 15) * 17; // 16 steps, so tiny changes don't flood
    const ns = q(strong), nw = q(weak);
    if (ns > s.strong || nw > s.weak) this.urgent = true;
    s.strong = ns; s.weak = nw;
    if (ns || nw) this.rumbleAt = performance.now();
  }

  triggerFx(rt, lt) { this.st.rt = rt || TRIGGER_OFF; this.st.lt = lt || TRIGGER_OFF; }

  // rgb 0-255 (null: keep the pad's own), leds: 5 bits
  light(rgb, leds) {
    const q = (v) => Math.min(255, Math.round(v / 8) * 8);
    this.st.rgb = rgb ? [q(rgb[0]), q(rgb[1]), q(rgb[2])] : null;
    this.st.leds = leds | 0;
  }

  // all off (pause, hidden tab, disabled in settings)
  quiet() {
    this.st.weak = this.st.strong = 0;
    this.st.rt = this.st.lt = TRIGGER_OFF;
    this.urgent = true;
    this.flush();
  }

  // per frame: send the state if changed (or KEEP has passed)
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
      this.busy = false; this.fails = 0;
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
