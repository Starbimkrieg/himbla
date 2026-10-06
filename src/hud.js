import * as THREE from 'three';
import { FACTIONS } from './locations.js';
import { arcDist, anglesFromDir, darkness } from './geo.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.game = game;
    this.speedCanvas = $('speedo-dial');
    this.sctx = this.speedCanvas.getContext('2d');
    this.mini = $('minimap');
    this.mctx = this.mini.getContext('2d');
    this.bigMap = false;
    this.alertT = 0;
    this.toastT = 0;
    this.grabT = 0;
    this.bannerT = 0;
    this.v = new THREE.Vector3();
    this.lastSpeedTxt = '';
  }

  show(id, on = true) { $(id).classList.toggle('hidden', !on); }

  alert(text, color = '#ff2a4a', dur = 2.5) {
    const el = $('alert');
    el.textContent = text;
    el.style.background = color;
    el.classList.remove('hidden');
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
    this.alertT = dur;
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
    const kind = { hub: 'INTERNATIONAL HUB', civilian: 'CIVILIAN HABITAT', research: 'RESEARCH FACILITY', military: 'MILITARY — RESTRICTED', industrial: 'INDUSTRIAL OUTPOST', pirate: 'PIRATE TERRITORY' }[loc.type];
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
        <tr><td>Contract (${Math.round(info.integrity * 100)}% intact)</td><td>₵${info.integ}</td></tr>
        <tr><td>Speed bonus</td><td>₵${info.timeBonus}</td></tr>
        <tr><td>Style</td><td>₵${info.style}</td></tr>
        <tr class="tot"><td>TOTAL</td><td>₵${info.total}</td></tr>
      </table>
      <div class="r-rep">+1 rep with ${info.faction}</div>`;
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
  openBoard(loc, offers, { onAccept, onClose, shop, onBuy, upgrades, credits, active, onAbandon, highlights }) {
    const el = $('board');
    const f = FACTIONS[loc.faction];
    let html = `<div class="board-head" style="background:${f.color}"><span>${loc.name.toUpperCase()}</span><span class="board-right"><span class="board-credits">₵${credits}</span><button class="board-close" data-close="1">✕ CLOSE</button></span></div>`;
    if (active) {
      html += `<div class="board-active">ACTIVE: ${active.cargo.name} → ${active.to.name}<button data-abandon="1">ABANDON</button></div>`;
    }
    html += `<div class="board-cols">`;
    html += `<div class="board-jobs"><h3>CONTRACTS</h3>`;
    if (!offers.length) html += `<div class="empty">No contracts right now. Check back after your next run!</div>`;
    offers.forEach((o, i) => {
      const fc = FACTIONS[o.faction];
      const fr = '●'.repeat(Math.round(o.cargo.fragile * 3)) || '–';
      const hot = '☠'.repeat(o.cargo.hot) || '–';
      html += `<div class="job ${active ? 'disabled' : ''}" data-i="${i}">
        <div class="job-top"><span class="job-key">${i + 1}</span><span class="job-fac" style="background:${fc.color}">${fc.name}</span><span class="job-pay">₵${o.reward}</span></div>
        <div class="job-cargo">${o.cargo.name}</div>
        <div class="job-route">${o.pickup === o.board ? 'HERE' : o.pickup.name} → <b>${o.to.name}</b> · ${(o.dist / 1000).toFixed(1)} km · ${o.time}s</div>
        <div class="bubble"><b>${o.client}:</b> “${o.text}”</div>
        <div class="job-tags">Fragile ${fr} &nbsp; Pirate risk ${hot}${o.clearance ? ' &nbsp; <span class="clr">MILITARY CLEARANCE</span>' : ''}${o.dark ? ' &nbsp; <span class="darktag">☾ DARK SIDE · HAZARD PAY</span>' : ''}</div>
      </div>`;
    });
    html += `</div>`;
    if (shop) {
      html += `<div class="board-shop"><h3>REPAIR BAY UPGRADES</h3>`;
      for (const u of shop) {
        const lvl = upgrades[u.key];
        const maxed = lvl >= u.max;
        const cost = u.cost * (lvl + 1);
        html += `<div class="shop-item ${maxed || credits < cost ? 'disabled' : ''}" data-buy="${u.key}">
          <div class="job-top"><span>${u.name}</span><span class="job-pay">${maxed ? 'MAX' : '₵' + cost}</span></div>
          <div class="job-route">${u.desc}</div><div class="lvl">${'■'.repeat(lvl)}${'□'.repeat(u.max - lvl)}</div></div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
    if (highlights && highlights.length) {
      html += `<div class="board-hl"><h3>HALL OF HIGHLIGHTS</h3><div class="hl-strip">`;
      for (const h of highlights) html += `<figure><img src="${h.url}" alt=""><figcaption>${h.caption}</figcaption></figure>`;
      html += `</div></div>`;
    }
    html += `<div class="board-foot">Click a contract or press 1-${Math.max(1, offers.length)} · F / ESC / ✕ to close</div>`;
    el.innerHTML = html;
    el.classList.remove('hidden');
    el.onclick = (ev) => {
      const job = ev.target.closest('.job');
      const buy = ev.target.closest('[data-buy]');
      if (ev.target.closest('[data-close]')) { onClose(); return; }
      if (ev.target.closest('[data-abandon]')) { onAbandon(); return; }
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
    $('hp-fill').style.width = (P.health / P.maxHealth) * 100 + '%';
    $('en-fill').style.width = (P.body.energy / P.body.maxEnergy) * 100 + '%';
    const sk = $('skates');
    const on = P.body.skating;
    sk.textContent = on ? 'Q-LOCK: ENGAGED' : 'Q-LOCK: OFF (BOOTS)';
    sk.classList.toggle('on', on);
    $('credits').textContent = `₵${g.credits}`;
    $('style').textContent = ms.active ? `STYLE +${Math.round(ms.stylePool)}` : '';

    const mp = $('mission');
    if (ms.active) {
      const a = ms.active;
      const obj = ms.objective();
      mp.classList.remove('hidden');
      const t = Math.max(0, ms.timer);
      const dist = obj ? arcDist(obj.pos, P.pos) : 0;
      mp.innerHTML = `<div class="m-head" style="background:${FACTIONS[a.faction].color}">CONTRACT · ${a.client}</div>
        <div class="m-cargo">${a.cargo.name}</div>
        <div class="m-obj">${obj ? obj.label : ''} <span>${(dist / 1000).toFixed(2)} km</span></div>
        <div class="m-row"><span class="m-timer ${t < 15 ? 'low' : ''}">${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}</span>
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
    c.strokeStyle = '#120a1e';
    c.beginPath(); c.arc(cx, cy, R, a0, a1); c.stroke();
    const k = Math.min(1, kmh / maxK);
    const zones = [[0, 0.3, '#2ee6ff'], [0.3, 0.6, '#ffd23f'], [0.6, 1, '#ff2e88']];
    c.lineWidth = 12;
    for (const [s, e, col] of zones) {
      if (k <= s) break;
      c.strokeStyle = col;
      c.beginPath(); c.arc(cx, cy, R, a0 + s * Math.PI, a0 + Math.min(k, e) * Math.PI); c.stroke();
    }
    c.strokeStyle = '#120a1e';
    c.lineWidth = 3;
    for (let i = 0; i <= 10; i++) {
      const a = a0 + (i / 10) * Math.PI;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * (R - 14), cy + Math.sin(a) * (R - 14));
      c.lineTo(cx + Math.cos(a) * (R - 24), cy + Math.sin(a) * (R - 24));
      c.stroke();
    }
    const na = a0 + k * Math.PI;
    c.lineWidth = 6; c.strokeStyle = '#120a1e';
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(na) * (R - 6), cy + Math.sin(na) * (R - 6)); c.stroke();
    c.lineWidth = 3; c.strokeStyle = '#ff4f2e';
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(na) * (R - 8), cy + Math.sin(na) * (R - 8)); c.stroke();
    const txt = String(Math.round(kmh));
    if (txt !== this.lastSpeedTxt) {
      $('speed-num').textContent = txt;
      this.lastSpeedTxt = txt;
    }
  }

  // Heading-up local map: everything is projected onto the tangent plane around you.
  drawMinimap() {
    if (this.bigMap) { this.drawMoonMap(); return; }
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
    for (const l of g.locations) {
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
      c.font = '12px Bangers, Impact, sans-serif';
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.strokeText(l.short, x, y - 10); c.fillText(l.short, x, y - 10);
    }
    c.fillStyle = '#9be7ff';
    for (const v of g.world.vehicles) {
      const [x, y, d] = proj(v.pos);
      if (d < range) c.fillRect(x - 2, y - 2, 4, 4);
    }
    for (const e of g.enemies.list) {
      if (e.dead || (e.faction === 'mil' && !e.base.awake)) continue;
      const [x, y, d] = proj(e.body ? e.body.pos : e.center);
      if (d > range) continue;
      c.fillStyle = e.faction === 'pirate' ? '#7dff3a' : (e.base.hostile ? '#ff2a4a' : '#8a8aa0');
      c.beginPath(); c.arc(x, y, e.carrying ? 6 : 3.5, 0, Math.PI * 2); c.fill();
      if (e.carrying) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); }
    }
    for (const d of g.enemies.drops) { const [x, y] = proj(d.pos); c.fillStyle = '#2ee6ff'; c.fillRect(x - 4, y - 4, 8, 8); }
    const obj = g.missions.objective();
    if (obj) {
      let [x, y] = proj(obj.pos);
      x = Math.max(8, Math.min(W - 8, x)); y = Math.max(8, Math.min(H - 8, y));
      c.strokeStyle = '#ffd23f'; c.lineWidth = 3;
      c.beginPath(); c.arc(x, y, 9 + Math.sin(performance.now() / 150) * 2, 0, Math.PI * 2); c.stroke();
    }
    c.fillStyle = '#ff4f2e'; c.strokeStyle = '#fff'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(W / 2, H / 2 - 9); c.lineTo(W / 2 + 6, H / 2 + 7); c.lineTo(W / 2, H / 2 + 3); c.lineTo(W / 2 - 6, H / 2 + 7); c.closePath(); c.fill(); c.stroke();
  }

  // Whole-moon map: centred on the sub-solar point; the outer ring is the dark side.
  drawMoonMap() {
    const g = this.game;
    const c = this.mctx;
    const W = this.mini.width, H = this.mini.height;
    const Rm = W / 2 - 14;
    const toXY = (d) => {
      const { theta, phi } = anglesFromDir(this.v.copy(d).normalize());
      const r = (theta / Math.PI) * Rm;
      return [W / 2 + Math.cos(phi) * r, H / 2 - Math.sin(phi) * r];
    };
    c.fillStyle = '#05030c';
    c.fillRect(0, 0, W, H);
    const grad = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Rm);
    grad.addColorStop(0, '#5a4f86'); grad.addColorStop(0.45, '#3b3260'); grad.addColorStop(0.55, '#15111f'); grad.addColorStop(1, '#07050d');
    c.fillStyle = grad;
    c.beginPath(); c.arc(W / 2, H / 2, Rm, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#ffd23f'; c.setLineDash([6, 6]); c.lineWidth = 1.5;
    c.beginPath(); c.arc(W / 2, H / 2, Rm / 2, 0, Math.PI * 2); c.stroke();
    c.setLineDash([]);
    c.font = '13px Bangers, Impact, sans-serif'; c.textAlign = 'center';
    c.fillStyle = '#ffd23f'; c.fillText('TERMINATOR', W / 2, H / 2 - Rm / 2 - 4);
    c.fillStyle = '#8a84a8'; c.fillText('☾ DARK SIDE ☾', W / 2, H / 2 - Rm * 0.8);
    for (const l of g.locations) {
      const [x, y] = toXY(l.dir);
      c.fillStyle = FACTIONS[l.faction].color;
      c.strokeStyle = '#120a1e'; c.lineWidth = 3;
      c.beginPath(); c.arc(x, y, l.zoneR ? 7 : 5, 0, Math.PI * 2); c.fill(); c.stroke();
      c.font = '13px Bangers, Impact, sans-serif';
      c.fillStyle = '#fff';
      c.strokeText(l.short, x, y - 9); c.fillText(l.short, x, y - 9);
    }
    const obj = g.missions.objective();
    if (obj) {
      const [x, y] = toXY(obj.pos);
      c.strokeStyle = '#ffd23f'; c.lineWidth = 3;
      c.beginPath(); c.arc(x, y, 11 + Math.sin(performance.now() / 150) * 2, 0, Math.PI * 2); c.stroke();
    }
    const [px, py] = toXY(g.player.pos);
    c.fillStyle = '#ff4f2e'; c.strokeStyle = '#fff'; c.lineWidth = 2;
    c.beginPath(); c.arc(px, py, 6, 0, Math.PI * 2); c.fill(); c.stroke();
  }

  updateArrow() {
    const g = this.game;
    const obj = g.missions.objective();
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
      mk.classList.add('hidden');
      el.classList.remove('hidden');
      // beyond the horizon: point along the surface toward it
      const P = g.player;
      const t = obj.pos.clone().normalize().addScaledVector(P.up, -obj.pos.clone().normalize().dot(P.up));
      let x = t.dot(g.cam.right), yy = t.dot(g.cam.fwd);
      const a = Math.atan2(yy, x);
      const r = 0.82;
      const ex = Math.cos(a), ey = Math.sin(a);
      const k = r / Math.max(Math.abs(ex), Math.abs(ey));
      el.style.left = ((ex * k + 1) / 2) * 100 + '%';
      el.style.top = ((1 - ey * k) / 2) * 100 + '%';
      el.style.transform = `translate(-50%,-50%) rotate(${-a}rad)`;
    }
  }
}
