// Save slots.
//
// Every game module persists itself under its own 'moonrunner-*' localStorage key (the "live"
// working copy) and reads it back in its constructor. A slot is a single JSON blob ('mr-slot-N')
// holding a copy of every live per-slot key plus a little metadata for the menu cards.
//
//   choosing a slot   -> clear live keys, copy the slot's keys back in, reload the page
//   while playing     -> snapshot live keys into the active slot (timer, deliveries, unload…)
//
// Settings ('moonrunner-settings-v1') are global and never touched here.

export const SLOT_COUNT = 3;
const PREFIX = 'moonrunner-';
const GLOBAL_KEYS = new Set(['moonrunner-settings-v1']);
const MAIN_KEY = 'moonrunner-save-v1';
const ACTIVE_KEY = 'mr-active-slot';
const INIT_KEY = 'mr-slots-init';
const AUTOSTART_KEY = 'mr-autostart'; // sessionStorage: drop straight into play after a reload
const slotKey = (n) => `mr-slot-${n}`;

const ls = () => { try { return window.localStorage; } catch { return null; } };
const ss = () => { try { return window.sessionStorage; } catch { return null; } };

export class SaveSlots {
  constructor() {
    const L = ls();
    this.switching = false; // set while we rewrite live keys + reload: suppresses unload snapshots
    this.sessionPlay = 0; // seconds played this page load
    this.migrate();
    const a = L ? parseInt(L.getItem(ACTIVE_KEY), 10) : NaN;
    this.active = a >= 1 && a <= SLOT_COUNT && this.read(a) ? a : null;
    if (!this.active) {
      // no slot in use: the menu's background world starts from a clean slate
      if (L) L.removeItem(ACTIVE_KEY);
      this.clearLive();
    }
    const S = ss();
    this.autostart = !!(S && S.getItem(AUTOSTART_KEY) && this.active);
    if (S) S.removeItem(AUTOSTART_KEY);
    const m = this.active ? this.read(this.active).meta || {} : {};
    this.playBase = m.playTime || 0;
    this.fresh = !!m.fresh; // a brand-new game that hasn't been played yet
  }

  liveKeys() {
    const L = ls();
    if (!L) return [];
    const out = [];
    for (let i = 0; i < L.length; i++) {
      const k = L.key(i);
      if (k && k.startsWith(PREFIX) && !GLOBAL_KEYS.has(k)) out.push(k);
    }
    return out;
  }

  clearLive() {
    const L = ls();
    if (!L) return;
    for (const k of this.liveKeys()) L.removeItem(k);
  }

  read(n) {
    const L = ls();
    if (!L) return null;
    try {
      const d = JSON.parse(L.getItem(slotKey(n)) || 'null');
      return d && typeof d === 'object' && d.data ? d : null;
    } catch { return null; }
  }

  list() {
    const out = [];
    for (let n = 1; n <= SLOT_COUNT; n++) {
      const d = this.read(n);
      out.push({ n, empty: !d, meta: d ? d.meta || {} : null, active: n === this.active });
    }
    return out;
  }

  // The slot CONTINUE resumes: the active one, else the most recently played.
  lastSlot() {
    if (this.active) return this.active;
    let best = null;
    for (const s of this.list()) if (!s.empty && (!best || (s.meta.savedAt || 0) > (best.meta.savedAt || 0))) best = s;
    return best ? best.n : null;
  }

  // Existing players (live keys but no slots yet) get their progress adopted into slot 1. Runs once.
  migrate() {
    const L = ls();
    if (!L || L.getItem(INIT_KEY)) return;
    try {
      let any = false;
      for (let n = 1; n <= SLOT_COUNT; n++) if (L.getItem(slotKey(n))) any = true;
      if (!any && L.getItem(MAIN_KEY)) {
        const data = {};
        for (const k of this.liveKeys()) data[k] = L.getItem(k);
        this.write(1, { v: 1, data, meta: { ...liveMeta(data), playTime: 0, savedAt: Date.now() } });
        L.setItem(ACTIVE_KEY, '1');
      }
      L.setItem(INIT_KEY, '1');
    } catch { /* storage unavailable */ }
  }

  write(n, blob) {
    const L = ls();
    if (!L) return false;
    try { L.setItem(slotKey(n), JSON.stringify(blob)); return true; } catch { /* quota */ }
    // too big: highlight photos are the bulk, so drop them from the slot copy and retry
    try {
      const data = { ...blob.data };
      for (const k of Object.keys(data)) if (k.includes('highlights')) delete data[k];
      L.setItem(slotKey(n), JSON.stringify({ ...blob, data }));
      return true;
    } catch { return false; }
  }

  playTime() { return this.playBase + this.sessionPlay; }

  // Copy the live keys into the active slot. `meta` comes from the running game.
  snapshot(meta = {}) {
    if (!this.active || this.switching) return false;
    const L = ls();
    if (!L) return false;
    const data = {};
    for (const k of this.liveKeys()) data[k] = L.getItem(k);
    const base = liveMeta(data);
    return this.write(this.active, { v: 1, data, meta: { ...base, ...meta, playTime: Math.round(this.playTime()), savedAt: Date.now() } });
  }

  // Switch to slot n (fresh = start a new game there) and reload into play.
  activate(n, fresh, beforeMeta) {
    const L = ls();
    if (!L) return;
    if (this.active && this.active !== n) this.snapshot(beforeMeta);
    this.switching = true;
    this.clearLive();
    if (fresh) {
      this.write(n, { v: 1, data: {}, meta: { credits: 250, deliveries: 0, faction: null, playTime: 0, savedAt: Date.now(), fresh: true } });
    } else {
      const d = this.read(n);
      if (d) for (const [k, v] of Object.entries(d.data)) { try { L.setItem(k, v); } catch { /* quota */ } }
    }
    L.setItem(ACTIVE_KEY, String(n));
    const S = ss();
    if (S) S.setItem(AUTOSTART_KEY, '1');
    location.reload();
  }

  // Delete slot n. Deleting the slot in use also wipes the live copy (returns true: reload needed).
  remove(n) {
    const L = ls();
    if (!L) return false;
    L.removeItem(slotKey(n));
    if (n !== this.active) return false;
    this.switching = true;
    this.clearLive();
    L.removeItem(ACTIVE_KEY);
    this.active = null;
    return true;
  }

  // Back to the main menu (no autostart).
  toMenu(meta) {
    this.snapshot(meta);
    this.switching = true;
    const S = ss();
    if (S) S.removeItem(AUTOSTART_KEY);
    location.reload();
  }
}

// Card metadata derived from the saved keys themselves (used when the game isn't running).
function liveMeta(data) {
  const j = (k) => { try { return JSON.parse(data[k] || 'null'); } catch { return null; } };
  const main = j(MAIN_KEY) || {};
  const story = j('moonrunner-story-v1') || {};
  return {
    credits: main.credits ?? 250,
    deliveries: (main.stats && main.stats.deliveries) || 0,
    faction: story.faction || null,
  };
}

export function fmtPlayTime(s) {
  s = Math.max(0, Math.round(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}H ${String(m).padStart(2, '0')}M` : `${m}M ${String(s % 60).padStart(2, '0')}S`;
}

export function fmtDate(t) {
  if (!t) return '—';
  const d = new Date(t);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
