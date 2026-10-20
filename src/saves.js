// Save slots.
//
// Each module persists under its own 'moonrunner-*' localStorage key (the live copy) and reads it in its constructor.
// A slot is one JSON blob ('mr-slot-N'): a copy of every live per-slot key plus menu-card metadata.
//
//   choosing a slot   -> clear live keys, copy the slot's keys in, reload
//   while playing     -> snapshot live keys into the active slot (timer, deliveries, unload…)
//
// Settings ('moonrunner-settings-v1') are global and never touched here.
//
// The first write to a slot each session keeps its previous contents as 'mr-slot-N-bak', so a damaged slot can be
// restored. Slots can also be exported to a file and imported.

export const SLOT_COUNT = 3;
const PREFIX = 'moonrunner-';
const GLOBAL_KEYS = new Set(['moonrunner-settings-v1']);
const MAIN_KEY = 'moonrunner-save-v1';
const ACTIVE_KEY = 'mr-active-slot';
const INIT_KEY = 'mr-slots-init';
const AUTOSTART_KEY = 'mr-autostart'; // sessionStorage: straight into play after reload
const slotKey = (n) => `mr-slot-${n}`;
const bakKey = (n) => `mr-slot-${n}-bak`;
const FILE_FORMAT = 'moon-runner-save';

const ls = () => { try { return window.localStorage; } catch { return null; } };
const ss = () => { try { return window.sessionStorage; } catch { return null; } };

export class SaveSlots {
  constructor() {
    const L = ls();
    this.switching = false; // rewriting live keys + reloading: suppresses unload snapshots
    this.sessionPlay = 0; // seconds played this page load
    this.backedUp = new Set(); // slots backed up this session
    this.migrate();
    const a = L ? parseInt(L.getItem(ACTIVE_KEY), 10) : NaN;
    this.active = a >= 1 && a <= SLOT_COUNT && this.read(a) ? a : null;
    if (!this.active) {
      // no slot in use: the menu's background world starts clean
      if (L) L.removeItem(ACTIVE_KEY);
      this.clearLive();
    }
    const S = ss();
    this.autostart = !!(S && S.getItem(AUTOSTART_KEY) && this.active);
    if (S) S.removeItem(AUTOSTART_KEY);
    const m = this.active ? this.read(this.active).meta || {} : {};
    this.playBase = m.playTime || 0;
    this.fresh = !!m.fresh; // new game, not yet played
  }

  // the live per-slot keys and their values
  liveData() {
    const L = ls(), out = {};
    if (L) for (let i = 0; i < L.length; i++) {
      const k = L.key(i);
      if (k && k.startsWith(PREFIX) && !GLOBAL_KEYS.has(k)) out[k] = L.getItem(k);
    }
    return out;
  }

  clearLive() {
    const L = ls();
    for (const k of Object.keys(this.liveData())) L.removeItem(k);
  }

  read(n) { return this.readKey(slotKey(n)); }

  readKey(key) {
    const L = ls();
    if (!L) return null;
    try {
      const d = JSON.parse(L.getItem(key) || 'null');
      return d && typeof d === 'object' && d.data && typeof d.data === 'object' ? d : null;
    } catch { return null; }
  }

  // the slot's backup (as before this session wrote it), or null
  backup(n) { return this.readKey(bakKey(n)); }

  // stored but unreadable
  damaged(n) {
    const L = ls();
    return !!(L && L.getItem(slotKey(n)) && !this.read(n));
  }

  // Restore the backup (the active slot reloads into it).
  restore(n) {
    const b = this.backup(n);
    if (!b || !this.write(n, b, { noBackup: true })) return false;
    if (n === this.active) this.activate(n, false);
    return true;
  }

  // The slot as a file: { format, version, slot data }.
  exportText(n) {
    const d = this.read(n);
    return d ? JSON.stringify({ format: FILE_FORMAT, v: 1, exportedAt: Date.now(), save: d }) : null;
  }

  // Import a save file into slot n. Returns an error message, or null on success (the active slot reloads).
  importText(n, text) {
    let f;
    try { f = JSON.parse(text); } catch { return 'That file isn\'t a Moon-Runner save.'; }
    const d = f && f.format === FILE_FORMAT ? f.save : f && f.data ? f : null; // a bare slot blob works too
    if (!d || typeof d.data !== 'object') return 'That file isn\'t a Moon-Runner save.';
    for (const [k, v] of Object.entries(d.data)) if (!k.startsWith(PREFIX) || typeof v !== 'string') return 'That save file is damaged.';
    if (!this.write(n, { v: d.v || 1, data: d.data, meta: { ...(d.meta || {}), savedAt: Date.now() } }, { forceBackup: true })) return 'There isn\'t room to store that save.';
    if (n === this.active) this.activate(n, false);
    return null;
  }

  list() {
    const out = [];
    for (let n = 1; n <= SLOT_COUNT; n++) {
      const d = this.read(n);
      out.push({ n, empty: !d, damaged: this.damaged(n), hasBackup: !!this.backup(n), meta: d ? d.meta || {} : null, active: n === this.active });
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

  // Live keys but no slots yet: adopt that progress into slot 1. Runs once.
  migrate() {
    const L = ls();
    if (!L || L.getItem(INIT_KEY)) return;
    try {
      let any = false;
      for (let n = 1; n <= SLOT_COUNT; n++) if (L.getItem(slotKey(n))) any = true;
      if (!any && L.getItem(MAIN_KEY)) {
        const data = this.liveData();
        this.write(1, { v: 1, data, meta: { ...liveMeta(data), playTime: 0, savedAt: Date.now() } });
        L.setItem(ACTIVE_KEY, '1');
      }
      L.setItem(INIT_KEY, '1');
    } catch { /* storage unavailable */ }
  }

  write(n, blob, { noBackup = false, forceBackup = false } = {}) {
    const L = ls();
    if (!L) return false;
    // first write this session: keep the old contents (if readable) as the backup
    if (!noBackup && (forceBackup || !this.backedUp.has(n))) {
      this.backedUp.add(n);
      const old = L.getItem(slotKey(n));
      if (old && this.read(n)) { try { L.setItem(bakKey(n), old); } catch { /* no room: keep going */ } }
    }
    try { L.setItem(slotKey(n), JSON.stringify(blob)); return true; } catch { return false; /* quota */ }
  }

  playTime() { return this.playBase + this.sessionPlay; }

  // Copy the live keys into the active slot. `meta` comes from the running game.
  snapshot(meta = {}) {
    if (!this.active || this.switching) return false;
    const data = this.liveData(); // (no storage: write() says false)
    return this.write(this.active, { v: 1, data, meta: { ...liveMeta(data), ...meta, playTime: Math.round(this.playTime()), savedAt: Date.now() } });
  }

  // Switch to slot n (fresh = start a new game there) and reload into play.
  activate(n, fresh, beforeMeta) {
    const L = ls();
    if (!L) return;
    if (this.active && this.active !== n) this.snapshot(beforeMeta);
    this.switching = true;
    this.clearLive();
    if (fresh) {
      this.write(n, { v: 1, data: {}, meta: { credits: 250, deliveries: 0, faction: null, playTime: 0, savedAt: Date.now(), fresh: true } }, { forceBackup: true });
    } else {
      const d = this.read(n);
      if (d) for (const [k, v] of Object.entries(d.data)) { try { L.setItem(k, v); } catch { /* quota */ } }
    }
    L.setItem(ACTIVE_KEY, String(n));
    const S = ss();
    if (S) S.setItem(AUTOSTART_KEY, '1');
    location.reload();
  }

  // Delete slot n. Deleting the active slot also wipes the live copy (returns true: reload needed).
  remove(n) {
    const L = ls();
    if (!L) return false;
    L.removeItem(slotKey(n));
    L.removeItem(bakKey(n));
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

// Card metadata from the saved keys (when the game isn't running).
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
