// PlayStation motion sensors over WebHID.
//
// The Gamepad API never exposes the DS4 / DualSense gyro, so it's read from HID input reports (WebHID: Chrome,
// Edge, desktop app; not Firefox or Safari). While Circle is held, the pad's turn since Circle went down stands
// in for the left stick (gamepad.js): ground movement, and flips and spins in the air.
//
// Layouts checked against dualsense-ts, jsdualsense and webhid-ds4. `event.data` has the report-id byte stripped,
// so offsets are from after it:
//   DualSense   USB   report 0x01   gyro X/Y/Z (int16 LE) at 15
//               BT    report 0x31   gyro at 16    (only sent after feature report 0x05 is read)
//   DualShock 4 USB   report 0x01   gyro at 12
//               BT    report 0x11   gyro at 14    (needs feature report 0x02 read first)
// Axes are the pad's: X pitch, Y yaw, Z roll (steering-wheel turn).

const SONY = 0x054c;
const DS5 = new Set([0x0ce6, 0x0df2]); // DualSense, DualSense Edge
const DS4 = new Set([0x05c4, 0x09cc, 0x0ba0]); // DualShock 4 v1, v2, USB wireless adaptor
const FILTERS = [...DS5, ...DS4].map((productId) => ({ vendorId: SONY, productId }));
const LSB = 32767 / 2000; // raw counts per deg/s (+-2000 deg/s full scale)
const STALE = 0.25; // s without a report before the gyro counts as gone

export const gyroSupported = () => typeof navigator !== 'undefined' && !!navigator.hid;

export class GyroPad {
  constructor() {
    this.dev = null;
    this.model = null; // 'ds5' | 'ds4'
    this.transport = ''; // 'USB' | 'Bluetooth' (from the arriving report id)
    this.bias = [0, 0, 0]; // raw counts
    this.scale = [1, 1, 1]; // per-axis trim from the DualSense calibration report
    this.rate = [0, 0, 0]; // deg/s: pitch, yaw, roll
    this.theta = { x: 0, z: 0 }; // degrees turned about X (pitch) and Z (roll) since begin()
    this.on = false; // Circle held: integrate
    this.lastT = 0; // timestamp of the last motion report
    this.still = 0; // s held still (re-learns the zero offset)
    this.status = gyroSupported() ? 'Not connected' : (typeof window !== 'undefined' && window.isSecureContext === false ? 'Needs a secure page (https:// or localhost)' : 'Not supported in this browser (needs Chrome, Edge or the desktop app)');
    this.onStatus = null; // settings screen's refresh hook
    this._report = (e) => this.report(e);
    if (gyroSupported()) {
      navigator.hid.addEventListener('connect', (e) => { if (this.isPad(e.device)) this.attach(e.device); });
      navigator.hid.addEventListener('disconnect', (e) => { if (e.device === this.dev) this.detach('Disconnected'); });
    }
  }

  isPad(d) { return d && d.vendorId === SONY && (DS5.has(d.productId) || DS4.has(d.productId)); }

  setStatus(s) { this.status = s; if (this.onStatus) this.onStatus(); }

  // pads already permitted (desktop app: up front; browser: after the first CONNECT). No gesture needed.
  async init() {
    if (!gyroSupported()) return;
    try {
      for (const d of await navigator.hid.getDevices()) if (this.isPad(d) && !this.dev) await this.attach(d);
    } catch (err) {
      if (err && /permissions? policy/i.test(err.message || '')) this.setStatus('Blocked by the page hosting the game (it has to allow "hid")');
    }
  }

  // CONNECT button: the browser's picker (needs a real click, not a controller press)
  async request() {
    if (!gyroSupported()) return this.status;
    try {
      const picked = await navigator.hid.requestDevice({ filters: FILTERS });
      for (const d of picked) if (this.isPad(d)) await this.attach(d);
      if (!picked.length && !this.dev) this.setStatus('No PlayStation controller found');
    } catch (err) {
      if (!this.dev) {
        const msg = (err && err.message) || String(err);
        this.setStatus(/permissions? policy/i.test(msg) ? 'Blocked by the page hosting the game (it has to allow "hid")'
          : err && err.name === 'SecurityError' ? 'Click the button with the mouse (a controller press is not allowed to ask)'
            : `Could not connect (${msg})`);
      }
    }
    return this.status;
  }

  async attach(d) {
    if (this.dev) return;
    try {
      if (!d.opened) await d.open();
      this.dev = d;
      this.model = DS5.has(d.productId) ? 'ds5' : 'ds4';
      this.transport = '';
      this.bias = [0, 0, 0]; this.scale = [1, 1, 1]; this.rate = [0, 0, 0]; this.still = 0; this.lastT = 0; this.prev = null;
      // over Bluetooth the pad sends short reports with no motion until a feature report is read (DualSense 0x05,
      // which also holds the calibration; DS4 0x02). Harmless over USB.
      try {
        if (this.model === 'ds5') this.calibrate(await d.receiveFeatureReport(0x05));
        else await d.receiveFeatureReport(0x02);
      } catch { /* the first reports will tell */ }
      d.addEventListener('inputreport', this._report);
      this.setStatus(`${d.productName || (this.model === 'ds5' ? 'DualSense' : 'DualShock 4')}: waiting for motion data`);
    } catch (err) {
      this.dev = null;
      this.setStatus(`Could not open the controller (${(err && err.message) || err}). Close other apps using it (Steam, DS4Windows); on Linux it also needs a udev rule (see the README).`);
    }
  }

  detach(why) {
    if (this.dev) this.dev.removeEventListener('inputreport', this._report);
    this.dev = null;
    this.on = false;
    this.rate = [0, 0, 0];
    this.setStatus(why);
  }

  // DualSense feature report 0x05 (id stripped): bias int16 LE at 0,2,4; plus / minus at 6,8 (pitch), 10,12 (yaw),
  // 14,16 (roll). Gives the zero offset and evens the axes out.
  calibrate(dv) {
    if (!dv || dv.byteLength < 17) return;
    const o = dv.byteLength === 41 ? 1 : 0;
    const i16 = (n) => dv.getInt16(o + n, true);
    const bias = [i16(0), i16(2), i16(4)];
    const range = [i16(6) - i16(8), i16(10) - i16(12), i16(14) - i16(16)].map(Math.abs);
    const maxR = Math.max(...range);
    if (!bias.every((b) => Math.abs(b) < 8000) || !range.every((r) => r > 1000) || !(maxR > 0)) return; // nonsense: keep defaults
    this.bias = bias;
    this.scale = range.map((r) => maxR / r);
  }

  report(e) {
    const d = e.data, id = e.reportId;
    const off = this.model === 'ds5' ? (id === 0x31 ? 16 : id === 0x01 ? 15 : -1) : id === 0x11 ? 14 : id === 0x01 ? 12 : -1;
    if (off < 0 || d.byteLength < off + 6 || (id === 0x01 && d.byteLength < 24)) return; // short Bluetooth report: no motion
    // receive time, not handler time, so reports queued behind a stalled frame still count
    const t = typeof e.timeStamp === 'number' && e.timeStamp > 0 ? e.timeStamp : performance.now();
    const dt = this.lastT ? Math.min(STALE, Math.max(0, (t - this.lastT) / 1000)) : 0;
    this.lastT = t;
    const tr = id === 0x01 ? 'USB' : 'Bluetooth';
    if (tr !== this.transport) { this.transport = tr; this.setStatus(`${this.dev && this.dev.productName ? this.dev.productName : 'PlayStation controller'}: connected (${tr})`); }
    const raw = [d.getInt16(off, true), d.getInt16(off + 2, true), d.getInt16(off + 4, true)];
    let calm = true;
    for (let i = 0; i < 3; i++) {
      this.rate[i] = ((raw[i] - this.bias[i]) / LSB) * this.scale[i];
      // calm: barely changed since the last report, and near zero after the offset
      if (Math.abs(this.rate[i]) > 6 || (this.prev && Math.abs(raw[i] - this.prev[i]) > LSB)) calm = false;
    }
    this.prev = raw;
    // held still a moment: that reading is the zero, so drift can't build up. Not while Circle is held (a slow
    // steady tilt must not be learned away).
    this.still = calm && !this.on ? this.still + dt : 0;
    if (this.still > 0.4) for (let i = 0; i < 3; i++) this.bias[i] += (raw[i] - this.bias[i]) * Math.min(1, dt * 2);
    if (this.on && dt) {
      this.theta.x += this.rate[0] * dt;
      this.theta.z += this.rate[2] * dt;
    }
  }

  live() { return !!this.dev && this.lastT > 0 && (performance.now() - this.lastT) / 1000 < STALE; } // lastT is an event timestamp, same clock as performance.now()

  // Circle went down: the current hold is neutral
  begin() { this.theta.x = 0; this.theta.z = 0; this.on = true; }
  end() { this.on = false; this.theta.x = 0; this.theta.z = 0; }

  // virtual left stick, x right / y down like Gamepad API axes (y < 0 forward). Tipping the top edge away pushes
  // forward; turning it like a wheel steers. fullDeg: full push; deadDeg: ignored. invX / invY flip an axis.
  stick(fullDeg, deadDeg, invX, invY) {
    const ramp = (a) => {
      const m = Math.max(0, Math.abs(a) - deadDeg) / Math.max(1, fullDeg - deadDeg);
      return Math.sign(a) * Math.min(1, m);
    };
    const x = ramp(-this.theta.z), y = ramp(this.theta.x);
    return { x: invX ? -x : x, y: invY ? -y : y };
  }

  // a line for the dev overlay
  debug() {
    if (!this.dev) return 'gyro: no pad';
    const f = (v) => v.toFixed(0).padStart(4);
    return `gyro ${this.live() ? 'live' : 'idle'} · rate ${f(this.rate[0])} ${f(this.rate[1])} ${f(this.rate[2])} °/s · turned ${f(this.theta.x)} ${f(this.theta.z)}° ${this.on ? '(circle held)' : ''}`;
  }
}
