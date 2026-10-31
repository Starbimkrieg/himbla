// Main menu (title screen) with save slots: CONTINUE / NEW GAME / LOAD GAME / SETTINGS / QUIT.
// Keyboard (arrows or W/S, Enter, Esc, Delete) and mouse. Lives in #title; the Moon renders behind it.
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
    if (this.game.settings && this.game.settings.open) return;
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
    else if (c === 'ArrowRight' || c === 'KeyD') this.setCol(this.col + 1);
    else if (c === 'ArrowLeft' || c === 'KeyA') this.setCol(Math.max(0, this.col - 1));
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
    if (this.screen !== 'main') this.go('main');
  }

  ask(kind, n) { this.confirm = { kind, n }; this.focus = 0; this.col = 0; this.render(); }

  go(screen, focus = 0) {
    this.note = null;
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
    else if (act === 'new' || act === 'load') this.go(act);
    else if (act === 'settings') g.settings.show('title');
    else if (act === 'quit') window.close();
    else if (act === 'back') this.back();
    else if (act === 'slot') {
      const empty = !S.read(n);
      if (this.screen === 'new') {
        if (empty) this.choose(n, true);
        else this.ask('overwrite', n);
      } else if (!empty) this.choose(n, false);
    } else if (act === 'del') this.ask('delete', n);
    else if (act === 'export') this.exportSlot(n);
    else if (act === 'import') {
      if (S.read(n) || S.damaged(n)) this.ask('import', n); else this.pickFile(n);
    } else if (act === 'restore') this.ask('restore', n);
    else if (act === 'yes') {
      const c = this.confirm;
      this.confirm = null;
      if (c.kind === 'overwrite') this.choose(c.n, true);
      else if (c.kind === 'import') { this.pickFile(c.n); this.render(); }
      else if (c.kind === 'restore') {
        this.note = S.restore(c.n) ? `SLOT ${c.n} RESTORED FROM ITS BACKUP` : 'COULDN\'T RESTORE THAT BACKUP';
        this.render();
      }
      else if (c.kind === 'delete') {
        if (S.remove(c.n)) { location.reload(); return; }
        if (!this.anySaves()) this.go('main'); else this.render();
      }
    } else if (act === 'no') { const c = this.confirm; this.confirm = null; this.focus = c ? c.n - 1 : 0; this.render(); }
    else if (act === 'start') this.startNow();
  }

  anySaves() { return this.saves.list().some((s) => !s.empty || s.damaged); }

  // ---------- save files ----------
  exportSlot(n) {
    const text = this.saves.exportText(n);
    if (!text) return;
    const stamp = fmtDate(Date.now()).slice(0, 10); // YYYY-MM-DD
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = `moon-runner-slot${n}-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    this.note = `SLOT ${n} EXPORTED · ${a.download}`;
    this.render();
  }

  pickFile(n) {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      f.text().then((text) => {
        const err = this.saves.importText(n, text);
        this.note = err ? err.toUpperCase() : `IMPORTED INTO SLOT ${n}`;
        this.render();
      });
    });
    inp.click();
  }

  // Pick a slot: the loaded one starts right away; any other rewrites the live save keys and reloads.
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
    const card = s.damaged
      ? `<div class="sv-head">${head}</div><div class="sv-empty sv-bad">DAMAGED${s.hasBackup ? ' · RESTORE THE BACKUP →' : ''}</div>`
      : s.empty ? `<div class="sv-head">${head}</div><div class="sv-empty">EMPTY</div>`
      : `<div class="sv-head">${head}<span class="sv-cred">₵${(m.credits ?? 0).toLocaleString('en-US')}</span></div>
         <div class="sv-grid">
           <span>DELIVERIES</span><b>${m.deliveries || 0}</b>
           <span>FACTION</span><b style="${fac ? `color:${fac.color}` : ''}">${fac ? esc(fac.name.toUpperCase()) : '—'}</b>
           <span>PLAY TIME</span><b>${fmtPlayTime(m.playTime)}</b>
           <span>LAST PLAYED</span><b>${fmtDate(m.savedAt)}</b>
         </div>`;
    // slot tools: LOAD GAME has export / import / restore backup / delete; NEW GAME has delete
    const tools = [];
    const btn = (act, label, title, cls = '') => tools.push(`<button class="sv-tool ${cls}" data-act="${act}" data-n="${s.n}" data-f="${f}" data-c="${tools.length + 1}" title="${title}">${label}</button>`);
    if (this.screen === 'load') {
      if (!s.empty) btn('export', 'EXPORT', `Save slot ${s.n} to a file`);
      btn('import', 'IMPORT', `Load a save file into slot ${s.n}`);
      if (s.hasBackup) btn('restore', 'RESTORE', `Put back slot ${s.n} as it was when you last stopped playing`, s.damaged ? 'warn' : '');
    }
    if (!s.empty || s.damaged) btn('del', 'DELETE', `Delete slot ${s.n}`, 'danger');
    return `<div class="sv-row"><button class="sv-card ${s.empty ? 'is-empty' : ''}" data-act="slot" data-n="${s.n}" data-f="${f}" data-c="0" ${canPick && !s.damaged ? '' : 'disabled'}>${card}</button>${tools.length ? `<div class="sv-tools">${tools.join('')}</div>` : ''}</div>`;
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
      const b = S.backup(c.n);
      const txt = {
        delete: `DELETE SLOT ${c.n}?<small>This wipes that save for good, and its backup: credits, upgrades, reputation, story, map and chimeras.</small>`,
        overwrite: `OVERWRITE SLOT ${c.n}?<small>The save in this slot will be replaced by a brand-new game.</small>`,
        import: `IMPORT INTO SLOT ${c.n}?<small>The save in this slot will be replaced by the file you pick. (Its old contents stay as the slot's backup.)</small>`,
        restore: `RESTORE SLOT ${c.n}?<small>Puts back the save as it was when you last stopped playing${b && b.meta ? ` (₵${(b.meta.credits ?? 0).toLocaleString('en-US')}, ${fmtPlayTime(b.meta.playTime)} played, ${fmtDate(b.meta.savedAt)})` : ''}. What's in the slot now is lost.</small>`,
      }[c.kind];
      const yes = { delete: 'DELETE', overwrite: 'OVERWRITE', import: 'PICK A FILE', restore: 'RESTORE' }[c.kind];
      html = `<div class="mm-confirm"><div class="mm-q">${txt}</div>
        <div class="mm-yn"><button class="mm-item ${c.kind === 'delete' || c.kind === 'overwrite' ? 'danger' : ''}" data-act="yes" data-f="0" data-c="0">YES, ${yes}</button>
        <button class="mm-item" data-act="no" data-f="1" data-c="0">NO, GO BACK</button></div></div>`;
    } else if (this.screen === 'main') {
      const last = S.lastSlot();
      const items = [];
      if (last) items.push(['continue', `CONTINUE`, `SLOT ${last}`]);
      items.push(['new', 'NEW GAME', ''], ['load', 'LOAD GAME', this.anySaves() ? '' : 'IMPORT A SAVE'], ['settings', 'SETTINGS', '']);
      if (isElectron) items.push(['quit', 'QUIT', '']);
      html = `<nav class="mm-list">${items.map(([act, label, sub], i) => `<button class="mm-item" data-act="${act}" data-f="${i}" data-c="0" ${this.ready ? '' : 'disabled'}><span class="mm-caret">&gt;</span>${label}${sub ? `<small>${sub}</small>` : ''}</button>`).join('')}</nav>`;
    } else {
      const title = this.screen === 'new' ? 'NEW GAME · CHOOSE A SLOT' : 'LOAD GAME';
      html = `<div class="mm-sub">${title}</div>${this.note ? `<div class="mm-note">${esc(this.note)}</div>` : ''}<div class="sv-list">${S.list().map((s, i) => this.card(s, i)).join('')}</div>
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
          : this.screen === 'load' && !this.confirm ? 'UP/DOWN SLOT · LEFT/RIGHT: EXPORT · IMPORT · RESTORE · DELETE · ESC BACK'
            : 'UP/DOWN SELECT · RIGHT: DELETE · ENTER CONFIRM · ESC BACK';
    }
  }
}
