import * as THREE from 'three';
import { FACTIONS } from './locations.js';
import { arcDist, darkness } from './geo.js';
import { WEAPONS } from './weapons.js';
import { pixelFont } from './fonts.js';

const $ = (id) => document.getElementById(id);

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
  }

  show(id, on = true) { $(id).classList.toggle('hidden', !on); }

  // Distress log: every open event (and the one you're running) as a small stack above the speed
  // tracker, newest on top, each with an arrow pointing where it is relative to your view.
  distressLog(dt) {
    const g = this.game;
    if (!g.events) return;
    if (!this.logEl) {
      this.logEl = document.createElement('div');
      this.logEl.id = 'distresslog';
      $('hud').appendChild(this.logEl);
      this.logRows = new Map();
      this.logT = 0;
    }
    this.logT -= dt;
    if (this.logT > 0) return;
    this.logT = 0.1;
    const P = g.player, up = P.up, cam = g.cam;
    const evs = g.events.list.filter((e) => e.state === 'open' || e.state === 'active');
    // keep it above the speed tracker whatever its scale
    const sp = $('speedo').getBoundingClientRect();
    this.logEl.style.bottom = `${Math.round(window.innerHeight - sp.top + 8)}px`;
    this.logEl.style.left = `${Math.round(sp.left)}px`;
    this.logEl.classList.toggle('hidden', !evs.length || g.state === 'title');
    const seen = new Set();
    for (const ev of evs) {
      seen.add(ev.id);
      let row = this.logRows.get(ev.id);
      if (!row) {
        row = document.createElement('div');
        row.className = 'dl-row dl-new';
        row.innerHTML = '<svg class="dl-arrow" viewBox="-10 -10 20 20"><path class="dl-shaft" d="M0 8V-1"/><path class="dl-tip" d="M0 -9.5L6.5 0H-6.5Z"/></svg><span class="dl-name"></span><span class="dl-dist"></span>';
        this.logEl.prepend(row);
        this.logRows.set(ev.id, row);
        setTimeout(() => row.classList.remove('dl-new'), 1200);
      }
      const col = (FACTIONS[ev.faction] && FACTIONS[ev.faction].color) || '#ffffff';
      const obj = ev.state === 'active' && g.events.objective();
      const target = obj ? obj.pos : ev.stage || ev.start;
      const v = this.v.copy(target).sub(P.pos);
      const dist = v.length();
      v.addScaledVector(up, -v.dot(up));
      const ang = Math.atan2(v.dot(cam.right), v.dot(cam.fwd));
      row.style.setProperty('--c', col);
      row.classList.toggle('dl-active', ev.state === 'active');
      row.querySelector('.dl-arrow').style.transform = `rotate(${ang.toFixed(2)}rad)`;
      row.querySelector('.dl-name').textContent = `${ev.icon || ''}${ev.short || ev.title}`.toUpperCase();
      row.querySelector('.dl-dist').textContent = dist > 999 ? `${(dist / 1000).toFixed(1)}KM` : `${Math.round(dist / 10) * 10}M`;
    }
    for (const [id, row] of this.logRows) if (!seen.has(id)) { row.remove(); this.logRows.delete(id); }
  }

  alert(text, color = '#ff2a4a', dur = 2.5) {
    const el = $('alert');
    el.textContent = text;
    el.style.background = color;
    el.classList.remove('hidden');
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
    this.alertT = dur;
  }

  // hold-to-act progress bar (k: 0..1; 0 hides it): the recall shuttle, or `label` for anything else
  // held (emptying the jar)
  recallHold(k, loc, label) {
    if (!this.recallEl) {
      this.recallEl = document.createElement('div');
      this.recallEl.id = 'recallhold';
      this.recallEl.innerHTML = '<div class="rh-label"></div><div class="rh-track"><div class="rh-fill"></div></div>';
      document.getElementById('hud').appendChild(this.recallEl);
    }
    this.recallEl.classList.toggle('show', k > 0);
    if (k <= 0) return;
    if (label) this.recallEl.querySelector('.rh-label').textContent = label;
    else if (loc) this.recallEl.querySelector('.rh-label').textContent = `HOLD R · RECALL TO ${loc.short || loc.name.toUpperCase()} · 100 CR`;
    this.recallEl.querySelector('.rh-fill').style.width = `${Math.min(1, k) * 100}%`;
  }

  toast(text, dur = 2.5) {
    const el = $('toast');
    el.textContent = text;
    el.classList.remove('hidden');
    this.toastT = dur;
  }

  prompt(text) {
    const el = $('prompt');
    if (!text) { el.classList.add('hidden'); return; }
    el.innerHTML = text;
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
    const kind = { trade: 'TRADE HUB', lab: 'STRANGE PLACE — RESEARCH', monolith: 'STRANGE PLACE', tunnel: 'STRANGE PLACE — ???', funpark: 'STRANGE PLACE — FUNPARK', derby: 'STRANGE PLACE — RACECOURSE', casino: 'STRANGE PLACE — CASINO', hub: 'INTERNATIONAL HUB', civilian: 'CIVILIAN HABITAT', research: 'RESEARCH FACILITY', military: 'MILITARY — RESTRICTED', industrial: 'INDUSTRIAL OUTPOST', pirate: 'PIRATE TERRITORY' }[loc.type]; // casino: banner kind
    el.innerHTML = `<div class="b-kind" style="background:${f.color}">${kind}</div><div class="b-name">${loc.name}</div><div class="b-blurb">${loc.blurb}</div>`;
    el.classList.remove('hidden');
    el.classList.remove('slam'); void el.offsetWidth; el.classList.add('slam');
    this.bannerT = 4;
  }

  delivered(info) {
    const el = $('result');
    el.className = 'panel result win';
    el.innerHTML = `
      <div class="r-title">DELIVERED!</div>
      <div class="r-sub">${info.a.cargo.name} → ${info.a.to.name}</div>
      <table>
        <tr><td>Contract</td><td>₵${info.integ}</td></tr>
        <tr><td>${info.late ? 'Late — half pay' : 'Speed bonus'}</td><td>₵${info.timeBonus}</td></tr>
        <tr><td>Style${info.styleCapped ? ' (MAX ×2)' : ''}</td><td>₵${info.style}</td></tr>
        <tr><td>Package condition</td><td>×${info.condition.toFixed(2)}</td></tr>
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

  death(cause) {
    $('death-cause').textContent = cause;
    this.show('death', true);
  }

  // ---- Job board / shop ----
  openBoard(loc, offers, { onAccept, onClose, shop, onBuy, upgrades, credits, active, onAbandon, highlights, rep, event, onEventAbandon }) {
    const el = $('board');
    const f = FACTIONS[loc.faction];
    const tier = rep.tier(loc.faction);
    // a terminal: a title bar, a strip of little status screens, then one bezelled screen per section
    const node = `${loc.short || loc.id}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
    let html = `<div class="board-head" style="--fc:${f.color}"><span class="term-title">◢ ${loc.name.toUpperCase()} <span class="term-dim">// JOB TERMINAL · NODE ${node}-${String(loc.r).padStart(3, '0')}</span><span class="term-cursor">█</span></span><span class="board-right"><button class="board-close" data-close="1">✕ LOG OFF</button></span></div>`;
    html += `<div class="term-status">
      <div class="term-mini"><label>CREDITS</label><b class="board-credits">₵${credits}</b></div>
      <div class="term-mini"><label>${f.name.toUpperCase()} STANDING</label><b><span class="tierchip" style="background:${tier.color}">${tier.name}</span></b></div>
      <div class="term-mini"><label>UPLINK</label><b class="term-ok">● SECURE</b><span class="term-dim">${offers.length} CONTRACT${offers.length === 1 ? '' : 'S'} POSTED</span></div>
    </div>`;
    if (active) {
      html += `<div class="board-active"><span><span class="term-dim">ACTIVE CONTRACT ›</span> ${active.cargo.name} → ${active.to.name}</span><button data-abandon="1">ABANDON</button></div>`;
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
      html += `<div class="job ${active ? 'disabled' : ''} ${o.premium ? 'premium' : ''}" data-i="${i}">
        <div class="job-top"><span class="job-key">${i + 1}</span><span class="job-fac" style="background:${fc.color}">${fc.name}</span><span class="job-pay">₵${o.reward}</span></div>
        <div class="job-cargo">${o.cargo.name}</div>
        <div class="job-route">${o.pickup === o.board ? 'HERE' : o.pickup.name} → <b>${o.to.name}</b> · ${(o.dist / 1000).toFixed(1)} km · ${o.time}s</div>
        <div class="bubble"><b>${o.client}:</b> “${o.text}”</div>
        <div class="job-tags">Fragile ${fr} &nbsp; Pirate risk ${hot}${o.clearance ? ' &nbsp; <span class="clr">MILITARY CLEARANCE</span>' : ''}${o.dark ? ' &nbsp; <span class="darktag">☾ DARK SIDE · HAZARD PAY</span>' : ''}</div>
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
        const unlockMissing = u.unlock && (rep.game.stats[u.unlock.stat] || 0) < u.unlock.n;
        const need = !maxed && !ok ? (unlockMissing ? `${u.unlock.text} (${rep.game.stats[u.unlock.stat] || 0}/${u.unlock.n})` : u.faction === 'rustmoon' && !rep.aligned() ? 'Rustmoon members only' : `Needs ${u.req[Math.min(lvl, u.req.length - 1)]} rep with ${FACTIONS[u.faction].name}`) : '';
        const sw = u.swatch ? u.swatch.map((c) => `<span class="swatch" style="background:#${c.toString(16).padStart(6, '0')}"></span>`).join('') : '';
        html += `<div class="shop-item ${maxed || credits < cost || !ok ? 'disabled' : ''} ${u.faction ? 'unique' : ''}" data-buy="${u.key}">
          <div class="job-top"><span>${sw}${u.name}</span><span class="job-pay">${maxed ? (u.cosmetic ? 'OWNED' : 'MAX') : '₵' + cost}</span></div>
          <div class="job-route">${u.desc}</div>${need ? `<div class="lock">🔒 ${need}</div>` : ''}${u.cosmetic ? '' : `<div class="lvl">${'■'.repeat(lvl)}${'□'.repeat(u.max - lvl)}</div>`}</div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
    if (highlights && highlights.length) {
      html += `<div class="board-hl screen"><h3><span>SCR-03 · HALL OF HIGHLIGHTS</span><span class="term-dim">${highlights.length} FRAME${highlights.length === 1 ? '' : 'S'}</span></h3><div class="hl-strip">`;
      for (const h of highlights) html += `<figure><img src="${h.url}" alt=""><figcaption>${h.caption}</figcaption></figure>`;
      html += `</div></div>`;
    }
    html += `<div class="board-foot">&gt; Click a contract or press 1-${Math.max(1, offers.length)} · F / ESC to log off<span class="term-cursor">_</span></div>`;
    el.innerHTML = html;
    el.classList.add('term');
    el.style.setProperty('--fc', f.color);
    el.classList.remove('hidden');
    el.onclick = (ev) => {
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

  closeBoard() { $('board').classList.add('hidden'); }

  // ---- per-frame ----
  update(dt) {
    const g = this.game;
    const P = g.player;
    const ms = g.missions;

    if (this.alertT > 0 && (this.alertT -= dt) <= 0) $('alert').classList.add('hidden');
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) $('toast').classList.add('hidden');
    if (this.grabT > 0 && (this.grabT -= dt) <= 0) $('grab').classList.add('hidden');
    if (this.bannerT > 0 && (this.bannerT -= dt) <= 0) $('banner').classList.add('hidden');
    if (this.resultT > 0) { $('result').classList.remove('hidden'); if ((this.resultT -= dt) <= 0) $('result').classList.add('hidden'); }

    this.drawSpeedo(P.speed * 3.6);
    this.distressLog(dt);
    $('hp-fill').style.width = (P.health / P.maxHealth) * 100 + '%';
    $('en-fill').style.width = (P.body.energy / P.body.maxEnergy) * 100 + '%';
    const sk = $('skates');
    const on = P.body.skating;
    sk.textContent = on ? 'Q-LOCK: ENGAGED' : 'Q-LOCK: OFF (BOOTS)';
    sk.classList.toggle('on', on);
    $('credits').textContent = `₵${g.credits}`;
    const wi = P.weapon || 0;
    const wtxt = WEAPONS.map((w, i) => `<span class="${i === wi ? 'on' : ''} ${(!w.unlock || g.upgrades[w.unlock]) ? '' : 'locked'}">${i + 1}</span>`).join('') + ` ${WEAPONS[wi].name.toUpperCase()}`;
    if (wtxt !== this.lastW) { $('weaponchip').innerHTML = wtxt; this.lastW = wtxt; }
    const jt = g.alchemy ? g.alchemy.hudText() : '';
    if (jt !== this.lastJar) { $('jarchip').innerHTML = jt; $('jarchip').classList.toggle('hidden', !jt); this.lastJar = jt; }
    $('style').textContent = ms.active ? `STYLE +₵${ms.styleValue()}${ms.styleValue(false) >= ms.active.reward ? ' MAX' : ''}` : '';

    const mp = $('mission');
    if (ms.active) {
      const a = ms.active;
      const obj = ms.objective();
      mp.classList.remove('hidden');
      const t = Math.abs(ms.timer);
      const dist = obj ? arcDist(obj.pos, P.pos) : 0;
      mp.innerHTML = `<div class="m-head" style="background:${FACTIONS[a.faction].color}">CONTRACT · ${a.client}</div>
        <div class="m-cargo">${a.cargo.name}</div>
        <div class="m-obj">${obj ? obj.label : ''} <span>${(dist / 1000).toFixed(2)} km</span></div>
        <div class="m-row"><span class="m-timer ${ms.late || t < 15 ? 'low' : ''}">${ms.late ? 'LATE +' : ''}${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}</span>
        <span class="m-int">CARGO ${Math.round(ms.integrity * 100)}%</span></div>`;
    } else {
      mp.classList.add('hidden');
    }

    this.drawMinimap();
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

  // Heading-up local map: everything is projected onto the tangent plane around you.
  drawMinimap() {
    const g = this.game;
    const P = g.player;
    const c = this.mctx;
    const W = this.mini.width, H = this.mini.height;
    const range = 700;
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
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.lineWidth = 1;
    for (const cr of g.planet.craters) {
      if (cr.R < 30 || cr.d.dot(up) < 0.9) continue;
      const [x, y, d] = proj(cr.d);
      if (d > range + cr.R) continue;
      c.beginPath(); c.arc(x, y, cr.R * s, 0, Math.PI * 2); c.stroke();
    }
    for (const ev of g.events.list) {
      let [x, y, d] = proj(ev.stage || ev.start);
      if (d > range * 1.4) {
        // event radar (3 transponders to Dr. Zbornak): far events sit on the rim, pointing the way
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
    // an active meteor shower: a red warning zone
    const mw = g.meteors && g.meteors.warning;
    if (mw) {
      const [x, y, d] = proj(mw.dir);
      if (d < range + mw.r) {
        c.fillStyle = `rgba(255,79,46,${0.16 + 0.08 * Math.sin(performance.now() / 200)})`;
        c.strokeStyle = '#ff4f2e'; c.lineWidth = 2; c.setLineDash([6, 4]);
        c.beginPath(); c.arc(x, y, mw.r * s, 0, Math.PI * 2); c.fill(); c.stroke(); c.setLineDash([]);
      }
    }
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
    c.fillStyle = '#9be7ff';
    // wild moon mites show up as little green specks
    if (g.alchemy) {
      c.fillStyle = '#b8e986';
      for (const m of g.alchemy.mites) {
        if (!m.model || m.gone > 0) continue;
        const [x, y, d] = proj(m.pos);
        if (d < range) { c.beginPath(); c.arc(x, y, 2.2, 0, Math.PI * 2); c.fill(); }
      }
    }
    c.fillStyle = '#9be7ff';
    for (const v of g.world.vehicles) {
      const [x, y, d] = proj(v.pos);
      if (d < range) c.fillRect(x - 2, y - 2, 4, 4);
    }
    for (const e of g.enemies.list) {
      if (e.dead || (e.base && !e.base.awake) || e.kind === 'core') continue;
      const [x, y, d] = proj(e.body ? e.body.pos : e.center);
      if (d > range) continue;
      c.fillStyle = e.faction === 'pirate' ? (g.enemies.friendly(e) ? '#2ee6ff' : '#7dff3a') : e.kind === 'megamite' ? '#b8e986' : (e.base && e.base.hostile ? '#ff2a4a' : '#8a8aa0');
      c.beginPath(); c.arc(x, y, e.kind === 'megamite' ? 8 : e.carrying ? 6 : 3.5, 0, Math.PI * 2); c.fill();
      if (e.carrying) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); }
    }
    for (const d of g.enemies.drops) { const [x, y] = proj(d.pos); c.fillStyle = '#2ee6ff'; c.fillRect(x - 4, y - 4, 8, 8); }
    const obj = g.objective();
    if (obj) {
      let [x, y] = proj(obj.pos);
      x = Math.max(8, Math.min(W - 8, x)); y = Math.max(8, Math.min(H - 8, y));
      c.strokeStyle = '#ffd23f'; c.lineWidth = 3;
      c.beginPath(); c.arc(x, y, 9 + Math.sin(performance.now() / 150) * 2, 0, Math.PI * 2); c.stroke();
    }
    c.fillStyle = '#ff4f2e'; c.strokeStyle = '#fff'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(W / 2, H / 2 - 9); c.lineTo(W / 2 + 6, H / 2 + 7); c.lineTo(W / 2, H / 2 + 3); c.lineTo(W / 2 - 6, H / 2 + 7); c.closePath(); c.fill(); c.stroke();
  }

  updateArrow() {
    const g = this.game;
    const obj = g.objective();
    const el = $('obj-arrow');
    const mk = $('obj-marker');
    if (!obj || g.player.dead) { el.classList.add('hidden'); mk.classList.add('hidden'); return; }
    const up = obj.pos.clone().normalize();
    this.v.copy(g.planet.ground(up)).addScaledVector(up, 25).project(g.camera);
    const onScreen = this.v.z < 1 && Math.abs(this.v.x) < 0.95 && Math.abs(this.v.y) < 0.92;
    const dist = arcDist(obj.pos, g.player.pos);
    if (onScreen) {
      el.classList.add('hidden');
      mk.classList.remove('hidden');
      mk.style.left = ((this.v.x + 1) / 2) * 100 + '%';
      mk.style.top = ((1 - this.v.y) / 2) * 100 + '%';
      mk.querySelector('span').textContent = `${obj.label} · ${dist > 2000 ? (dist / 1000).toFixed(1) + 'km' : Math.round(dist) + 'm'}`;
    } else {
      // a drawn arrow (fonts can't drop it) with the distance, on a ring clear of the HUD panels
      if (!el.dataset.svg) {
        el.dataset.svg = '1';
        el.innerHTML = '<svg viewBox="0 0 64 64" width="64" height="64"><path d="M60 32 L14 8 L24 32 L14 56 Z" fill="#ffd23f" stroke="#120a1e" stroke-width="5" stroke-linejoin="round"/></svg><div class="oa-dist"></div>';
      }
      mk.classList.add('hidden');
      el.classList.remove('hidden');
      // beyond the horizon: point along the surface toward it
      const P = g.player;
      const t = obj.pos.clone().normalize().addScaledVector(P.up, -obj.pos.clone().normalize().dot(P.up));
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
      <div class="m-obj">${ev.status || ''}</div>
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

  dialog(title, text, buttons, onPick) {
    const el = $('dialog');
    el.innerHTML = `<div class="panel dlg"><div class="dlg-title">${title}</div><div class="bubble">${text}</div><div class="dlg-btns">${buttons.map((b, i) => `<button data-i="${i}">${b.label}</button>`).join('')}</div></div>`;
    el.classList.remove('hidden');
    el.onclick = (e) => {
      const b = e.target.closest('button');
      if (b) onPick(+b.dataset.i);
    };
  }

  closeDialog() { $('dialog').classList.add('hidden'); }

  // ---- reputation log ----
  openRepLog(g) {
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
        <div class="track rep-bar"><div class="fill" style="width:${pct}%;background:${f.color}"></div><div class="rep-zero"></div></div>
        <div class="rep-info">${f.blurb}</div>
        <div class="rep-meta">HQ: ${hq && hq.discovered ? hq.name : '???'} · Contract pay ×${(t.pay || 0).toFixed(2)}${nt ? ` · Next: ${nt.name} at ${nt.min}` : ''}${status ? ` · ${status}` : ''}</div>
        ${ev ? `<div class="rep-ev">📡 ${ev.state === 'active' ? 'ACTIVE' : 'OPEN'}: ${ev.title}</div>` : ''}
      </div>`;
    }
    html += `</div><div class="board-foot">Deliveries and events raise standing. Shooting a faction's people lowers it — and helping Vostok angers Daedalus (and vice versa). J / ESC to close.</div>`;
    el.innerHTML = html;
    el.classList.remove('hidden');
    el.onclick = (e) => { if (e.target.closest('[data-close]')) g.closeModal(false); };
  }
}
