import { MUTATIONS, ITEMS, RECIPES } from './alchemy.js';

// LABNET, Dr. Zbornak's research log (docs/zbornak-proposals/: the console before the drone wall; main.js opens it): four tabs,
// a list and the selected entry in full. SPLICES: the splice pod's mutations (spliced, active, cured); REACTOR: every result the
// reactor gives (singles, pairs, three of a kind, three different, a chimera), each with what went in and what Zbornak said
// the first time; CHIMERAS: yours; PEN: the holding pen. Locked entries show ??? until you unlock them (alchemy.js log: firsts,
// counted by experiment number). Arrows move (left / right the tab, up / down the entry), F or Esc closes, clicks work too.
const TABS = ['SPLICES', 'REACTOR', 'CHIMERAS', 'PEN'];
const NOTES = {
  wheels: 'Wheels, on a person. I regret nothing.', wings: 'Membranous. They itch. Do not scratch them in public.', arms: 'Extra arms. Extra paperwork.',
  void: 'You can see in the dark now. The dark can also see you.', stone: 'You are now 4% granite. Good for you.', claws: 'Mind the floors.',
  blood: 'Pirates think you are family. Do not visit at holidays.', roots: 'Do not stand in one place too long.', psi: 'Stop reading my mind. I can tell.',
  hawk: 'Twenty-twenty at two kilometres. Show-off.',
};
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export class Labnet {
  constructor(game) {
    this.game = game;
    this.tab = 0;
    this.sel = 0;
  }

  open() {
    this.tab = 0;
    this.sel = 0;
    this.paint(false);
  }

  rows() {
    const A = this.game.alchemy, log = A.log || { splices: {}, reactor: {} };
    if (this.tab === 0) return Object.keys(MUTATIONS).map((k) => ({ k, m: MUTATIONS[k], e: log.splices[k], on: A.mutations.includes(k) }));
    if (this.tab === 1) return ['chimera', 'singularity', 'resonance', ...Object.keys(RECIPES).filter((k) => k !== '_default'), '_default'].map((k) => ({ k, e: log.reactor[k] }));
    if (this.tab === 2) return A.chimeras.map((c) => ({ c }));
    return [];
  }

  // a locked reactor entry's hint: a single item names its input, a mix doesn't
  hint(k) {
    if (k === 'chimera') return 'Two different living things';
    if (k === 'singularity') return 'Three different things at once. Don\'t.';
    if (k === 'resonance') return 'Three of one thing';
    if (k === '_default') return 'Anything that does nothing';
    return ITEMS[k] ? `${ITEMS[k].name}, alone` : 'A mix of two things';
  }

  label(r) {
    if (this.tab === 0) return r.e ? r.m.name : '????????';
    if (this.tab === 1) return r.e ? r.e.title : '???';
    return (r.c.name || 'UNNAMED').toUpperCase();
  }

  tag(r) {
    if (this.tab === 0) return r.on ? '<i class="ln-tag on">ACTIVE</i>' : r.e && r.e.cured ? '<i class="ln-tag">CURED</i>' : '';
    if (this.tab === 1) return r.e && r.k === this.lastKey() ? '<i class="ln-tag new">NEW</i>' : r.e ? `<i class="ln-tag">×${r.e.times}</i>` : '';
    return r.c.follow ? '<i class="ln-tag on">WITH YOU</i>' : r.c.career && r.c.career.retired ? '<i class="ln-tag">RETIRED</i>' : '<i class="ln-tag">IN PEN</i>';
  }

  lastKey() {
    const log = this.game.alchemy.log || { reactor: {} };
    let best = null, n = -1;
    for (const [k, e] of Object.entries(log.reactor)) if (e.first > n) { n = e.first; best = k; }
    return best;
  }

  detail(r) {
    const A = this.game.alchemy;
    if (!r) return this.tab === 3
      ? `<h3>HOLDING PEN · ${A.chimeras.length}</h3><p>${A.chimeras.filter((c) => !c.follow).length} in the pen, ${A.chimeras.filter((c) => c.follow).length} with you.</p><p>The pen terminal is in the ranch office, east of the lab: residents, racing, selling.</p>`
      : '<h3>NOTHING HERE YET</h3><p>Two living things in the reactor make a chimera.</p>';
    if (this.tab === 0) {
      if (!r.e) return `<h3>????????</h3><p class="ln-dim">Not yet spliced. Put a jar's worth of something in the splice pod.</p>`;
      const slots = [0, 1, 2].map((i) => `<b class="ln-slot ${A.mutations[i] ? '' : 'e'}">${A.mutations[i] ? MUTATIONS[A.mutations[i]].name.slice(0, 1) : ''}</b>`).join('');
      return `<h3>${esc(r.m.name)}</h3><dl><dt>SOURCE</dt><dd>${r.m.from.map((f) => ITEMS[f].name).join(' / ')} → splice pod</dd><dt>EFFECT</dt><dd>${esc(r.m.desc)}</dd>`
        + `<dt>SPLICED</dt><dd>experiment #${r.e.first}${r.e.times > 1 ? ` · ×${r.e.times}` : ''}</dd><dt>STATUS</dt><dd>${r.on ? 'ACTIVE ON YOU' : r.e.cured ? 'CURED' : 'NOT ACTIVE'}</dd><dt>SLOTS</dt><dd class="ln-slots">${slots}</dd></dl>`
        + `<p class="ln-note">"${esc(NOTES[r.k] || 'Fascinating.')}" — Z.</p>`;
    }
    if (this.tab === 1) {
      if (!r.e) return `<h3>???</h3><dl><dt>INPUT</dt><dd>${esc(this.hint(r.k))}</dd></dl><p class="ln-dim">Not yet thrown in.</p>`;
      return `<h3>${esc(r.e.title)}</h3><dl><dt>INPUT</dt><dd>${esc(r.e.input)}</dd><dt>LOGGED</dt><dd>experiment #${r.e.first}</dd><dt>TIMES</dt><dd>${r.e.times}</dd></dl><p class="ln-note">"${esc(r.e.text)}" — Z.</p>`;
    }
    const c = r.c, st = c.stats || {};
    return `<h3>${esc((c.name || 'UNNAMED').toUpperCase())}</h3><dl><dt>BODY</dt><dd>${c.body} body, ${c.legs} legs, ${c.head} head${c.extraHead ? ` (+ a ${c.extraHead} head)` : ''}</dd>`
      + `<dt>TOUCHED</dt><dd>${(c.mods || []).join(', ') || 'nothing'}</dd><dt>GRADE</dt><dd>${c.tier || '?'} · speed ${st.speed ?? '?'} · power ${st.power ?? '?'} · stamina ${st.stamina ?? '?'} · wit ${st.wit ?? '?'}</dd>`
      + `<dt>WHERE</dt><dd>${c.follow ? 'with you' : 'in the holding pen'}</dd></dl>`;
  }

  paint(stay = true) {
    const g = this.game, rows = this.rows();
    this.sel = Math.max(0, Math.min(this.sel, rows.length - 1));
    const A = g.alchemy, log = A.log || { splices: {}, reactor: {} };
    const counts = [`${Object.keys(log.splices).length}/${Object.keys(MUTATIONS).length}`, `${Object.keys(log.reactor).length}/${rows.length && this.tab === 1 ? rows.length : Object.keys(RECIPES).length + 2}`, `${A.chimeras.length}`, `${A.chimeras.length}`];
    const buttons = [];
    const btn = (b) => { buttons.push(b); return buttons.length - 1; };
    const tabs = TABS.map((t, i) => `<button class="ln-tab ${i === this.tab ? 'on' : ''}" data-i="${btn({ label: t, keep: true, fn: () => { this.tab = i; this.sel = 0; this.paint(); } })}">${t} ${counts[i]}</button>`).join('');
    const list = rows.map((r, i) => `<button class="ln-row ${i === this.sel ? 'sel' : ''} ${(this.tab < 2 && !r.e) ? 'lock' : ''}" data-i="${btn({ label: this.label(r), keep: true, fn: () => { this.sel = i; this.paint(); } })}">${esc(this.label(r))}${this.tag(r)}</button>`).join('');
    const close = btn({ label: 'CLOSE' });
    const last = log.last ? `LAST ENTRY: ${esc(log.last).toUpperCase()}` : 'NO EXPERIMENTS YET';
    const html = `<div class="ln-head"><span>▣ LABNET v3.1 · RESEARCH LOG</span><span>DR. ZBORNAK · TERMINAL 2</span></div>
      <div class="ln-tabs">${tabs}</div>
      <div class="ln-cols"><div class="ln-list">${list || '<p class="ln-dim">—</p>'}</div><div class="ln-det">${this.detail(rows[this.sel])}</div></div>
      <div class="ln-foot"><span>↑↓ SELECT · ←→ TAB · F / ESC CLOSE</span><span>${last}</span><button class="ln-close" data-i="${close}">✕ CLOSE</button></div>`;
    g.dialog('LABNET', html, buttons, { raw: true, cls: 'labnet', stay, onKey: (code) => this.onKey(code) });
  }

  onKey(code) {
    const n = this.rows().length;
    if (code === 'ArrowLeft' || code === 'KeyA') { this.tab = (this.tab + TABS.length - 1) % TABS.length; this.sel = 0; }
    else if (code === 'ArrowRight' || code === 'KeyD') { this.tab = (this.tab + 1) % TABS.length; this.sel = 0; }
    else if (code === 'ArrowUp' || code === 'KeyW') this.sel = Math.max(0, this.sel - 1);
    else if (code === 'ArrowDown' || code === 'KeyS') this.sel = Math.min(Math.max(0, n - 1), this.sel + 1);
    else if (code === 'KeyF') { this.game.pickDialog(this.game.dialogButtons.length - 1); return true; }
    else return false;
    this.paint();
    return true;
  }
}
