// Main menu (title screen) with save slots: CONTINUE / NEW GAME / LOAD GAME / SETTINGS / QUIT.
// Keyboard (arrows or W/S, Enter, Esc, Delete) and mouse. Lives inside the #title overlay;
// the Moon keeps rendering behind it.
import { SLOT_COUNT, fmtPlayTime, fmtDate } from './saves.js';
import { FACTIONS } from './locations.js';

const isElectron = /Electron/i.test(navigator.userAgent);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class MainMenu {
  constructor(game) {
    this.game = game;
    this.saves = game.saves;
    this.el = document.getElementById('title');
    this.body = document.getElementById('mm-body');
    this.ready = false;
    this.screen = this.saves.autostart ? 'autostart' : 'main';
    this.focus = 0;
    this.col = 0;
    this.confirm = null; // { kind: 'overwrite' | 'delete', n }
    this.body.addEventListener('click', (e) => this.onClick(e));
    this.body.addEventListener('mousemove', (e) => {
      const t = e.target.closest('[data-f]');
      if (t && !t.disabled && (+t.dataset.f !== this.focus || +(t.dataset.c || 0) !== this.col)) { this.focus = +t.dataset.f; this.col = +(t.dataset.c || 0); this.paintFocus(); }
    });
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    // after a slot reload, a click anywhere starts (pointer lock needs a user gesture)
    this.el.addEventListener('click', () => { if (this.screen === 'autostart' && this.ready && this.open) this.startNow(); });
    this.render();
  }

  get open() { return !this.el.classList.contains('hidden'); }

  setReady() {
    this.ready = true;
    this.render();
  }

  // ---------- input ----------
  onKey(e) {
    if (!this.open || !this.ready) return;
    const g = this.game;
    if (g.settings && g.settings.open) return;
    const c = e.code;
    if (this.screen === 'autostart') {
      if (c === 'Enter' || c === 'Space' || c === 'NumpadEnter') { e.preventDefault(); e.stopImmediatePropagation(); this.startNow(); }
      return;
    }
    const items = [...this.body.querySelectorAll('[data-f]')].filter((b) => !b.disabled);
    const rows = [...new Set(items.map((b) => +b.dataset.f))].sort((a, b) => a - b);
    let handled = true;
    if (c === 'ArrowDown' || c === 'KeyS') this.move(rows, 1);
    else if (c === 'ArrowUp' || c === 'KeyW') this.move(rows, -1);
    else if (c === 'ArrowRight' || c === 'KeyD') this.setCol(1);
    else if (c === 'ArrowLeft' || c === 'KeyA') this.setCol(0);
    else if (c === 'Enter' || c === 'NumpadEnter' || c === 'Space') { const b = this.current(); if (b) b.click(); }
    else if (c === 'Delete' || c === 'Backspace' || c === 'KeyX') {
      const b = this.body.querySelector(`[data-f="${this.focus}"][data-act="del"]`);
      if (b) b.click();
    } else if (c === 'Escape') this.back();
    else handled = false;
    if (handled) { e.preventDefault(); e.stopImmediatePropagation(); }
  }

  move(rows, d) {
    if (!rows.length) return;
    let i = rows.indexOf(this.focus);
    i = i < 0 ? 0 : (i + d + rows.length) % rows.length;
    this.focus = rows[i];
    this.col = 0;
    this.paintFocus();
    this.blip();
  }

  setCol(c) {
    if (this.body.querySelector(`[data-f="${this.focus}"][data-c="${c}"]:not([disabled])`)) { this.col = c; this.paintFocus(); this.blip(); }
  }

  current() {
    return this.body.querySelector(`[data-f="${this.focus}"][data-c="${this.col}"]:not([disabled])`) || this.body.querySelector(`[data-f="${this.focus}"]:not([disabled])`);
  }

  paintFocus() {
    for (const b of this.body.querySelectorAll('[data-f]')) b.classList.remove('focus');
    const b = this.current();
    if (b) b.classList.add('focus');
  }

  blip() { const a = this.game.audio; if (a && a.ctx && a.tone) a.tone(880, 0.03, 'square', 0.03); }

  back() {
    if (this.confirm) { this.confirm = null; this.render(); return; }
    if (this.screen !== 'main') { this.go('main'); }
  }

  go(screen, focus = 0) {
    this.screen = screen;
    this.confirm = null;
    this.focus = focus;
    this.col = 0;
    this.render();
  }

  onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t || t.disabled || !this.ready) return;
    e.stopPropagation();
    const act = t.dataset.act;
    const n = +t.dataset.n || 0;
    const S = this.saves;
    const g = this.game;
    if (g.audio && g.audio.click) { try { g.audio.click(); } catch { /* audio not started */ } }
    if (act === 'continue') this.choose(S.lastSlot(), false);
    else if (act === 'new') this.go('new', 0);
    else if (act === 'load') this.go('load', 0);
    else if (act === 'settings') g.settings.show('title');
    else if (act === 'quit') window.close();
    else if (act === 'back') this.back();
    else if (act === 'slot') {
      const empty = !S.read(n);
      if (this.screen === 'new') {
        if (empty) this.choose(n, true);
        else { this.confirm = { kind: 'overwrite', n }; this.focus = 0; this.col = 0; this.render(); }
      } else if (!empty) this.choose(n, false);
    } else if (act === 'del') { this.confirm = { kind: 'delete', n }; this.focus = 0; this.col = 0; this.render(); }
    else if (act === 'yes') {
      const c = this.confirm;
      this.confirm = null;
      if (c.kind === 'overwrite') this.choose(c.n, true);
      else if (c.kind === 'delete') {
        if (S.remove(c.n)) { location.reload(); return; }
        if (!this.anySaves()) this.go('main'); else this.render();
      }
    } else if (act === 'no') { const c = this.confirm; this.confirm = null; this.focus = c ? c.n - 1 : 0; this.render(); }
    else if (act === 'start') this.startNow();
  }

  anySaves() { return this.saves.list().some((s) => !s.empty); }

  // Pick a slot. Resuming the slot that's already loaded starts right away; anything else
  // rewrites the live save keys and reloads into it.
  choose(n, fresh) {
    if (!n) return;
    const S = this.saves;
    if (!fresh && n === S.active) { this.startNow(); return; }
    this.body.innerHTML = `<div class="mm-wait">LOADING SLOT ${n}…</div>`;
    S.activate(n, fresh, this.game.slotMeta());
  }

  startNow() {
    this.el.classList.add('hidden');
    this.game.startPlay();
  }

  // ---------- rendering ----------
  card(s, f) {
    const m = s.meta || {};
    const fac = m.faction && FACTIONS[m.faction];
    const canPick = this.screen === 'new' || !s.empty;
    const head = `<span class="sv-n">SLOT ${s.n}</span>${s.active ? '<span class="sv-tag">CURRENT</span>' : ''}`;
    const inner = s.empty
      ? `<div class="sv-head">${head}</div><div class="sv-empty">EMPTY</div>`
      : `<div class="sv-head">${head}<span class="sv-cred">₵${(m.credits ?? 0).toLocaleString('en-US')}</span></div>
         <div class="sv-grid">
           <span>DELIVERIES</span><b>${m.deliveries || 0}</b>
           <span>FACTION</span><b style="${fac ? `color:${fac.color}` : ''}">${fac ? esc(fac.name.toUpperCase()) : '—'}</b>
           <span>PLAY TIME</span><b>${fmtPlayTime(m.playTime)}</b>
           <span>LAST PLAYED</span><b>${fmtDate(m.savedAt)}</b>
         </div>`;
    const del = s.empty ? '' : `<button class="sv-del" data-act="del" data-n="${s.n}" data-f="${f}" data-c="1" title="Delete slot ${s.n}">DELETE</button>`;
    return `<div class="sv-row"><button class="sv-card ${s.empty ? 'is-empty' : ''}" data-act="slot" data-n="${s.n}" data-f="${f}" data-c="0" ${canPick ? '' : 'disabled'}>${inner}</button>${del}</div>`;
  }

  render() {
    const S = this.saves;
    let html = '';
    if (this.screen === 'autostart') {
      const s = S.list().find((x) => x.n === S.active);
      const m = (s && s.meta) || {};
      html = this.ready
        ? `<button class="mm-start" data-act="start" data-f="0" data-c="0">
             <span class="mm-start-big">CLICK TO START</span>
             <span class="mm-start-sub">SLOT ${S.active} · ${m.fresh ? 'NEW GAME' : `₵${(m.credits ?? 0).toLocaleString('en-US')} · ${m.deliveries || 0} DELIVERIES`}</span>
           </button>`
        : `<div class="mm-wait">LOADING SLOT ${S.active}…</div>`;
    } else if (this.confirm) {
      const c = this.confirm;
      const txt = c.kind === 'delete'
        ? `DELETE SLOT ${c.n}?<small>This wipes that save for good: credits, upgrades, reputation, story, map, chimeras and highlights.</small>`
        : `OVERWRITE SLOT ${c.n}?<small>The save in this slot will be replaced by a brand-new game.</small>`;
      html = `<div class="mm-confirm"><div class="mm-q">${txt}</div>
        <div class="mm-yn"><button class="mm-item danger" data-act="yes" data-f="0" data-c="0">YES, ${c.kind === 'delete' ? 'DELETE' : 'OVERWRITE'}</button>
        <button class="mm-item" data-act="no" data-f="1" data-c="0">NO, GO BACK</button></div></div>`;
    } else if (this.screen === 'main') {
      const last = S.lastSlot();
      const any = this.anySaves();
      const items = [];
      if (last) items.push(['continue', `CONTINUE`, `SLOT ${last}`]);
      items.push(['new', 'NEW GAME', '']);
      items.push(['load', 'LOAD GAME', '', !any]);
      items.push(['settings', 'SETTINGS', '']);
      if (isElectron) items.push(['quit', 'QUIT', '']);
      html = `<nav class="mm-list">${items.map(([act, label, sub, dis], i) => `<button class="mm-item" data-act="${act}" data-f="${i}" data-c="0" ${dis || !this.ready ? 'disabled' : ''}><span class="mm-caret">&gt;</span>${label}${sub ? `<small>${sub}</small>` : ''}</button>`).join('')}</nav>`;
    } else {
      const title = this.screen === 'new' ? 'NEW GAME · CHOOSE A SLOT' : 'LOAD GAME';
      const slots = S.list();
      html = `<div class="mm-sub">${title}</div><div class="sv-list">${slots.map((s, i) => this.card(s, i)).join('')}</div>
        <button class="mm-item mm-back" data-act="back" data-f="${SLOT_COUNT}" data-c="0"><span class="mm-caret">&lt;</span>BACK</button>`;
    }
    this.body.innerHTML = html;
    // land focus on something selectable
    const sel = [...this.body.querySelectorAll('[data-f]')].filter((b) => !b.disabled);
    if (sel.length && !sel.some((b) => +b.dataset.f === this.focus)) { this.focus = +sel[0].dataset.f; this.col = 0; }
    this.paintFocus();
    const hint = document.getElementById('mm-hint');
    if (hint) {
      hint.textContent = this.screen === 'autostart' ? 'CLICK OR PRESS ENTER'
        : this.screen === 'main' && !this.confirm ? 'UP/DOWN SELECT · ENTER CONFIRM'
          : 'UP/DOWN SELECT · RIGHT: DELETE · ENTER CONFIRM · ESC BACK';
    }
  }
}
