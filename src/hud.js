import * as THREE from 'three';
import { glyphHtml } from './glyphs.js';
import { keepScroll } from './terminalUI.js';
import { NAME_TAGS } from './toon.js';
import { FACTIONS, TIERS } from './locations.js';
import { KIND_INFO } from './missions.js';
import { arcDist, darkness, upAt, E1, E2 } from './geo.js';
import { WEAPONS, APC_CANNON } from './weapons.js';
import { EVENT_RANGE, PLANET } from './config.js';
import { pixelFont } from './fonts.js';
import { mulberry32 } from './rng.js';

const $ = (id) => document.getElementById(id);
// per-frame lookups: HUD elements are static, so each is found once
const $els = {};
const $c = (id) => $els[id] || ($els[id] = document.getElementById(id));
const MM_CURVE_N = 720; // samples per minimap great circle (~30 m apart)
const MM_RANGE = 700; // m, minimap centre to edge when standing still

export class HUD {
  constructor(game) {
    this.game = game;
    this.speedCanvas = $('speedo-dial');
    this.sctx = this.speedCanvas.getContext('2d');
    this.mini = $('minimap');
    this.mctx = this.mini.getContext('2d');
    this.alertT = 0;
    this.toastT = 0;
    this.grabT = 0;
    this.bannerT = 0;
    this.v = new THREE.Vector3();
    this.lastSpeedTxt = '';
    this.buildCracks();
  }

  // Cracked visor: cracks spread over the screen (above the HUD) as hull drops. Five impacts, each a star of jagged
  // rays with branches; each starts at its hull level and grows over the next ~10%. Geometry is built once and painted
  // onto one canvas, repainted only per whole percent of hull (a composited canvas is free per frame; live SVG paths
  // under a CSS filter are not).
  buildCracks() {
    const W = 1280, H = 720, K = W / 160; // 16:9 canvas, cover-fitted; points in a 160 x 90 box
    const cv = document.createElement('canvas');
    cv.id = 'cracks';
    cv.width = W; cv.height = H;
    const rnd = mulberry32(7731);
    const IMPACTS = [[128, 22, 0.72], [24, 70, 0.58], [100, 78, 0.44], [34, 20, 0.3], [80, 46, 0.16]]; // x, y, starting hull fraction
    this.cracks = [];
    const mk = (pts, w, thr) => {
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      this.cracks.push({ pts, cum, total: cum[cum.length - 1], w, thr });
    };
    // jagged line from (x, y) heading `a`, `n` segments; returns its points
    const walk = (x, y, a, n, seg) => {
      const pts = [[x, y]];
      for (let i = 0; i < n; i++) {
        a += (rnd() - 0.5) * 0.7;
        const s = seg * (0.6 + rnd() * 0.8);
        x += Math.cos(a) * s; y += Math.sin(a) * s;
        pts.push([x, y]);
      }
      return pts;
    };
    for (const [cx, cy, thr] of IMPACTS) {
      const rays = 6 + Math.floor(rnd() * 3);
      const a0 = rnd() * Math.PI * 2;
      for (let r = 0; r < rays; r++) {
        const a = a0 + (r / rays) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
        const pts = walk(cx, cy, a, 5 + Math.floor(rnd() * 4), 5 + rnd() * 3);
        const t = thr - rnd() * 0.05; // stagger the rays
        mk(pts, 0.3, t);
        // a branch or two off the ray
        for (let b = 0; b < 2; b++) {
          if (rnd() < 0.35) continue;
          const i = 1 + Math.floor(rnd() * (pts.length - 2));
          const from = pts[i];
          const ba = a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6);
          mk(walk(from[0], from[1], ba, 2 + Math.floor(rnd() * 3), 3 + rnd() * 2), 0.17, t - 0.03);
        }
      }
      // hairline rings round the impact
      for (let k = 0; k < 2; k++) {
        const rad = 3.5 + k * 4.5;
        const pts = [];
        const n = 7 + k * 3;
        for (let i = 0; i <= n; i++) {
          const a = a0 + (i / n) * Math.PI * 1.7 + k;
          const rr = rad * (0.85 + rnd() * 0.3);
          pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
        }
        mk(pts, 0.14, thr - 0.04 - k * 0.03);
      }
    }
    this.crackCtx = cv.getContext('2d');
    this.crackK = K;
    cv.style.display = 'none';
    $('hud').appendChild(cv);
    this.crackEl = cv;
    this.crackKey = -1;
  }

  // paint cracks for hull fraction 0-1: each grows to full length over the 10% of hull below its threshold
  paintCracks(frac) {
    const ctx = this.crackCtx, K = this.crackK;
    ctx.clearRect(0, 0, 1280, 720);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const strokes = [];
    for (const c of this.cracks) {
      const p = Math.max(0, Math.min(1, (c.thr - frac) / 0.1));
      if (p > 0) strokes.push([c, p * c.total]);
    }
    const trace = (c, len) => {
      ctx.beginPath();
      ctx.moveTo(c.pts[0][0] * K, c.pts[0][1] * K);
      for (let i = 1; i < c.pts.length; i++) {
        if (c.cum[i] <= len) { ctx.lineTo(c.pts[i][0] * K, c.pts[i][1] * K); continue; }
        const f = (len - c.cum[i - 1]) / (c.cum[i] - c.cum[i - 1]); // partway along the segment reached
        ctx.lineTo((c.pts[i - 1][0] + (c.pts[i][0] - c.pts[i - 1][0]) * f) * K, (c.pts[i - 1][1] + (c.pts[i][1] - c.pts[i - 1][1]) * f) * K);
        break;
      }
    };
    // dark under-stroke, then the bright line (cheaper than a blurred shadow)
    ctx.strokeStyle = 'rgba(5, 3, 12, 0.7)';
    for (const [c, len] of strokes) { ctx.lineWidth = c.w * K + 2; trace(c, len); ctx.stroke(); }
    ctx.strokeStyle = '#e8f4ff';
    for (const [c, len] of strokes) { ctx.lineWidth = c.w * K; trace(c, len); ctx.stroke(); }
    return strokes.length > 0;
  }

  // hull fraction 0-1
  updateCracks(frac) {
    const off = this.game.cheats && !this.game.cheats.crackedVisor; // dev menu: DISPLAY & DEBUG
    const key = off ? -2 : Math.round(frac * 100); // repaint at most once per percent
    if (key === this.crackKey) return;
    this.crackKey = key;
    if (off) { this.crackEl.style.display = 'none'; return; }
    const any = this.paintCracks(frac);
    this.crackEl.style.display = any ? '' : 'none'; // nothing to composite while healthy
    this.crackEl.style.opacity = String(0.6 + 0.4 * (1 - frac));
  }

  show(id, on = true) { $(id).classList.toggle('hidden', !on); }

  // Distress log: open events (and the active one) stacked above the speedo, newest on top, each with an arrow
  // pointing to it relative to your view.
  distressLog(dt) {
    const g = this.game;
    if (!g.events) return;
    if (!this.logEl) {
      this.logEl = document.createElement('div');
      this.logEl.id = 'distresslog';
      $('speedo').appendChild(this.logEl); // child of the speedo so CSS keeps it above
      this.logRows = new Map();
      this.logT = 0;
    }
    this.logT -= dt;
    const P = g.player, up = P.up, cam = g.cam;
    // rows and text refresh at 10 Hz; arrows turn every frame so they track smoothly
    if (this.logT <= 0) {
      this.logT = 0.1;
      // open events beyond EVENT_RANGE are left off; the active one always shows
      const evs = g.events.list.filter((e) => e.state === 'active' || (e.state === 'open' && this.logTarget(e).distanceTo(P.pos) <= EVENT_RANGE));
      this.logEl.classList.toggle('hidden', !evs.length || g.state === 'title');
      const seen = new Set();
      for (const ev of evs) {
        seen.add(ev.id);
        let row = this.logRows.get(ev.id);
        if (!row) {
          row = document.createElement('div');
          row.className = 'dl-row dl-new';
          row.innerHTML = '<svg class="dl-arrow" viewBox="-10 -10 20 20"><path class="dl-shaft" d="M0 8V-1"/><path class="dl-tip" d="M0 -9.5L6.5 0H-6.5Z"/></svg><span class="dl-name"></span><span class="dl-dist"></span>';
          row.arrow = row.querySelector('.dl-arrow');
          this.logEl.prepend(row);
          this.logRows.set(ev.id, row);
          setTimeout(() => row.classList.remove('dl-new'), 1200);
        }
        row.ev = ev;
        const col = (FACTIONS[ev.faction] && FACTIONS[ev.faction].color) || '#ffffff';
        row.style.setProperty('--c', col);
        row.classList.toggle('dl-active', ev.state === 'active');
        const left = g.events.timeLeft(ev);
        row.classList.toggle('dl-expiring', left !== null && left <= 30); // about to expire: slow flash
        row.querySelector('.dl-name').textContent = `${ev.icon || ''}${ev.short || ev.title}`.toUpperCase();
        const dist = this.logTarget(ev).distanceTo(P.pos);
        row.querySelector('.dl-dist').textContent = dist > 999 ? `${(dist / 1000).toFixed(1)}KM` : `${Math.round(dist / 10) * 10}M`;
      }
      for (const [id, row] of this.logRows) if (!seen.has(id)) { row.remove(); this.logRows.delete(id); }
    }
    for (const row of this.logRows.values()) {
      const v = this.v.copy(this.logTarget(row.ev)).sub(P.pos);
      v.addScaledVector(up, -v.dot(up));
      const ang = Math.atan2(v.dot(cam.right), v.dot(cam.fwd));
      const t = `rotate(${ang.toFixed(3)}rad)`;
      if (row.lastT !== t) { row.lastT = t; row.arrow.style.transform = t; }
    }
  }

  logTarget(ev) {
    const g = this.game;
    const obj = ev.state === 'active' && g.events.objective();
    return obj ? obj.pos : ev.stage || ev.start;
  }

  alert(text, color = '#ff2a4a', dur = 2.5) {
    const el = $('alert');
    el.textContent = text;
    el.style.background = color;
    el.classList.remove('hidden');
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
    this.alertT = dur;
  }

  // hold-to-act bar (k: 0..1; 0 hides): the recall shuttle, or `label` for other holds (emptying the jar)
  recallHold(k, loc, label) {
    if (!this.recallEl) {
      this.recallEl = document.createElement('div');
      this.recallEl.id = 'recallhold';
      this.recallEl.innerHTML = '<div class="hb-label"></div><div class="hb-track"><div class="hb-fill"></div></div>';
      document.getElementById('holdbars').appendChild(this.recallEl); // bottom-centre bar stack
    }
    this.recallEl.classList.toggle('show', k > 0);
    if (k <= 0) return;
    if (label) this.recallEl.querySelector('.hb-label').textContent = label;
    else if (loc) this.recallEl.querySelector('.hb-label').textContent = `HOLD R · RECALL TO ${loc.short || loc.name.toUpperCase()} · 100 CR`;
    this.recallEl.querySelector('.hb-fill').style.width = `${Math.min(1, k) * 100}%`;
  }

  toast(text, dur = 2.5, html = false) {
    const el = $('toast');
    if (html) el.innerHTML = text; else el.textContent = text; // html: caller escaped it or built it with glyphHtml
    el.classList.remove('hidden');
    this.toastT = dur;
  }

  prompt(text) {
    const el = $('prompt');
    if (!text) { el.classList.add('hidden'); return; }
    el.innerHTML = text; // key names become pad buttons (glyphs.js)
    el.classList.remove('hidden');
  }

  grab(p) {
    const el = $('grab');
    el.classList.remove('hidden');
    $('grab-fill').style.width = p * 100 + '%';
    this.grabT = 0.3;
  }

  banner(loc) {
    const el = $('banner');
    const f = FACTIONS[loc.faction];
    const kind = { trade: 'TRADE HUB', lab: 'STRANGE PLACE — RESEARCH', monolith: 'STRANGE PLACE', tunnel: 'STRANGE PLACE — ???', derby: 'STRANGE PLACE — RACECOURSE', casino: 'STRANGE PLACE — CASINO', hub: 'INTERNATIONAL HUB', civilian: 'CIVILIAN HABITAT', research: 'RESEARCH FACILITY', military: 'MILITARY — RESTRICTED', industrial: 'INDUSTRIAL OUTPOST', pirate: 'PIRATE TERRITORY', hometown: 'YOUR TOWN', ruin: 'RUINS' }[loc.type]; // every loc.type needs an entry here, or the chip reads "undefined"
    el.innerHTML = `<div class="b-kind" style="background:${f.color}">${kind}</div><div class="b-name">${loc.name}</div><div class="b-blurb">${loc.blurb}</div>`;
    el.classList.remove('hidden');
    el.classList.remove('slam'); void el.offsetWidth; el.classList.add('slam');
    this.bannerT = 4;
  }

  // New-event pop-up: slides in from the right under the territory chip, holds 3 s, slides out. Queued, one at a time.
  eventPopup(text, color = '#ffd23f') {
    if (!this.evQ) this.evQ = [];
    this.evQ.push({ text, color });
  }

  updateEventPopup(dt) {
    const el = $('evpop');
    if (!el) return;
    if (!this.evCur) {
      if (!this.evQ || !this.evQ.length) return;
      this.evCur = this.evQ.shift();
      this.evT = 0;
      el.textContent = this.evCur.text;
      el.style.setProperty('--c', this.evCur.color);
      el.className = 'pre'; // parked off the right edge, no transition
      el.classList.remove('hidden');
      void el.offsetWidth;
      el.className = 'in';
    }
    this.evT += dt;
    if (this.evT >= 0.45 + 3 && el.className === 'in') el.className = 'out';
    if (this.evT >= 0.45 + 3 + 0.5) { el.className = 'hidden'; this.evCur = null; }
  }

  delivered(info) {
    const el = $('result');
    el.className = 'panel result win';
    el.innerHTML = `
      <div class="r-title">${info.a.kind === 'bounty' ? 'BOUNTY CLAIMED!' : 'DELIVERED!'}</div>
      <div class="r-sub">${info.a.kind === 'bounty' ? `${info.a.bounty.n} pirates down` : `${info.a.cargo.name} → ${info.a.to.name}`}</div>
      <table>
        <tr><td>Contract</td><td>₵${info.integ}</td></tr>
        <tr><td>${info.late ? 'Late — half pay' : 'Speed bonus'}</td><td>₵${info.timeBonus}</td></tr>
        <tr><td>Style${info.styleCapped ? ' (MAX ×2)' : ''}</td><td>₵${info.style}</td></tr>
        ${info.note ? `<tr><td>Showpiece</td><td>${info.note}</td></tr>` : ''}
        <tr><td>${info.a.kind === 'bounty' ? 'Condition' : 'Package condition'}</td><td>×${info.condition.toFixed(2)}</td></tr>
        <tr class="tot"><td>TOTAL</td><td>₵${info.total}</td></tr>
      </table>
      <div class="r-rep">+${info.repGain} rep with ${info.faction}</div>`;
    this.resultT = 5;
  }

  failed(reason) {
    const el = $('result');
    el.className = 'panel result lose';
    el.innerHTML = `<div class="r-title">CONTRACT FAILED</div><div class="r-sub">${reason}</div>`;
    this.resultT = 4;
  }

  // One panel listing everything failed at once (emergency recall), held `dur` s to last through the cutscene.
  // Rows are text, not markup.
  failedList(title, lines, dur = 8) {
    const el = $('result');
    el.className = 'panel result lose';
    el.replaceChildren();
    const t = document.createElement('div');
    t.className = 'r-title';
    t.textContent = title;
    el.appendChild(t);
    for (const l of lines) {
      const r = document.createElement('div');
      r.className = 'r-sub r-fail';
      r.textContent = `✖ ${l}`;
      el.appendChild(r);
    }
    this.resultT = dur;
  }

  // zero resultT too: update() re-shows the panel while it's positive
  hideResult() {
    this.resultT = 0;
    $('result').classList.add('hidden');
  }

  death(cause, hint = null) {
    $('death-cause').textContent = cause;
    $('death-hint').textContent = hint || 'Click or press ENTER to redeploy at your home base.';
    this.show('death', true);
  }

  // ---- Job board / shop ----
  // tabs: [{ id, label }] adds a tab bar (tab: current, onTab(id): click on another). pane: { html, foot: { kb, pad }, wire(root) }
  // replaces the contracts and shop (the town's COUNCIL HALL page).
  openBoard(loc, offers, { onAccept, onClose, shop, onBuy, upgrades, credits, active, extra, canTake, onAbandon, rep, event, onEventAbandon, tabs, tab, onTab, pane }) {
    const el = $('board');
    const f = FACTIONS[loc.faction];
    const tier = rep.tier(loc.faction);
    // terminal: title bar, a strip of status screens, then a bezelled screen per section
    const node = `${loc.short || loc.id}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
    let html = `<div class="board-head" style="--fc:${f.color}"><span class="term-title">◢ ${loc.name.toUpperCase()} <span class="term-dim">// JOB TERMINAL · NODE ${node}-${String(loc.r).padStart(3, '0')}</span><span class="term-cursor">█</span></span><span class="board-right"><button class="board-close" data-close="1">✕ LOG OFF</button></span></div>`;
    if (tabs) html += `<nav class="board-tabs" role="tablist">${tabs.map((t) => `<button type="button" role="tab" data-tab="${t.id}" class="${t.id === tab ? 'on' : ''}" aria-selected="${t.id === tab}">${t.label}</button>`).join('')}<span class="bt-hint"><span class="foot-kb">Q · E</span><span class="foot-pad">${glyphHtml(['LB'])} ${glyphHtml(['RB'])}</span></span></nav>`;
    html += `<div class="board-scroll">`; // only this scrolls, between header and footer
    if (pane) html += pane.html;
    else {
      html += `<div class="term-status">
        <div class="term-mini"><label>CREDITS</label><b class="board-credits">₵${credits}</b></div>
        <div class="term-mini"><label>${f.name.toUpperCase()} STANDING</label><b><span class="tierchip" style="background:${tier.color}">${tier.name}</span></b></div>
        <div class="term-mini"><label>UPLINK</label><b class="term-ok">● SECURE</b><span class="term-dim">${offers.length} CONTRACT${offers.length === 1 ? '' : 'S'} POSTED</span></div>
      </div>`;
      if (active) {
        html += `<div class="board-active"><span><span class="term-dim">ACTIVE CONTRACT ›</span> ${active.cargo.name} → ${active.to.name}${extra ? ` <span class="term-dim">+ ON TOP ›</span> ${extra.cargo.name} → ${extra.to.name}` : ''}</span><button data-abandon="1">ABANDON</button></div>`;
        if (canTake) html += `<div class="board-active"><span><span class="term-dim">TWIN CRADLE ›</span> room for one more contract on top</span></div>`;
      }
      if (event) {
        html += `<div class="board-active"><span><span class="term-dim">ACTIVE EVENT ›</span> ${event.title}</span><button data-evabandon="1">ABANDON</button></div>`;
      }
      html += `<div class="board-cols">`;
      html += `<div class="board-jobs screen"><h3><span>SCR-01 · CONTRACTS</span><span class="term-dim">${offers.length ? 'SELECT 1-' + offers.length : 'NO DATA'}</span></h3>`;
      if (!offers.length) html += `<div class="empty">${rep.hostile(loc.faction) ? `${f.name} won't deal with you. Raise your reputation first.` : 'No contracts right now. Check back after your next run!'}</div>`;
      offers.forEach((o, i) => {
        const fc = FACTIONS[o.faction];
        const fr = '●'.repeat(Math.round(o.cargo.fragile * 3)) || '–';
        const hot = '☠'.repeat(o.cargo.hot) || '–';
        const kind = KIND_INFO[o.kind];
        const route = o.kind === 'bounty' ? `<b>${o.bounty.n} pirates</b> · about ${(o.dist / 1000).toFixed(1)} km away · ${o.time}s` : `${o.pickup === o.board ? 'HERE' : o.pickup.name} → <b>${o.to.name}</b> · ${(o.dist / 1000).toFixed(1)} km · ${o.time}s`;
        html += `<div class="job ${canTake === false || (canTake == null && active) ? 'disabled' : ''} ${o.premium ? 'premium' : ''}" data-i="${i}">
          <div class="job-top"><span class="job-key">${i + 1}</span><span class="job-fac" style="background:${fc.color}">${fc.name}</span>${kind ? `<span class="job-kind k-${o.kind}">${kind.name}</span>` : ''}<span class="job-pay">₵${o.reward}</span></div>
          <div class="job-cargo">${o.cargo.name}${o.par ? ` · PAR ${o.par} STYLE` : ''}</div>
          <div class="job-route">${route}</div>
          ${kind ? `<div class="job-blurb">${kind.blurb}</div>` : ''}
          <div class="bubble"><b>${o.client}:</b> “${o.text}”</div>
          <div class="job-tags">Fragile ${fr} &nbsp; Pirate risk ${hot}${o.clearance ? ' &nbsp; <span class="clr">MILITARY CLEARANCE</span>' : ''}${o.dark ? ' &nbsp; <span class="darktag">☾ DARK SIDE · HAZARD PAY</span>' : ''}${o.payload ? ` &nbsp; <span class="paytag">☠ PAYLOAD: ${o.payload.name.toUpperCase()}</span>` : ''}${o.rider ? ` &nbsp; <span class="paytag">✦ RIDER: ${o.rider.name.toUpperCase()}</span>` : ''}</div>
        </div>`;
      });
      html += `</div>`;
      if (shop) {
        html += `<div class="board-shop screen"><h3><span>SCR-02 · ${loc.id === 'ilmb' ? 'REPAIR BAY & SPACECOM GEAR' : `${f.name.toUpperCase()} GEAR`}</span></h3>`;
        for (const u of shop) {
          const lvl = upgrades[u.key] || 0;
          const maxed = lvl >= u.max;
          const cost = u.cost * (lvl + 1);
          const ok = rep.canBuy(u, lvl);
          const unlockMissing = u.unlock && u.unlock.smuggle && !(rep.game.stats.blackMarket || []).includes(u.key);
          const unlockDeed = u.unlock && u.unlock.stat && (rep.game.stats[u.unlock.stat] || 0) < u.unlock.n;
          const need = !maxed && !ok ? (unlockDeed ? `Unlock: ${u.unlock.text} (${rep.game.stats[u.unlock.stat] || 0}/${u.unlock.n})` : unlockMissing ? 'Comes in on a smuggling run, in order: watch the Rustmoon board for a PAYLOAD tag' : u.faction === 'rustmoon' && !rep.aligned() ? 'Rustmoon members only' : `Needs ${u.req[Math.min(lvl, u.req.length - 1)]} rep with ${FACTIONS[u.faction].name}`) : '';
          const sw = u.swatch ? u.swatch.map((c) => `<span class="swatch" style="background:#${c.toString(16).padStart(6, '0')}"></span>`).join('') : '';
          html += `<div class="shop-item ${maxed || credits < cost || !ok ? 'disabled' : ''} ${u.faction ? 'unique' : ''}" data-buy="${u.key}">
            <div class="job-top"><span>${sw}${u.name}</span><span class="job-pay">${maxed ? (u.cosmetic ? 'OWNED' : 'MAX') : '₵' + cost}</span></div>
            <div class="job-route">${u.desc}</div>${need ? `<div class="lock">🔒 ${need}</div>` : ''}${u.cosmetic ? '' : `<div class="lvl">${'■'.repeat(lvl)}${'□'.repeat(u.max - lvl)}</div>`}</div>`;
        }
        html += `</div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
    // fixed footer; names pad buttons when a controller is in use
    const other = tabs && tabs.find((t) => t.id !== tab);
    html += pane
      ? `<div class="board-foot"><span class="foot-kb">&gt; ${pane.foot.kb}</span><span class="foot-pad">&gt; ${pane.foot.pad}</span><span class="term-cursor">_</span></div>`
      : `<div class="board-foot"><span class="foot-kb">&gt; Click a contract or press 1-${Math.max(1, offers.length)}${other ? ` · Q / E: ${other.label}` : ''} · F / ESC to log off</span><span class="foot-pad">&gt; Press ${glyphHtml(['A'])} on a contract or an upgrade${other ? ` · ${glyphHtml(['LB'])} ${glyphHtml(['RB'])} ${other.label}` : ''} · ${glyphHtml(['B'])} to log off</span><span class="term-cursor">_</span></div>`;
    const settle = pane ? keepScroll('#board') : null; // before replacing markup, so the tile list keeps its scroll
    el.innerHTML = html;
    el.classList.add('term');
    el.classList.toggle('tab-town', !!pane);
    el.style.setProperty('--fc', f.color);
    el.classList.remove('hidden');
    if (pane) { pane.wire(el.querySelector('.otm')); settle(); }
    else if (tabs) { const j = el.querySelector('.job:not(.disabled)'); if (j) j.classList.add('pad-default'); } // pad highlight starts on the first contract, not the tab bar
    el.onclick = (ev) => {
      const tb = ev.target.closest('[data-tab]');
      if (tb) { if (!tb.classList.contains('on')) onTab(tb.dataset.tab); return; }
      const job = ev.target.closest('.job');
      const buy = ev.target.closest('[data-buy]');
      if (ev.target.closest('[data-close]')) { onClose(); return; }
      if (ev.target.closest('[data-abandon]')) { onAbandon(); return; }
      if (ev.target.closest('[data-evabandon]')) { onEventAbandon(); return; }
      if (job && !job.classList.contains('disabled')) onAccept(offers[+job.dataset.i]);
      else if (buy && !buy.classList.contains('disabled')) onBuy(buy.dataset.buy);
    };
    this.boardClose = onClose;
  }

  closeBoard() { const b = $('board'); b.classList.add('hidden'); b.innerHTML = ''; } // emptied: a hidden page left in the DOM would be found by lookups

  // ---- per-frame ----
  // NPC name tags (toon.js nameTag): a label over each visible named NPC, smaller up close, faded with distance,
  // hidden behind the camera, hills and walls
  updateTags(dt) {
    const g = this.game;
    const cam = g.camera;
    cam.updateMatrixWorld(); // this frame's camera
    let box = this.tagBox;
    if (!box) { box = this.tagBox = document.createElement('div'); box.id = 'nametags'; document.getElementById('hud').appendChild(box); }
    const W = window.innerWidth, H = window.innerHeight;
    const playing = g.state === 'play';
    for (let n = NAME_TAGS.length - 1; n >= 0; n--) {
      const t = NAME_TAGS[n];
      // detached (place rebuilt): drop it. Place out of range (not in the scene): hide it
      if (!t.sprite.parent) { if (t.el) t.el.remove(); NAME_TAGS.splice(n, 1); continue; }
      let o = t.sprite, shown = true;
      while (o.parent) { if (!o.visible) shown = false; o = o.parent; }
      if (o !== g.scene) shown = false;
      if (!t.el) {
        t.el = document.createElement('div');
        t.el.className = 'nametag';
        t.el.textContent = t.text;
        t.el.style.setProperty('--tc', t.color);
        box.appendChild(t.el);
      }
      const p = t.sprite.getWorldPosition(this.v);
      const d = p.distanceTo(cam.position);
      let on = playing && shown && d < 150;
      if (on) {
        // line of sight, a few times a second
        t.losT -= dt;
        if (t.losT <= 0) { t.losT = 0.25; t.seen = g.enemies.clearShot(cam.position, p); } // terrain and walls
        on = t.seen;
      }
      if (on) {
        p.project(cam);
        if (p.z > 1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05) on = false;
      }
      if (!on) { if (!t.el.classList.contains('off')) t.el.classList.add('off'); continue; }
      t.el.classList.remove('off');
      const s = Math.max(0.6, Math.min(1, 0.6 + (d - 4) / 36 * 0.4)); // smaller up close
      t.el.style.transform = `translate(${((p.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-p.y * 0.5 + 0.5) * H).toFixed(1)}px) translate(-50%, -100%) scale(${s.toFixed(3)})`;
      t.el.style.opacity = d > 110 ? Math.max(0, 1 - (d - 110) / 40).toFixed(2) : '1';
    }
  }

  update(dt) {
    this.updateTags(dt);
    const g = this.game;
    const P = g.player;
    const ms = g.missions;

    if (this.alertT > 0 && (this.alertT -= dt) <= 0) $c('alert').classList.add('hidden');
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) $c('toast').classList.add('hidden');
    if (this.grabT > 0 && (this.grabT -= dt) <= 0) $c('grab').classList.add('hidden');
    if (this.bannerT > 0 && (this.bannerT -= dt) <= 0) $c('banner').classList.add('hidden');
    this.updateEventPopup(dt);
    if (this.resultT > 0) { $c('result').classList.remove('hidden'); if ((this.resultT -= dt) <= 0) $c('result').classList.add('hidden'); }

    this.drawSpeedo(P.speed * 3.6);
    this.distressLog(dt);
    $c('hp-fill').style.width = (P.health / P.maxHealth) * 100 + '%';
    this.updateCracks(Math.max(0, P.health / P.maxHealth));
    $c('en-fill').style.width = (P.body.energy / P.body.maxEnergy) * 100 + '%';
    $c('en-fill').style.opacity = P.body.jetLocked ? 0.45 : ''; // dimmed while thrusters are locked out
    const sk = $c('skates');
    const on = P.body.skating;
    sk.textContent = on ? 'Q-LOCK: ENGAGED' : 'Q-LOCK: OFF (BOOTS)';
    sk.classList.toggle('on', on);
    // cash chip shows for 5 s on any credit change, with a green + or red −
    const crEl = $c('credits');
    crEl.querySelector('.cr-amt').textContent = `₵${g.credits}`;
    if (this.lastCr === undefined) this.lastCr = g.credits;
    else if (g.credits !== this.lastCr) {
      const delta = g.credits - this.lastCr, up = delta > 0;
      this.lastCr = g.credits;
      const sign = crEl.querySelector('.cr-delta');
      sign.textContent = `${up ? '+' : '−'}₵${Math.abs(delta)}`;
      sign.className = `cr-delta ${up ? 'plus' : 'minus'}`;
      void sign.offsetWidth; // restart the slide-in
      sign.classList.add('cr-in');
      crEl.classList.add('cr-show');
      this.crT = 5;
    }
    // also up while a job board is open
    if (g.state === 'board') this.crT = Math.max(this.crT || 0, 2); // lingers 2 s after log-off
    else if (this.crT > 0) this.crT -= dt;
    crEl.classList.toggle('cr-show', this.crT > 0 || g.state === 'board');
    const wi = P.weapon || 0;
    const wtxt = P.vehicle && P.vehicle.def.turret ? `<span class="on">1</span> ${(P.vehicle.def.cannon || APC_CANNON.name).toUpperCase()}` : WEAPONS.map((w, i) => `<span class="${i === wi ? 'on' : ''} ${(!w.unlock || g.upgrades[w.unlock]) ? '' : 'locked'}">${i + 1}</span>`).join('') + ` ${WEAPONS[wi].name.toUpperCase()}`;
    if (wtxt !== this.lastW) { $c('weaponchip').innerHTML = wtxt; this.lastW = wtxt; }
    const jt = g.alchemy ? g.alchemy.hudText() : '';
    if (jt !== this.lastJar) { $c('jarchip').innerHTML = jt; $c('jarchip').classList.toggle('hidden', !jt); this.lastJar = jt; }
    const styleTxt = ms.active ? `STYLE +₵${ms.styleValue()}${ms.styleValue(false) >= ms.active.reward ? ' MAX' : ''}` : '';
    if (styleTxt !== this.lastStyle) { $c('style').textContent = styleTxt; this.lastStyle = styleTxt; }

    const mp = $c('mission');
    if (ms.active) {
      const a = ms.active;
      const obj = ms.objective();
      mp.classList.remove('hidden');
      const t = Math.abs(ms.timer);
      const dist = obj ? arcDist(obj.pos, P.pos) : 0;
      const kindName = a.kind && a.kind !== 'standard' ? a.kind.toUpperCase() : 'CONTRACT';
      const stat = a.kind === 'bounty' ? `SQUAD ${ms.bountyLeft()} / ${a.bounty.n} LEFT` : `CARGO ${Math.round(ms.integrity * 100)}%${a.par ? ` · PAR ${Math.min(a.par, Math.round(ms.parPts()))}/${a.par}${ms.parHit ? ' ✓' : ''}` : ''}`;
      mp.innerHTML = `<div class="m-head" style="background:${FACTIONS[a.faction].color}">${kindName} · ${a.client}</div>
        <div class="m-cargo">${a.cargo.name}</div>
        <div class="m-obj">${obj ? obj.label : ''} <span>${(dist / 1000).toFixed(2)} km</span></div>
        <div class="m-row"><span class="m-timer ${ms.late || t < 15 ? 'low' : ''}">${ms.late ? 'LATE +' : ''}${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}</span>
        <span class="m-int">${stat}</span></div>`;
      // Twin Cradle second contract, below the first
      const x = ms.extra;
      if (x) {
        const o2 = ms.objective2();
        const t2 = Math.abs(x.timer);
        mp.innerHTML += `<div class="m-head m-second" style="background:${FACTIONS[x.a.faction].color}">ON TOP · ${x.a.client}</div>
        <div class="m-cargo">${x.a.cargo.name}</div>
        <div class="m-obj">${o2 ? o2.label : ''} <span>${o2 ? (arcDist(o2.pos, P.pos) / 1000).toFixed(2) : '0.00'} km</span></div>
        <div class="m-row"><span class="m-timer ${x.late || t2 < 15 ? 'low' : ''}">${x.late ? 'LATE +' : ''}${Math.floor(t2 / 60)}:${String(Math.floor(t2 % 60)).padStart(2, '0')}</span>
        <span class="m-int">CARGO ${Math.round(x.integrity * 100)}%</span></div>`;
      }
    } else {
      mp.classList.add('hidden');
    }

    this.drawMinimap(dt);
    this.updateArrow();
  }

  drawSpeedo(kmh) {
    const c = this.sctx;
    const W = this.speedCanvas.width, H = this.speedCanvas.height;
    c.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H - 18, R = W / 2 - 16;
    const maxK = 500;
    const a0 = Math.PI, a1 = 2 * Math.PI;
    c.lineWidth = 18;
    c.strokeStyle = '#2a2440';
    c.beginPath(); c.arc(cx, cy, R, a0, a1); c.stroke();
    const k = Math.min(1, kmh / maxK);
    const zones = [[0, 0.3, '#2ee6ff'], [0.3, 0.6, '#ffd23f'], [0.6, 1, '#ff2e88']];
    c.lineWidth = 12;
    for (const [s, e, col] of zones) {
      if (k <= s) break;
      c.strokeStyle = col;
      c.beginPath(); c.arc(cx, cy, R, a0 + s * Math.PI, a0 + Math.min(k, e) * Math.PI); c.stroke();
    }
    c.strokeStyle = 'rgba(232,226,248,0.75)';
    c.lineWidth = 3;
    for (let i = 0; i <= 10; i++) {
      const a = a0 + (i / 10) * Math.PI;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * (R - 14), cy + Math.sin(a) * (R - 14));
      c.lineTo(cx + Math.cos(a) * (R - 24), cy + Math.sin(a) * (R - 24));
      c.stroke();
    }
    const na = a0 + k * Math.PI;
    c.lineWidth = 6; c.strokeStyle = '#05030c';
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(na) * (R - 6), cy + Math.sin(na) * (R - 6)); c.stroke();
    c.lineWidth = 3; c.strokeStyle = '#ff4f2e';
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(na) * (R - 8), cy + Math.sin(na) * (R - 8)); c.stroke();
    const txt = String(Math.round(this.game.settings && this.game.settings.v.units === 'ms' ? kmh / 3.6 : kmh)); // settings
    if (txt !== this.lastSpeedTxt) {
      $('speed-num').textContent = txt;
      this.lastSpeedTxt = txt;
    }
  }

  // Heading-up local map, projected onto your tangent plane.
  drawMinimap(dt = 0) {
    const g = this.game;
    const P = g.player;
    const c = this.mctx;
    const W = this.mini.width, H = this.mini.height;
    // zooms out with speed (up to ~2.8x), opening fast and closing slowly
    const want = MM_RANGE * (1 + Math.min(1.8, Math.max(0, P.speed - 15) / 70));
    if (!this.mmRange) this.mmRange = MM_RANGE;
    this.mmRange += (want - this.mmRange) * (1 - Math.exp(-dt * (want > this.mmRange ? 2.5 : 0.8)));
    const range = this.mmRange;
    // zoomed out, all but settlements fades away (gone by 1.5x)
    const fade = Math.max(0, Math.min(1, 1 - (range / MM_RANGE - 1) / 0.5));
    const s = (W / 2) / range;
    const up = P.up, fwd = g.cam.fwd, right = g.cam.right;
    const proj = (p) => {
      const n = this.v.copy(p).normalize();
      const d = arcDist(n, up);
      const tx = n.dot(right), ty = n.dot(fwd);
      const l = Math.hypot(tx, ty) || 1;
      return [W / 2 + (tx / l) * d * s, H / 2 - (ty / l) * d * s, d];
    };
    const dark = darkness(up);
    c.fillStyle = dark > 0.5 ? '#0e0b18' : '#2a2440';
    c.fillRect(0, 0, W, H);
    // roads, under everything: only charted ground (the globe map's fog); kept when zoomed out
    const tr = g.world.traffic, gl = g.globe;
    if (tr && tr.mapChunks && gl) {
      c.save();
      c.strokeStyle = dark > 0.5 ? 'rgba(196,172,255,0.55)' : 'rgba(233,207,148,0.7)';
      c.lineWidth = 3; c.lineJoin = c.lineCap = 'round';
      c.beginPath();
      for (const ch of tr.mapChunks()) {
        if (arcDist(ch.c, up) - ch.r > range * 1.1 || !gl.explored[gl.cellOf(ch.c)]) continue;
        ch.pts.forEach((p, i) => { const [x, y] = proj(p); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
      }
      c.stroke();
      c.restore();
    }
    // terminator and SAT-7's orbit in the globe map's colours, under the markers; kept when zoomed out
    const cv = this.mmCurves();
    c.save();
    c.lineJoin = c.lineCap = 'round';
    this.mmLine(c, proj, up, range, cv.term, [8, 5], '#180c33', '#a070ff');
    if (g.secrets && g.secrets.sat) this.mmLine(c, proj, up, range, this.mmOrbit(g.secrets), [6, 5], '#120a1e', '#00ffa8');
    c.restore();
    c.globalAlpha = fade;
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.lineWidth = 1;
    for (const cr of fade > 0.02 ? g.planet.craters : []) {
      if (cr.R < 30 || cr.d.dot(up) < 0.9) continue;
      const [x, y, d] = proj(cr.d);
      if (d > range + cr.R) continue;
      c.beginPath(); c.arc(x, y, cr.R * s, 0, Math.PI * 2); c.stroke();
    }
    for (const ev of fade > 0.02 ? g.events.list : []) {
      let [x, y, d] = proj(ev.stage || ev.start);
      if (d > range * 1.4) {
        // event radar (3 transponders to Dr. Zbornak): far events on the rim
        if (!g.upgrades.radar || d > 2500) continue;
        const ang = Math.atan2(y - H / 2, x - W / 2), rr = W / 2 - 9;
        x = W / 2 + Math.cos(ang) * rr; y = H / 2 + Math.sin(ang) * rr;
        c.fillStyle = FACTIONS[ev.faction].color; c.strokeStyle = '#fff'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill(); c.stroke();
        continue;
      }
      c.fillStyle = FACTIONS[ev.faction].color; c.strokeStyle = '#fff'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, y - 8); c.lineTo(x + 7, y + 5); c.lineTo(x - 7, y + 5); c.closePath(); c.fill(); c.stroke();
    }
    // active meteor shower: red zone
    const mw = g.meteors && g.meteors.warning;
    if (mw && fade > 0.02) {
      const [x, y, d] = proj(mw.dir);
      if (d < range + mw.r) {
        c.fillStyle = `rgba(255,79,46,${0.16 + 0.08 * Math.sin(performance.now() / 200)})`;
        c.strokeStyle = '#ff4f2e'; c.lineWidth = 2; c.setLineDash([6, 4]);
        c.beginPath(); c.arc(x, y, mw.r * s, 0, Math.PI * 2); c.fill(); c.stroke(); c.setLineDash([]);
      }
    }
    c.globalAlpha = 1; // settlements and names stay
    for (const l of g.locations) {
      if (!l.discovered) continue;
      const [x, y, d] = proj(l.dir);
      if (d > range * 1.6) continue;
      if (l.zoneR) {
        c.fillStyle = 'rgba(255,42,74,0.18)';
        c.strokeStyle = '#ff2a4a';
        c.lineWidth = 2;
        c.beginPath(); c.arc(x, y, l.zoneR * s, 0, Math.PI * 2); c.fill(); c.stroke();
      }
      c.fillStyle = FACTIONS[l.faction].color;
      c.strokeStyle = '#120a1e';
      c.lineWidth = 3;
      c.beginPath(); c.arc(x, y, Math.max(5, l.r * s * 0.6), 0, Math.PI * 2); c.fill(); c.stroke();
      c.font = pixelFont(8);
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.strokeText(l.short, x, y - 10); c.fillText(l.short, x, y - 10);
    }
    c.globalAlpha = fade;
    c.fillStyle = '#9be7ff';
    // wild mites: green specks
    if (g.alchemy && fade > 0.02) {
      c.fillStyle = '#b8e986';
      for (const m of g.alchemy.mites) {
        if (!m.model || m.gone > 0) continue;
        const [x, y, d] = proj(m.pos);
        if (d < range) { c.beginPath(); c.arc(x, y, 2.2, 0, Math.PI * 2); c.fill(); }
      }
    }
    c.fillStyle = '#9be7ff';
    for (const v of fade > 0.02 ? g.world.vehicles : []) {
      const [x, y, d] = proj(v.pos);
      if (d < range) c.fillRect(x - 2, y - 2, 4, 4);
    }
    for (const e of fade > 0.02 ? g.enemies.list : []) {
      if (e.dead || (e.base && !e.base.awake) || e.kind === 'core') continue;
      const [x, y, d] = proj(e.body ? e.body.pos : e.center);
      if (d > range) continue;
      c.fillStyle = e.faction === 'pirate' ? (g.enemies.friendly(e) ? '#2ee6ff' : '#7dff3a') : e.kind === 'megamite' ? '#b8e986' : ((e.base && e.base.hostile) || (e.roam && g.enemies.isHostileTarget(e)) ? '#ff2a4a' : '#8a8aa0');
      c.beginPath(); c.arc(x, y, e.kind === 'megamite' ? 8 : e.carrying ? 6 : 3.5, 0, Math.PI * 2); c.fill();
      if (e.carrying) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); }
    }
    for (const d of fade > 0.02 ? g.enemies.drops : []) { const [x, y] = proj(d.pos); c.fillStyle = '#2ee6ff'; c.fillRect(x - 4, y - 4, 8, 8); }
    c.globalAlpha = 1; // player and objectives stay too
    const obj = g.objective();
    const obj2 = g.missions.objective2();
    for (const [o, col] of [[obj, '#ffd23f'], [obj2, '#7dff6a']]) {
      if (!o) continue;
      let [x, y] = proj(o.pos);
      x = Math.max(8, Math.min(W - 8, x)); y = Math.max(8, Math.min(H - 8, y));
      c.strokeStyle = col; c.lineWidth = 3;
      c.beginPath(); c.arc(x, y, 9 + Math.sin(performance.now() / 150) * 2, 0, Math.PI * 2); c.stroke();
    }
    c.fillStyle = '#ff4f2e'; c.strokeStyle = '#fff'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(W / 2, H / 2 - 9); c.lineTo(W / 2 + 6, H / 2 + 7); c.lineTo(W / 2, H / 2 + 3); c.lineTo(W / 2 - 6, H / 2 + 7); c.closePath(); c.fill(); c.stroke();
  }

  // Fixed minimap great circles, sampled once as unit directions: the terminator, and SAT-7's orbit (mmOrbit).
  mmCurves() {
    if (this.mmCv) return this.mmCv;
    const term = [], N = MM_CURVE_N;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI * 2;
      term.push(new THREE.Vector3().copy(E1).multiplyScalar(Math.cos(t)).addScaledVector(E2, Math.sin(t)));
    }
    return (this.mmCv = { term });
  }

  mmOrbit(S) {
    if (this.mmOrbitOf === S) return this.mmOrb;
    const pts = [];
    for (let i = 0; i <= MM_CURVE_N; i++) pts.push(S.orbitPoint((i / MM_CURVE_N) * Math.PI * 2, new THREE.Vector3()).normalize());
    this.mmOrbitOf = S;
    return (this.mmOrb = pts);
  }

  // Stroke the parts of a sampled curve within minimap reach: dark casing under a dashed colour line, readable lit or dark.
  mmLine(c, proj, up, range, pts, dash, casing, color) {
    const cosLim = Math.cos((range * 1.8) / PLANET.radius);
    const path = new Path2D();
    let pen = false, any = false;
    for (const p of pts) {
      if (p.dot(up) < cosLim) { pen = false; continue; }
      const [x, y] = proj(p);
      if (pen) path.lineTo(x, y); else path.moveTo(x, y);
      pen = any = true;
    }
    if (!any) return;
    c.setLineDash(dash);
    c.strokeStyle = casing; c.lineWidth = 4.5; c.stroke(path);
    c.strokeStyle = color; c.lineWidth = 2; c.stroke(path);
    c.setLineDash([]);
  }

  updateArrow() {
    const g = this.game;
    this.placeArrow(g.objective(), $('obj-arrow'), $('obj-marker'));
    // Twin Cradle second contract: its own green waypoint
    if (!this.arrow2) {
      this.arrow2 = $('obj-arrow').cloneNode(false); this.arrow2.id = 'obj-arrow2'; this.arrow2.removeAttribute('data-svg');
      this.marker2 = $('obj-marker').cloneNode(true); this.marker2.id = 'obj-marker2';
      $('obj-arrow').after(this.arrow2, this.marker2);
    }
    this.placeArrow(g.missions.objective2(), this.arrow2, this.marker2, '#7dff6a');
  }

  placeArrow(obj, el, mk, color = '#ffd23f') {
    const g = this.game;
    if (!obj || g.player.dead) { el.classList.add('hidden'); mk.classList.add('hidden'); return; }
    const up = upAt(obj.pos);
    const away = g.spindle && g.spindle.active;
    this.v.copy(g.planet.ground(obj.pos)).addScaledVector(up, away ? 6 : 25).project(g.camera);
    const onScreen = this.v.z < 1 && Math.abs(this.v.x) < 0.95 && Math.abs(this.v.y) < 0.92;
    const dist = away ? obj.pos.distanceTo(g.player.pos) : arcDist(obj.pos, g.player.pos);
    if (onScreen) {
      el.classList.add('hidden');
      mk.classList.remove('hidden');
      mk.style.left = ((this.v.x + 1) / 2) * 100 + '%';
      mk.style.top = ((1 - this.v.y) / 2) * 100 + '%';
      mk.querySelector('span').textContent = `${obj.label} · ${dist > 2000 ? (dist / 1000).toFixed(1) + 'km' : Math.round(dist) + 'm'}`;
    } else {
      // SVG arrow (no font dependency) with distance, on a ring clear of the HUD panels
      if (!el.dataset.svg) {
        el.dataset.svg = '1';
        el.innerHTML = `<svg viewBox="0 0 64 64" width="64" height="64"><path d="M60 32 L14 8 L24 32 L14 56 Z" fill="${color}" stroke="#120a1e" stroke-width="5" stroke-linejoin="round"/></svg><div class="oa-dist"></div>`;
      }
      mk.classList.add('hidden');
      el.classList.remove('hidden');
      // off screen: point along the surface toward it
      const P = g.player;
      const t = obj.pos.clone().sub(P.pos);
      t.addScaledVector(P.up, -t.dot(P.up));
      let x = t.dot(g.cam.right), yy = t.dot(g.cam.fwd);
      const a = Math.atan2(yy, x);
      const ex = Math.cos(a), ey = Math.sin(a);
      el.style.left = ((ex * 0.62 + 1) / 2) * 100 + '%';
      el.style.top = ((1 - ey * 0.56) / 2) * 100 + '%';
      el.querySelector('svg').style.transform = `rotate(${-a}rad)`;
      el.querySelector('.oa-dist').textContent = `${obj.label} · ${dist > 2000 ? (dist / 1000).toFixed(1) + 'km' : Math.round(dist) + 'm'}`;
    }
  }

  // ---- events ----
  eventBanner(ev) {
    this.alert(`${FACTIONS[ev.faction].name.toUpperCase()} EVENT: ${ev.title.toUpperCase()}`, FACTIONS[ev.faction].color, 3.5);
    this.toast(ev.brief, 6);
  }

  eventResult(ev, ok, text) {
    const el = $('result');
    el.className = `panel result ${ok ? 'win' : 'lose'}`;
    el.innerHTML = `<div class="r-title">${ok ? 'EVENT COMPLETE!' : 'EVENT FAILED'}</div><div class="r-sub">${ev.title}</div><div class="r-sub">${text || ''}</div>`;
    this.resultT = 4.5;
  }

  eventPanel(ev, fluid) {
    const el = $('eventpanel');
    if (!ev) { el.classList.add('hidden'); $('fluid').classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const f = FACTIONS[ev.faction];
    const t = ev.timer !== undefined ? `<span class="m-timer ${ev.timer < 20 ? 'low' : ''}">${Math.floor(Math.max(0, ev.timer) / 60)}:${String(Math.floor(Math.max(0, ev.timer) % 60)).padStart(2, '0')}</span>` : '';
    const html = `<div class="m-head" style="background:${f.color}">EVENT · ${f.name}</div>
      <div class="m-cargo">${ev.title}</div>
      <div class="m-obj${ev.warn ? ' warn' : ''}">${ev.status || ''}</div>${(ev.list || []).map((r) => `<div class="ev-row ${r.state}"><b>${r.state === 'done' ? '✔' : r.state === 'next' ? '►' : '○'}</b>${r.label}<span>${r.note || ''}</span></div>`).join('')}
      <div class="m-row">${t}<div class="track ev-bar"><div class="fill" style="width:${Math.round((ev.bar ?? 0) * 100)}%;background:${f.color}"></div></div></div>`;
    if (html !== this.lastEventHtml) { el.innerHTML = html; this.lastEventHtml = html; }
    const fc = $('fluid');
    if (fluid) { fc.classList.remove('hidden'); this.drawFluid(fc, fluid); } else fc.classList.add('hidden');
  }

  // Sloshing liquid in a sideways vacuum tube.
  drawFluid(cv, f) {
    const c = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    c.clearRect(0, 0, W, H);
    const x0 = 14, y0 = 14, w = W - 28, h = H - 28;
    c.fillStyle = 'rgba(155,231,255,0.15)';
    c.fillRect(x0, y0, w, h);
    const tilt = f.sx * 0.9;
    const level = Math.max(0, f.level);
    const surfY = y0 + h * (1 - level) - f.sy * 6;
    c.save();
    c.beginPath(); c.rect(x0, y0, w, h); c.clip();
    c.fillStyle = '#2a1f4f';
    c.beginPath();
    c.moveTo(x0, surfY - tilt * h * 0.5 + Math.sin(performance.now() / 120) * 2);
    for (let i = 1; i <= 12; i++) {
      const x = x0 + (w * i) / 12;
      c.lineTo(x, surfY - tilt * h * 0.5 + tilt * h * (i / 12) + Math.sin(performance.now() / 120 + i) * 2 * (1 + Math.abs(f.vx)));
    }
    c.lineTo(x0 + w, y0 + h); c.lineTo(x0, y0 + h); c.closePath(); c.fill();
    c.fillStyle = 'rgba(199,125,255,0.6)';
    c.fillRect(x0, surfY - tilt * h * 0.5, w, 2);
    c.restore();
    if (f.crack > 0) {
      c.strokeStyle = '#fff'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x0 + w * 0.6, y0); c.lineTo(x0 + w * 0.55, y0 + h * 0.4 * (0.5 + f.crack)); c.lineTo(x0 + w * 0.65, y0 + h * 0.7 * (0.5 + f.crack)); c.stroke();
    }
    c.strokeStyle = '#120a1e'; c.lineWidth = 4;
    c.strokeRect(x0, y0, w, h);
    c.fillStyle = '#3a3550';
    c.fillRect(2, y0 - 2, 12, h + 4); c.fillRect(W - 14, y0 - 2, 12, h + 4);
    if (f.spill > 0) { c.fillStyle = '#ff2a4a'; c.font = pixelFont(10); c.fillText('SPILLING!', x0 + 6, y0 + 18); }
  }

  // opts.raw: `text` is a whole page with its own title, choices and close (terminalUI.js); opts.cls: extra panel class
  dialog(title, text, buttons, onPick, opts = {}) {
    const el = $('dialog');
    el.innerHTML = opts.raw
      ? `<div class="panel dlg ${opts.cls || ''}">${text}</div>`
      : `<div class="panel dlg ${opts.cls || ''}"><div class="dlg-title">${title}</div><div class="bubble">${text}</div><div class="dlg-btns">${buttons.map((b, i) => `<button data-i="${i}">${b.label}</button>`).join('')}</div></div>`;
    el.classList.remove('hidden');
    el.onclick = (e) => {
      const b = e.target.closest('button');
      if (b && b.dataset.i !== undefined) onPick(+b.dataset.i); // ignore buttons that aren't dialog choices
    };
  }

  closeDialog() { $('dialog').classList.add('hidden'); }

  // ---- reputation log ----
  openRepLog(g) {
    // the tier boundaries along a -100..100 bar: a notch each (reached ones lit, the next one bright), and under the bar the tier you
    // enter there; the red -20 notch is HOSTILE's edge (below it they will not deal with you)
    const notches = (v, next, labels) => TIERS.filter((t) => t.min > -Infinity).map((t) => {
      const hostile = t.min === -20;
      const cls = `${v >= t.min ? 'got' : ''} ${next && next.min === t.min ? 'next' : ''} ${hostile ? 'bad' : ''}`;
      const at = ((t.min + 100) / 200) * 100;
      return labels ? `<span class="rep-tick ${cls}" style="left:${at}%">${t.name}<small>${t.min}</small></span>` : `<i class="rep-notch ${cls}" style="left:${at}%"></i>`;
    }).join('');
    const el = $('replog');
    const rep = g.rep;
    let html = `<div class="board-head" style="background:#ffd23f"><span>REPUTATION LOG</span><span class="board-right"><button class="board-close" data-close="1">✕ CLOSE</button></span></div><div class="rep-list">`;
    for (const [id, f] of Object.entries(FACTIONS)) {
      if (!rep.visible(id)) continue;
      const v = rep.get(id);
      const t = rep.tier(id);
      const nt = rep.nextTier(id);
      const pct = Math.round(((v + 100) / 200) * 100);
      const hq = g.locations.find((l) => l.id === f.hq);
      let status = '';
      if (id === 'rustmoon') status = rep.rustmoon === 'aligned' ? 'SWORN IN — pirates treat you as crew' : rep.rustmoon === 'locked' ? 'LOCKED OUT — they remember the wreck' : 'Known contact';
      if (f.enemy) status = `At war with ${FACTIONS[f.enemy].name}${rep.cleared(id) ? ' · CLEARANCE GRANTED' : ''}`;
      const ev = g.events.list.find((e) => e.faction === id);
      html += `<div class="rep-row" style="border-left-color:${f.color}">
        <div class="rep-top"><span class="rep-name" style="color:${f.color}">${f.name}</span><span class="rep-kind">${f.kind}</span><span class="tierchip" style="background:${t.color}">${t.name} (${v > 0 ? '+' : ''}${v})</span></div>
        <div class="track rep-bar"><div class="fill" style="width:${pct}%;background:${f.color}"></div>${notches(v, nt, false)}</div>
        <div class="rep-ticks">${notches(v, nt, true)}</div>
        <div class="rep-info">${f.blurb}</div>
        <div class="rep-meta">HQ: ${hq && hq.discovered ? hq.name : '???'} · Contract pay ×${(t.pay || 0).toFixed(2)}${nt ? ` · Next: ${nt.name} at ${nt.min}` : ' · Top tier'}${v >= -20 ? ` · Hostile below −20 (${v + 20} to spare)` : ''}${status ? ` · ${status}` : ''}</div>
        ${ev ? `<div class="rep-ev">📡 ${ev.state === 'active' ? 'ACTIVE' : 'OPEN'}: ${ev.title}</div>` : ''}
      </div>`;
    }
    html += `</div><div class="board-foot">Deliveries and events raise standing. Shooting a faction's people lowers it — and helping Vostok angers Daedalus (and vice versa). J / ESC to close.</div>`;
    el.innerHTML = html;
    el.classList.remove('hidden');
    el.onclick = (e) => { if (e.target.closest('[data-close]')) g.closeModal(false); };
  }
}
