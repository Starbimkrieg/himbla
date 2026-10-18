import { OUTFITS, SKATES } from './cosmetics.js';
import { pixelFont } from './fonts.js';
import { CasinoGames } from './casinoGames.js';
import { glyphHtml } from './glyphs.js';
import { px, pxCanvas } from './pixelIcons.js';

// The Lucky Crater Casino: slots, roulette, prize wheel, high-low and a prize counter in one overlay.
// State lives in game.stats.casino.

// Casino-only cosmetics: no `shop`/`cost`, so faction shops skip them; the wardrobe (C) shows them once
// owned via game.upgrades['outfit_<id>' / 'skates_<id>'].
Object.assign(OUTFITS, {
  loungelizard: { name: 'Lounge Lizard Tux', casino: true, suit: 0x16121f, accent: 0xffd23f, helmet: 0xf4f1ff, visor: 0xff2e88, scarf: 0xd7263d, sc: [0.7, 0.28, 2] },
  highroller: { name: 'High Roller Gold Lamé', casino: true, suit: 0xffc83a, accent: 0xff2e88, helmet: 0xffe27a, visor: 0x120a1e, scarf: 0xff2e88, sc: [1.9, 0.34, 2], extras: ['halo'] },
  moonroyal: { name: 'Moon Royalty Regalia', casino: true, suit: 0x5a1a8f, accent: 0xffd23f, helmet: 0xffd23f, visor: 0x2ee6ff, scarf: 0xffffff, sc: [2.1, 0.4, 2], extras: ['crest', 'pads'] },
});
Object.assign(SKATES, {
  felt: { name: 'Lucky Felt Rollers', casino: true, color: 0x1f8a4a, trail: 0x7dff6a, coins: 'chips', tone: 'glide' },
  jackpot: { name: 'Jackpot Rollers', casino: true, color: 0xffd23f, trail: 0xfff6a8, coins: 'gold', tone: 'jackpot' },
});

const VIP = [
  { name: 'BRONZE', min: 0, max: 250, color: '#e0975a' },
  { name: 'SILVER', min: 2000, max: 1000, color: '#dfe6f2' },
  { name: 'GOLD', min: 10000, max: 2500, color: '#ffd23f' },
  { name: 'PLATINUM', min: 40000, max: 10000, color: '#9be7ff' },
  { name: 'MOON ROYALTY', min: 150000, max: 50000, color: '#c77dff' },
];
const BETS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];
// two venues with their own screens: the classic cabinets' tabs, and the prize counter's single page
const TABS = [['slots', 'LUNAR SLOTS'], ['roulette', 'CRATER ROULETTE'], ['wheel', 'PRIZE WHEEL'], ['hilo', 'HIGH-LOW']];
const PRIZE_TABS = [['prizes', 'PRIZE COUNTER']];
const DEFAULTS = { wagered: 0, won: 0, biggest: 0, spins: 0, hands: 0, bjs: 0, bestStreak: 0, chips: 0, chipFrac: 0, jackpot: 2500, lastFree: 0, visits: 0, ducks: 0, plinko: 0 };
const CHIP_RATE = 50; // credits wagered per Lucky Chip
const FREE_SPIN_MS = 10 * 60 * 1000;

// ---------- slots ----------
const SYMS = { // pictures: the same-named pixel sprites (pixelIcons.js)
  moon: { w: 13 }, comet: { w: 9 }, rocket: { w: 7 }, alien: { w: 5 }, ufo: { w: 4 }, diamond: { w: 2 }, wild: { w: 2 },
};
const SYM_IDS = Object.keys(SYMS);
const SYM_TOTAL = SYM_IDS.reduce((a, k) => a + SYMS[k].w, 0);
const PAY3 = { moon: 3, comet: 7, rocket: 13, alien: 25, ufo: 50, wild: 150 };
const JACKPOT_SEED = 2500;
const JACKPOT_CUT = 0.03;
const JACKPOT_FULL_BET = 100;

function rollSym() {
  let r = Math.random() * SYM_TOTAL;
  for (const k of SYM_IDS) if ((r -= SYMS[k].w) < 0) return k;
  return 'moon';
}

// { mult, jackpot }. Wilds stand in for all but diamonds. Base RTP ≈ 91.6%, ~95% with the jackpot.
function evalSlots(r) {
  const d = r.filter((s) => s === 'diamond').length;
  if (d === 3) return { mult: 0, jackpot: true, kind: 'JACKPOT' };
  const nw = r.filter((s) => s !== 'wild');
  if (!nw.includes('diamond') && nw.every((s) => s === (nw[0] || 'wild'))) return { mult: PAY3[nw[0] || 'wild'], kind: 'three' };
  if (d === 2) return { mult: 2.5, kind: 'two diamonds' };
  if (r.filter((s) => s === 'moon' || s === 'wild').length === 2) return { mult: 1, kind: 'two moons' };
  return { mult: 0 };
}

// ---------- cards ----------
const SUITS = ['S', 'H', 'D', 'C'];
const SUIT_SPRITE = { S: 'spade', H: 'heart', D: 'diamondsuit', C: 'club' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const hiloRank = (c) => (c.r === 'A' ? 14 : c.r === 'K' ? 13 : c.r === 'Q' ? 12 : c.r === 'J' ? 11 : +c.r);

// ---------- roulette ----------
const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const OUTSIDE = {
  low: ['1–18', (n) => n >= 1 && n <= 18, 2], even: ['EVEN', (n) => n && n % 2 === 0, 2], red: ['RED', (n) => REDS.has(n), 2],
  black: ['BLACK', (n) => n && !REDS.has(n), 2], odd: ['ODD', (n) => n % 2 === 1, 2], high: ['19–36', (n) => n >= 19, 2],
  d1: ['1st 12', (n) => n >= 1 && n <= 12, 3], d2: ['2nd 12', (n) => n >= 13 && n <= 24, 3], d3: ['3rd 12', (n) => n >= 25, 3],
};
const numColor = (n) => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');

// ---------- prize wheel ----------
const PRIZES = [
  { label: 'NOTHING lol', w: 14, kind: 'nothing', color: '#3a3550' },
  { label: '₵25', w: 16, kind: 'cr', n: 25, color: '#2ee6ff' },
  { label: '5 CHIPS', w: 10, kind: 'chips', n: 5, color: '#7dff6a' },
  { label: '₵100', w: 11, kind: 'cr', n: 100, color: '#ff9f1c' },
  { label: 'NOTHING lol', w: 12, kind: 'nothing', color: '#3a3550' },
  { label: '₵50', w: 14, kind: 'cr', n: 50, color: '#ff2e88' },
  { label: 'DRIP', w: 2, kind: 'cosmetic', color: '#c77dff' },
  { label: '₵250', w: 6, kind: 'cr', n: 250, color: '#ffd23f' },
  { label: '15 CHIPS', w: 5, kind: 'chips', n: 15, color: '#7dff6a' },
  { label: '₵500', w: 3, kind: 'cr', n: 500, color: '#ff2a4a' },
  { label: 'MEGA', w: 1, kind: 'mega', n: 5000, color: '#fff6a8' },
];
const PRIZE_TOTAL = PRIZES.reduce((a, p) => a + p.w, 0);
const WHEEL_PX = 640; // wheel canvas size (scaled to fit by style.css .pw-wrap)
const WHEEL_COST = 150;

// ---------- prize counter ----------
const SHOP = [
  { key: 'skates_felt', kind: 'skates', id: 'felt', chips: 40, tier: 0, desc: 'Green-felt skates with a lucky lime trail.' },
  { key: 'outfit_loungelizard', kind: 'outfit', id: 'loungelizard', chips: 75, tier: 1, desc: 'Black tux, gold trim, red bow-scarf. Smooth.' },
  { key: 'skates_jackpot', kind: 'skates', id: 'jackpot', chips: 150, tier: 2, desc: 'Solid gold. Sprays sparks like a paying machine.' },
  { key: 'outfit_highroller', kind: 'outfit', id: 'highroller', chips: 250, tier: 2, desc: 'Gold lamé suit, a halo and a long twin-tailed scarf. Subtle it is not.' },
  { key: 'outfit_moonroyal', kind: 'outfit', id: 'moonroyal', chips: 500, tier: 4, desc: 'Purple and gold regalia for Moon Royalty only.' },
];
const EXCHANGE = { chips: 10, credits: 150 };

// ---------- the pit boss ----------
const LINES = {
  greet: ['Welcome to the Lucky Crater, kid. The house always wins. Usually.', 'Step right up! Low gravity, high stakes!', 'Ah, a courier. Couriers tip well. Couriers LOSE well.', 'Air\'s free. Everything else costs.', 'No helmets on the tables. Kidding. Keep your helmet on. Vacuum.'],
  win: ['Huh. Beginner\'s luck.', 'Don\'t get used to it.', 'Nice. Now give it back.', 'The odds are just warming up.', 'See? Winning is easy. Do it again.', 'A winner! Somebody take a photo for the wall.'],
  big: ['WHOA! Somebody check that machine!', 'Security! …No wait, that\'s legit. Ugh.', 'That\'s coming out of MY bonus!', 'Now THAT\'s a moonshot!', 'I need to sit down. I AM sitting down. I need to sit down more.'],
  lose: ['The house thanks you for your donation.', 'Close! …Not really, but close.', 'Gravity\'s low. So are your odds.', 'Have you tried winning?', 'Keep going, you\'re due! (You are not due.)', 'That one\'s going toward the new chandelier.', 'Ooh. Unlucky. Again?'],
  broke: ['Outta credits? Go deliver some packages and come back rich.', 'No credits, no service. Those are the rules. I made them.', 'Or come back poor. I\'m easy.'],
  jackpot: ['JACKPOT?! I\'m calling my mom. I\'m calling YOUR mom!', 'THE MACHINE IS SCREAMING! THE MACHINE IS SCREAMING!'],
  nothing: ['NOTHING! Ha! That\'s my favourite slice.', 'It says "lol" right on it, kid.', 'The wheel giveth. Mostly the wheel taketh.'],
  vip: ['VIP upgrade! I\'ll have them warm up the velvet rope.', 'A high roller! I knew it the moment you skated in.'],
  wait: ['Easy, easy — let it finish!', 'Patience. The Moon wasn\'t built in a day.'],
  shop: ['Lookin\' sharp! Very… expensive.', 'Drip acquired. The Moon salutes you.'],
};

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Casino {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('casino');
    this.tab = 'slots';
    this.tabs = TABS;
    this.venue = 'classic';
    this.bet = 10;
    this.busy = false;
    this.auto = 0;
    this.shown = game.credits;
    this.reels = [['moon', 'rocket', 'comet'], ['ufo', 'alien', 'moon'], ['comet', 'diamond', 'rocket']];
    this.shoe = [];
    this.rl = { bets: {}, rot: 0, ball: 0, history: [] };
    this.wheelRot = 0;
    this.hl = { phase: 'idle', card: null, pot: 0, stake: 0, streak: 0 };
    this.lastSay = '';
    this.mode = null; // seated walk-in 3D game ('bj' | 'duck' | 'plinko') or null
    if (this.el) this.build();
    this.games = new CasinoGames(game, this);
  }

  // saved state, defaults filled in for older saves
  get st() {
    const g = this.game;
    const s = g.stats.casino || (g.stats.casino = {});
    for (const k in DEFAULTS) if (s[k] === undefined) s[k] = DEFAULTS[k];
    for (const k of ['debt', 'debtAt', 'loans']) delete s[k]; // removed feature's keys; old balances are forgiven
    return s;
  }

  get audio() { return this.game.audio; }

  near(p) {
    const c = this.game.world.casino;
    return !!c && c.loc.active && c.near(p);
  }

  // walk-in casino: prompt + F at a station. True when it owns the prompt.
  interact() {
    const g = this.game;
    if (!this.games || !this.games.ok) return false;
    const s = this.games.stationAt(g.player.pos);
    if (!s) return false;
    g.hud.prompt(`<b>F</b> — ${s.label}`);
    if (g.input.pressed('KeyF') && g.boardCooldown <= 0) {
      if (s.id === 'classic') this.open();
      else if (s.id === 'prizes') this.open('prizes'); else this.sit(s.id);
    }
    return true;
  }

  // sit down at one of the 3D games (modal state 'casino', no overlay)
  sit(id) {
    const g = this.game;
    g.openModal('casino');
    this.mode = id;
    const s = this.st;
    s.visits++;
    if (s.visits === 1) { s.chips += 10; g.fx.pop('WELCOME GIFT: 10 LUCKY CHIPS!', null, { color: '#7dff6a', size: 30, life: 2.2 }); }
    this.clampBet();
    this.games.enter(id);
  }

  // ---------- open / close / keys ----------
  open(venue = 'classic') {
    const g = this.game;
    g.openModal('casino');
    this.venue = venue;
    this.tabs = venue === 'prizes' ? PRIZE_TABS : TABS;
    this.tab = venue === 'prizes' ? 'prizes' : (this.tab === 'prizes' ? 'slots' : this.tab);
    this.root.classList.toggle('venue-prizes', venue === 'prizes');
    this.$('.cas-tabs').innerHTML = this.tabs.map(([id, name], i) => `<button data-tab="${id}"><i>${i + 1}</i>${name}</button>`).join('');
    this.el.classList.remove('hidden');
    const s = this.st;
    s.visits++;
    if (s.visits === 1) { s.chips += 10; this.welcome = true; }
    this.clampBet();
    this.shown = g.credits;
    this.refresh(true);
    this.renderTab();
    this.say('greet');
    [392, 523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.audio.tone(f, 0.16, 'triangle', 0.12), i * 70));
    if (this.welcome) { this.welcome = false; setTimeout(() => this.burst('WELCOME GIFT: 10 LUCKY CHIPS!', { color: '#7dff6a', size: 46 }), 400); }
    clearInterval(this.clock);
    this.clock = setInterval(() => this.tickClock(), 1000);
  }

  close(viaEscape) {
    if (this.mode) {
      this.games.leave();
      this.mode = null;
      this.game.save();
      this.game.closeModal(viaEscape);
      return;
    }
    this.auto = 0;
    clearInterval(this.clock);
    this.el.classList.add('hidden');
    this.game.save();
    this.game.closeModal(viaEscape);
  }

  onKey(code) {
    if (this.mode) { this.games.onKey(code); return; }
    const n = parseInt(code.replace('Digit', ''), 10);
    if (code.startsWith('Digit') && n >= 1 && n <= this.tabs.length) { this.setTab(this.tabs[n - 1][0]); return; }
    if (code === 'ArrowLeft' || code === 'Minus') { this.stepBet(-1); return; }
    if (code === 'ArrowRight' || code === 'Equal') { this.stepBet(1); return; }
    const go = code === 'Space' || code === 'Enter';
    switch (this.tab) {
      case 'slots': if (go) this.spinSlots(); else if (code === 'KeyA') this.autoSpin(); break;
      case 'roulette':
        if (go) this.spinRoulette();
        else if (code === 'Backspace' || code === 'KeyC') this.clearBets();
        else if ({ KeyR: 'red', KeyB: 'black', KeyO: 'odd', KeyE: 'even' }[code]) this.placeBet({ KeyR: 'red', KeyB: 'black', KeyO: 'odd', KeyE: 'even' }[code]);
        break;
      case 'wheel': if (go) this.spinWheel(this.freeReady()); else if (code === 'KeyP') this.spinWheel(false); break;
      case 'hilo':
        if (code === 'Space' && this.hl.phase !== 'play') this.hlStart();
        else if (code === 'ArrowUp' || code === 'KeyW') this.hlGuess('hi');
        else if (code === 'ArrowDown' || code === 'KeyS') this.hlGuess('lo');
        else if (code === 'KeyF') this.hlGuess('flip');
        else if (code === 'Enter' || code === 'KeyC') this.hlCash();
        break;
    }
  }

  // ---------- money ----------
  tierIdx(w = this.st.wagered) { let i = 0; VIP.forEach((t, k) => { if (w >= t.min) i = k; }); return i; }
  get tier() { return VIP[this.tierIdx()]; }
  get maxBet() { return this.tier.max; }

  // deduct a stake; false (and a complaint) if you can't cover it
  take(n) {
    const g = this.game, s = this.st;
    if (n > g.credits) {
      this.say('broke');
      this.flash('NOT ENOUGH CREDITS!');
      this.audio.tone(140, 0.25, 'square', 0.12);
      return false;
    }
    const before = this.tierIdx();
    g.credits -= n;
    s.wagered += n;
    s.chipFrac += n / CHIP_RATE;
    const c = Math.floor(s.chipFrac);
    s.chipFrac -= c;
    s.chips += c;
    const after = this.tierIdx();
    if (after > before) setTimeout(() => this.vipUp(after), 900);
    this.refresh();
    return true;
  }

  pay(n, stake = 0) {
    if (n <= 0) return;
    const g = this.game, s = this.st;
    g.credits += Math.floor(n);
    s.won += Math.floor(n);
    if (n - stake > s.biggest) s.biggest = Math.floor(n - stake);
    this.refresh();
    this.float(`+₵${fmt(n)}`, '#7dff6a');
  }

  vipUp(i) {
    this.burst(`VIP ${VIP[i].name}!`, { color: VIP[i].color, size: 80, confetti: 90 });
    this.say('vip');
    this.fanfare();
    this.renderTab();
  }

  clampBet() {
    if (this.bet > this.maxBet) this.bet = this.maxBet;
    if (this.bet < BETS[0]) this.bet = BETS[0];
  }

  stepBet(d) {
    const list = BETS.filter((b) => b <= this.maxBet);
    const i = Math.max(0, list.indexOf(this.bet));
    this.bet = list[Math.min(list.length - 1, Math.max(0, i + d))];
    this.audio.tone(d > 0 ? 1700 : 1300, 0.05, 'triangle', 0.08);
    this.refresh();
  }

  // ---------- DOM skeleton ----------
  build() {
    this.el.innerHTML = `<div class="cas">
      <div class="cas-bulbs"></div>
      <header class="cas-head">
        <div class="cas-logo">LUCKY CRATER <span>CASINO</span></div>
        <div class="cas-meters">
          <div class="cas-cred" data-cred>₵0</div>
          <div class="cas-chips" title="Lucky Chips: earned by playing (1 per ₵${CHIP_RATE} wagered). Spend them at the Prize Counter.">${px('chip', 'ico')} <b data-chips>0</b></div>
          <div class="cas-vip" data-vip></div>
        </div>
        <button class="cas-x" data-act="close">X LEAVE <small>ESC</small></button>
      </header>
      <div class="cas-boss"><div class="cas-face">${px('lizard')}</div><div class="cas-say"><b>VINNIE "THE VISOR"</b>, PIT BOSS<p data-say></p></div><div class="cas-jp">PROGRESSIVE JACKPOT<b data-jp>₵0</b></div></div>
      <nav class="cas-tabs"></nav>
      <div class="cas-body" data-body></div>
      <footer class="cas-foot">
        <div class="cas-bet"><button data-act="betdown">◀</button><span>BET <b data-bet>₵10</b></span><button data-act="betup">▶</button><small data-max></small></div>
        <div class="cas-stats" data-stats></div>
      </footer>
      <div class="cas-fx" data-fx></div>
    </div>`;
    this.$ = (q) => this.el.querySelector(q);
    this.root = this.$('.cas');
    // never take focus, or keyboard shortcuts would re-click a focused button
    this.el.addEventListener('mousedown', (e) => e.preventDefault());
    this.el.addEventListener('click', (e) => this.onClick(e));
  }

  onClick(e) {
    const t = e.target.closest('[data-act],[data-tab],[data-rb],[data-buy],[data-wear]');
    if (!t || !this.el.contains(t)) return;
    const d = t.dataset;
    if (d.tab) return this.setTab(d.tab);
    if (d.rb) return this.placeBet(d.rb);
    if (d.buy) return this.buyPrize(d.buy);
    if (d.wear) return this.wear(d.wear);
    switch (d.act) {
      case 'close': this.close(false); break;
      case 'betdown': this.stepBet(-1); break;
      case 'betup': this.stepBet(1); break;
      case 'spin': this.spinSlots(); break;
      case 'auto': this.autoSpin(); break;
      case 'rspin': this.spinRoulette(); break;
      case 'rclear': this.clearBets(); break;
      case 'wfree': this.spinWheel(true); break;
      case 'wpaid': this.spinWheel(false); break;
      case 'hstart': this.hlStart(); break;
      case 'hhi': this.hlGuess('hi'); break;
      case 'hlo': this.hlGuess('lo'); break;
      case 'hflip': this.hlGuess('flip'); break;
      case 'hcash': this.hlCash(); break;
      case 'exchange': this.exchange(); break;
    }
  }

  setTab(id) {
    if (id === this.tab || !this.tabs.some(([t]) => t === id)) return;
    if (this.busy || this.hl.phase === 'play') {
      this.say('wait');
      this.shake(true);
      return;
    }
    this.auto = 0;
    this.tab = id;
    this.audio.click();
    this.renderTab();
  }

  // header, footer, credits ticker
  refresh(instant = false) {
    if (!this.root) return;
    const g = this.game, s = this.st, t = this.tier, ti = this.tierIdx();
    this.clampBet();
    const next = VIP[ti + 1];
    const prog = next ? (s.wagered - t.min) / (next.min - t.min) : 1;
    this.$('[data-vip]').innerHTML = `<span style="background:${t.color}">VIP · ${t.name}</span><div class="cas-prog"><div style="width:${Math.min(100, prog * 100)}%"></div></div><small>${next ? `₵${fmt(next.min - s.wagered)} to ${next.name}` : 'TOP OF THE MOON'}</small>`;
    this.$('[data-chips]').textContent = fmt(s.chips);
    this.$('[data-jp]').textContent = `₵${fmt(s.jackpot)}`;
    this.$('[data-bet]').textContent = `₵${fmt(this.bet)}`;
    this.$('[data-max]').textContent = `MAX ₵${fmt(this.maxBet)} · ◀ ▶ KEYS`;
    const net = s.won - s.wagered;
    this.$('[data-stats]').innerHTML = `WAGERED <b>₵${fmt(s.wagered)}</b> · NET <b class="${net >= 0 ? 'up' : 'down'}">${net >= 0 ? '+' : '−'}₵${fmt(Math.abs(net))}</b> · BIGGEST WIN <b>₵${fmt(s.biggest)}</b>`;
    for (const b of this.el.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === this.tab);
    this.tickCredits(instant);
  }

  tickCredits(instant) {
    const el = this.$('[data-cred]');
    const target = this.game.credits;
    cancelAnimationFrame(this.tickRaf);
    if (instant || target === this.shown) { this.shown = target; el.textContent = `₵${fmt(target)}`; return; }
    const from = this.shown, t0 = performance.now(), dur = Math.min(1200, 300 + Math.abs(target - from) / 4);
    el.classList.remove('up', 'down'); void el.offsetWidth;
    el.classList.add(target > from ? 'up' : 'down');
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      this.shown = from + (target - from) * (1 - Math.pow(1 - k, 3));
      el.textContent = `₵${fmt(this.shown)}`;
      if (k < 1) this.tickRaf = requestAnimationFrame(step);
      else this.shown = target;
    };
    step();
  }

  tickClock() {
    if (this.tab === 'wheel') this.updateWheelButtons();
  }

  say(kind, text) {
    const el = this.$('[data-say]');
    if (!el) return;
    let line = text || pick(LINES[kind] || LINES.greet);
    if (!text && line === this.lastSay) line = pick(LINES[kind] || LINES.greet);
    this.lastSay = line;
    el.textContent = line;
    const b = this.$('.cas-boss');
    b.classList.remove('talk'); void b.offsetWidth; b.classList.add('talk');
  }

  // ---------- juice ----------
  burst(text, { color = '#ffd23f', size = 90, confetti = 0, shake = false } = {}) {
    const fx = this.$('[data-fx]');
    const el = document.createElement('div');
    el.className = 'cas-burst';
    el.innerHTML = `<div class="rays"></div><span style="color:${color};font-size:${Math.round(size * 0.55)}px">${text}</span>`;
    fx.appendChild(el);
    setTimeout(() => el.remove(), 1900);
    if (confetti) this.confetti(confetti);
    if (shake) this.shake(true);
  }

  flash(text) {
    const fx = this.$('[data-fx]');
    const el = document.createElement('div');
    el.className = 'cas-flash';
    el.textContent = text;
    fx.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  float(text, color) {
    const fx = this.$('[data-fx]');
    const el = document.createElement('div');
    el.className = 'cas-float';
    el.style.color = color;
    el.textContent = text;
    fx.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  confetti(n) {
    const fx = this.$('[data-fx]');
    const cols = ['#ffd23f', '#ff2e88', '#2ee6ff', '#7dff6a', '#c77dff', '#fff4e0'];
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      c.className = 'cas-conf';
      const coin = Math.random() < 0.3;
      c.textContent = coin ? '₵' : '';
      if (coin) c.classList.add('coin');
      c.style.left = Math.random() * 100 + '%';
      c.style.background = coin ? '' : pick(cols);
      c.style.setProperty('--dx', (Math.random() * 300 - 150) + 'px');
      c.style.setProperty('--r', (Math.random() * 1440 - 720) + 'deg');
      c.style.animationDuration = 1.4 + Math.random() * 1.6 + 's';
      c.style.animationDelay = Math.random() * 0.5 + 's';
      fx.appendChild(c);
      setTimeout(() => c.remove(), 3800);
    }
  }

  shake(small) {
    this.root.classList.remove('shake', 'shake-s'); void this.root.offsetWidth;
    this.root.classList.add(small ? 'shake-s' : 'shake');
  }

  fanfare() {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.audio.tone(f, 0.22, 'square', 0.1), i * 90));
    setTimeout(() => this.audio.cash(), 650);
  }

  sadTrombone() {
    [392, 370, 349].forEach((f, i) => setTimeout(() => this.audio.tone(f, 0.3, 'sawtooth', 0.08), i * 280));
    setTimeout(() => this.audio.tone(330, 0.8, 'sawtooth', 0.08, 0.92), 840);
  }

  // celebrate in proportion to win / stake
  celebrate(win, stake) {
    const m = win / Math.max(1, stake);
    if (m >= 10) {
      this.burst(pick(['KA-CHING!!', 'BIG WIN!!', 'MOONSHOT!!', 'KA-BLAMMO!!']), { size: 110, confetti: 80, shake: true });
      this.fanfare();
      this.say('big');
    } else if (m >= 2) {
      this.burst(pick(['WIN!', 'NICE!', 'ZING!', 'CHA-CHING!']), { size: 80, confetti: 25 });
      this.audio.cash();
      if (Math.random() < 0.6) this.say('win');
    } else if (win > 0) {
      this.burst(m > 1 ? 'WIN!' : 'MONEY BACK!', { color: '#2ee6ff', size: 60 });
      this.audio.tone(880, 0.12, 'triangle', 0.12);
    }
  }

  lost(text = pick(['NOPE!', 'WHIFF!', 'BZZT!', 'OOF!'])) {
    if (text) this.flash(text);
    this.audio.tone(220, 0.25, 'sawtooth', 0.08, 0.6);
    if (Math.random() < 0.35) this.say('lose');
  }

  renderTab() {
    const body = this.$('[data-body]');
    body.className = `cas-body tab-${this.tab}`;
    body.innerHTML = this[`html_${this.tab}`]();
    if (this.tab === 'slots') this.drawReels();
    if (this.tab === 'roulette') this.drawRoulette();
    if (this.tab === 'wheel') this.drawWheel();
    if (this.tab === 'hilo') this.drawHilo();
    this.refresh();
  }

  // ================= LUNAR SLOTS =================
  html_slots() {
    const row = (syms, pay) => `<div class="pt-row"><span>${syms}</span><b>×${pay}</b></div>`;
    const trio = (id) => px(id, 'sm').repeat(3);
    const duo = (id) => `<em>ANY</em>${px(id, 'sm').repeat(2)}`;
    return `<div class="slots">
      <div class="slot-machine">
        <div class="slot-top">${px('star', 'ico')}<span>LUNAR SLOTS</span>${px('star', 'ico')}</div>
        <div class="reels">${[0, 1, 2].map((i) => `<div class="reel" data-reel="${i}"><div class="strip"></div></div>`).join('')}<div class="payline"><i></i><i></i></div></div>
        <div class="slot-win" data-swin>PULL THE LEVER, LOSER. I MEAN, LEGEND.</div>
        <div class="slot-ctl"><button class="big" data-act="spin">SPIN <small>SPACE</small></button><button data-act="auto">AUTO ×10 <small>A</small></button></div>
        <div class="lever" data-act="spin"><i></i></div>
      </div>
      <div class="paytable">
        <div class="pt-head">PAYTABLE <small>× BET</small></div>
        <div class="pt-row jp"><span>${trio('diamond')}</span><b>JACKPOT</b></div>
        ${row(trio('wild'), PAY3.wild)}${row(trio('ufo'), PAY3.ufo)}${row(trio('alien'), PAY3.alien)}${row(trio('rocket'), PAY3.rocket)}${row(trio('comet'), PAY3.comet)}${row(trio('moon'), PAY3.moon)}
        ${row(duo('diamond'), 2.5)}${row(duo('moon'), 1)}
        <p class="fine">${px('wild', 'ico')} WILD stands in for anything but ${px('diamond', 'ico')}. The jackpot pays in full on bets of ₵${JACKPOT_FULL_BET}+ (bet / ₵${JACKPOT_FULL_BET} share below that). ${Math.round(JACKPOT_CUT * 100)}% of every spin feeds the pot.</p>
      </div>
    </div>`;
  }

  cell(id) { return `<div class="cell s-${id}">${px(id)}${id === 'wild' ? '<small>WILD</small>' : ''}</div>`; }

  drawReels() {
    this.el.querySelectorAll('.reel').forEach((r, i) => {
      const strip = r.querySelector('.strip');
      strip.style.transition = 'none';
      strip.style.transform = 'translateY(0)';
      strip.innerHTML = this.reels[i].map((s) => this.cell(s)).join('');
    });
  }

  autoSpin() {
    if (this.busy) return;
    this.auto = 10;
    this.spinSlots();
  }

  async spinSlots() {
    if (this.busy) { this.say('wait'); return; }
    const bet = this.bet, s = this.st;
    if (!this.take(bet)) { this.auto = 0; return; }
    if (this.auto > 0) this.auto--;
    this.busy = true;
    s.spins++;
    s.jackpot += Math.max(1, bet * JACKPOT_CUT);
    const res = [rollSym(), rollSym(), rollSym()];
    const ev = evalSlots(res);
    const win = !!ev.mult || ev.jackpot;
    // near-miss tease: first two reels agree, the third spins longer
    const tease = res[0] === res[1] && (!win || ev.jackpot || (res[0] === 'diamond'));
    const lever = this.$('.lever');
    if (lever) { lever.classList.remove('pull'); void lever.offsetWidth; lever.classList.add('pull'); }
    this.$('[data-swin]').textContent = this.auto > 0 ? `AUTO-SPIN · ${this.auto} LEFT` : 'SPINNING…';
    this.$('[data-swin]').className = 'slot-win';
    this.audio.tone(300, 0.2, 'sawtooth', 0.08, 2);
    const reelEls = [...this.el.querySelectorAll('.reel')];
    reelEls.forEach((r) => r.classList.remove('hit', 'tease'));
    const durs = [900, 1350, 1800 + (tease ? 1500 : 0)];
    let spinning = 3;
    const ticker = setInterval(() => this.audio.tone(700 + Math.random() * 500, 0.025, 'square', 0.035), 75);
    reelEls.forEach((r, i) => {
      const strip = r.querySelector('.strip');
      const prev = this.reels[i];
      const filler = Array.from({ length: 16 + i * 6 + (i === 2 && tease ? 14 : 0) }, rollSym);
      let above = rollSym(), below = rollSym();
      if (i === 2 && tease && !win) { if (Math.random() < 0.5) above = res[0]; else below = res[0]; }
      const cells = [...prev, ...filler, above, res[i], below];
      strip.style.transition = 'none';
      strip.style.transform = 'translateY(0)';
      strip.innerHTML = cells.map((c) => this.cell(c)).join('');
      const h = strip.firstElementChild.offsetHeight;
      void strip.offsetHeight;
      strip.style.transition = `transform ${durs[i]}ms cubic-bezier(.25,.1,.3,1.06)`;
      strip.style.transform = `translateY(-${(cells.length - 3) * h}px)`;
      r.classList.add('spinning');
      setTimeout(() => {
        r.classList.remove('spinning');
        this.reels[i] = [above, res[i], below];
        this.audio.tone(160, 0.1, 'square', 0.14, 0.6);
        this.audio.burst(0.07, 900, 0.15);
        r.classList.remove('stop'); void r.offsetWidth; r.classList.add('stop');
        if (i === 1 && tease) {
          reelEls[2].classList.add('tease');
          this.$('[data-swin]').innerHTML = res[0] === 'diamond' ? `${px('diamond', 'ico')}${px('diamond', 'ico')} … JACKPOT?!` : 'C\'MON… C\'MON…';
          [0, 300, 600, 900, 1200].forEach((t, k) => setTimeout(() => this.audio.tone(440 + k * 80, 0.12, 'square', 0.07), t));
        }
        if (--spinning === 0) { clearInterval(ticker); this.slotResult(res, ev, bet); }
      }, durs[i]);
    });
  }

  slotResult(res, ev, bet) {
    const s = this.st;
    const reelEls = [...this.el.querySelectorAll('.reel')];
    reelEls.forEach((r) => r.classList.remove('tease'));
    const msg = this.$('[data-swin]');
    if (ev.jackpot) {
      const share = Math.min(1, bet / JACKPOT_FULL_BET);
      const amount = Math.floor(s.jackpot * share);
      s.jackpot = Math.max(JACKPOT_SEED, s.jackpot - amount);
      this.pay(amount, bet);
      reelEls.forEach((r) => r.classList.add('hit'));
      msg.innerHTML = `${px('diamond', 'ico')} JACKPOT! ₵${fmt(amount)} ${px('diamond', 'ico')}`;
      msg.className = 'slot-win big';
      this.burst('JACKPOT!!!', { size: 130, confetti: 160, shake: true });
      this.fanfare();
      setTimeout(() => this.fanfare(), 900);
      this.audio.boom(true);
      this.say('jackpot');
      this.auto = 0;
    } else if (ev.mult) {
      const amount = Math.floor(bet * ev.mult);
      this.pay(amount, bet);
      if (ev.kind === 'three') reelEls.forEach((r) => r.classList.add('hit'));
      else res.forEach((x, i) => { if ((ev.kind === 'two diamonds' && x === 'diamond') || (ev.kind === 'two moons' && (x === 'moon' || x === 'wild'))) reelEls[i].classList.add('hit'); });
      msg.textContent = `WIN ₵${fmt(amount)}${ev.mult >= 10 ? ' !!!' : ''}`;
      msg.className = `slot-win ${ev.mult >= 10 ? 'big' : 'ok'}`;
      this.celebrate(amount, bet);
    } else {
      msg.textContent = pick(['NOTHING. THE MOON MOCKS YOU.', 'SO CLOSE. (NOT REALLY.)', 'TRY AGAIN, HOT SHOT.', 'THE REELS SAY NO.']);
      if (Math.random() < 0.5) this.lost();
    }
    this.game.save();
    this.refresh();
    this.busy = false;
    if (this.auto > 0 && this.tab === 'slots' && !this.el.classList.contains('hidden')) setTimeout(() => { if (this.auto > 0 && !this.busy) this.spinSlots(); }, ev.mult >= 10 || ev.jackpot ? 2000 : 650);
  }

  // a card as the hi-lo table shows it
  cardHTML(c, hidden = false, fresh = false) {
    if (hidden) return `<div class="card back${fresh ? ' deal' : ''}">${px('moon')}</div>`;
    const red = c.s === 'H' || c.s === 'D', suit = (cls) => px(SUIT_SPRITE[c.s], cls);
    return `<div class="card${red ? ' red' : ''}${fresh ? ' deal' : ''}"><i>${c.r}<br>${suit('cs')}</i><b>${suit('cb')}</b><i class="br">${c.r}<br>${suit('cs')}</i></div>`;
  }

  // ================= CRATER ROULETTE =================
  html_roulette() {
    const cellN = (n) => `<div class="rn c-${numColor(n)}" data-rb="n${n}">${n}<em data-chip="n${n}"></em></div>`;
    let grid = '';
    for (let row = 0; row < 3; row++) for (let col = 0; col < 12; col++) grid += cellN(col * 3 + (3 - row));
    const out = (k) => `<div class="ro ${k}" data-rb="${k}">${OUTSIDE[k][0]}<em data-chip="${k}"></em></div>`;
    // key and controller hints both; style.css shows the one in use
    const gl = (...toks) => `<span class="rl-pd pgx">${glyphHtml(toks)}</span>`;
    return `<div class="roul felt">
      <div class="rl-left">
        <div class="rl-wheel"><canvas width="300" height="300" data-rwheel></canvas><div class="rl-ballring" data-rball><i></i></div>${px('ptr', 'rl-ptr')}</div>
        <div class="rl-result" data-rres>PLACE YOUR BETS</div>
        <div class="rl-hist" data-rhist></div>
      </div>
      <div class="rl-right">
        <div class="rl-board"><div class="rn c-green zero" data-rb="n0">0<em data-chip="n0"></em></div><div class="rl-grid">${grid}</div></div>
        <div class="rl-dozens">${out('d1')}${out('d2')}${out('d3')}</div>
        <div class="rl-outs">${['low', 'even', 'red', 'black', 'odd', 'high'].map(out).join('')}</div>
        <div class="rl-info">Click to stack ₵${fmt(this.bet)} chips (bet size ◀ ▶). Number pays 35:1 · dozens 2:1 · outside 1:1 · 0 sweeps the outside. <span class="rl-kb">Keys: R B O E, SPACE spins, C clears.</span><span class="rl-pd pgx">${glyphHtml(['LS'])} moves the cursor, ${glyphHtml(['A'])} or ${glyphHtml(['RT'])} drops a chip under it, ${glyphHtml(['DL'])} ${glyphHtml(['DR'])} bet size.</span></div>
        <div class="rl-ctl"><span data-rtot></span><button data-act="rclear">CLEAR <small class="rl-kb">C</small>${gl('Y')}</button><button class="big" data-act="rspin">SPIN <small class="rl-kb">SPACE</small>${gl('X')}</button></div>
      </div>
    </div>`;
  }

  drawRoulette() {
    const cv = this.$('[data-rwheel]');
    const x = cv.getContext('2d');
    const c = 150, n = WHEEL.length;
    x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(c, c, c, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#120a1e'; x.beginPath(); x.arc(c, c, c - 6, 0, Math.PI * 2); x.fill();
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const v = WHEEL[i];
      x.fillStyle = v === 0 ? '#1f8a4a' : REDS.has(v) ? '#d7263d' : '#1a1426';
      x.beginPath(); x.moveTo(c, c); x.arc(c, c, c - 10, a0, a1); x.closePath(); x.fill();
      x.strokeStyle = '#ffd23f'; x.lineWidth = 1; x.stroke();
      x.save(); x.translate(c, c); x.rotate((a0 + a1) / 2 + Math.PI / 2);
      x.fillStyle = '#fff4e0'; x.font = pixelFont(9); x.textAlign = 'center';
      x.fillText(String(v), 0, -c + 28);
      x.restore();
    }
    x.fillStyle = '#5a1a8f'; x.beginPath(); x.arc(c, c, c * 0.55, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#120a1e'; x.lineWidth = 4; x.stroke();
    x.fillStyle = '#ffd23f';
    for (let i = 0; i < 4; i++) { x.save(); x.translate(c, c); x.rotate(i * Math.PI / 2); x.fillRect(-4, 0, 8, c * 0.5); x.restore(); }
    x.beginPath(); x.arc(c, c, 18, 0, Math.PI * 2); x.fill();
    cv.style.transition = 'none';
    cv.style.transform = `rotate(${this.rl.rot}deg)`;
    this.drawRBets();
    this.drawRHist();
  }

  drawRBets() {
    let tot = 0;
    for (const em of this.el.querySelectorAll('[data-chip]')) {
      const v = this.rl.bets[em.dataset.chip] || 0;
      tot += v;
      em.textContent = v ? (v >= 1000 ? `${Math.floor(v / 100) / 10}k` : v) : '';
      em.classList.toggle('on', !!v);
    }
    const t = this.$('[data-rtot]');
    if (t) t.innerHTML = `ON THE TABLE <b>₵${fmt(tot)}</b>`;
    return tot;
  }

  drawRHist() {
    const h = this.$('[data-rhist]');
    if (h) h.innerHTML = this.rl.history.map((n) => `<span class="c-${numColor(n)}">${n}</span>`).join('');
  }

  rlTotal() { return Object.values(this.rl.bets).reduce((a, b) => a + b, 0); }

  placeBet(k) {
    if (this.busy) return;
    const tot = this.rlTotal();
    if (tot + this.bet > this.game.credits) { this.flash('NOT ENOUGH CREDITS!'); this.say('broke'); return; }
    if (tot + this.bet > this.maxBet * 10) { this.flash(`TABLE LIMIT ₵${fmt(this.maxBet * 10)}`); return; }
    this.rl.bets[k] = (this.rl.bets[k] || 0) + this.bet;
    this.audio.tone(2300, 0.04, 'triangle', 0.1);
    setTimeout(() => this.audio.tone(1800, 0.05, 'triangle', 0.08), 40);
    this.drawRBets();
    const cell = this.el.querySelector(`[data-rb="${k}"]`);
    if (cell) { cell.classList.remove('bump'); void cell.offsetWidth; cell.classList.add('bump'); }
  }

  clearBets() {
    if (this.busy) return;
    this.rl.bets = {};
    this.audio.click();
    this.drawRBets();
  }

  async spinRoulette() {
    if (this.busy) { this.say('wait'); return; }
    const tot = this.rlTotal();
    if (!tot) { this.flash('PLACE A BET FIRST!'); return; }
    if (!this.take(tot)) return;
    this.busy = true;
    const res = Math.floor(Math.random() * 37);
    const i = WHEEL.indexOf(res);
    // pocket i's centre is (i + .5)/37 turn clockwise from 3 o'clock; bring it to 12
    const pocket = ((i + 0.5) / 37) * 360;
    const target = 270 - pocket;
    const cur = this.rl.rot;
    const delta = (((target - cur) % 360) + 360) % 360;
    this.rl.rot = cur + 360 * 5 + delta;
    const cv = this.$('[data-rwheel]'), ball = this.$('[data-rball]');
    const DUR = 4800;
    cv.style.transition = `transform ${DUR}ms cubic-bezier(.12,.75,.2,1)`;
    cv.style.transform = `rotate(${this.rl.rot}deg)`;
    this.rl.ball -= 360 * 8;
    ball.style.transition = `transform ${DUR}ms cubic-bezier(.1,.6,.2,1)`;
    ball.style.transform = `rotate(${this.rl.ball}deg)`;
    ball.classList.add('rolling');
    this.$('[data-rres]').textContent = 'NO MORE BETS!';
    this.$('[data-rres]').className = 'rl-result';
    this.audio.tone(500, 0.4, 'sine', 0.08, 1.8);
    let t = 0, gap = 40;
    while (t < DUR - 200) { setTimeout(() => this.audio.tone(1500 + Math.random() * 300, 0.02, 'square', 0.04), t); t += gap; gap *= 1.07; }
    await wait(DUR + 80);
    ball.classList.remove('rolling');
    this.audio.tone(240, 0.12, 'square', 0.14, 0.6);
    let win = 0;
    for (const [k, v] of Object.entries(this.rl.bets)) {
      if (k[0] === 'n') { if (+k.slice(1) === res) win += v * 36; } else if (OUTSIDE[k][1](res)) win += v * OUTSIDE[k][2];
    }
    this.rl.history.unshift(res);
    this.rl.history.length = Math.min(this.rl.history.length, 12);
    const rr = this.$('[data-rres]');
    rr.innerHTML = `<span class="c-${numColor(res)}">${res}</span> ${numColor(res).toUpperCase()}${res ? ` · ${res % 2 ? 'ODD' : 'EVEN'}` : ''}`;
    rr.className = 'rl-result show';
    const hitCell = this.el.querySelector(`[data-rb="n${res}"]`);
    if (hitCell) { hitCell.classList.add('winner'); setTimeout(() => hitCell.classList.remove('winner'), 2500); }
    this.drawRHist();
    if (win) { this.pay(win, tot); this.celebrate(win, tot); } else this.lost(res === 0 ? 'ZERO! HOUSE SWEEPS!' : undefined);
    if (win && this.rl.bets['n' + res]) this.burst(`STRAIGHT UP ${res}!!`, { size: 100, confetti: 100, shake: true });
    this.busy = false;
    // bets ride again unless you can't afford them
    if (this.rlTotal() > this.game.credits) { this.rl.bets = {}; this.flash('BETS CLEARED'); }
    this.drawRBets();
    this.game.save();
    this.refresh();
  }

  // ================= PRIZE WHEEL =================
  html_wheel() {
    return `<div class="pwheel">
      <div class="pw-wrap"><canvas width="${WHEEL_PX}" height="${WHEEL_PX}" data-pwheel></canvas>${px('ptr', 'pw-ptr')}<div class="pw-hub">SPIN<br>ME</div></div>
      <div class="pw-side">
        <h3>THE WHEEL OF MILD FORTUNE</h3>
        <p>One <b>free spin every 10 minutes</b> — real minutes, the Moon doesn't care. Extra spins ₵${WHEEL_COST}. Slice size = your actual odds. That tiny ${px('star', 'ico')} is the <b>₵5,000 MEGA PRIZE</b>. Good luck, it's thin.</p>
        <div class="pw-btns"><button class="big" data-act="wfree" data-wfree>FREE SPIN</button><button data-act="wpaid">PAID SPIN ₵${WHEEL_COST} <small>P</small></button></div>
        <div class="pw-res" data-pwres></div>
      </div>
    </div>`;
  }

  drawWheel() {
    const cv = this.$('[data-pwheel]');
    const x = cv.getContext('2d');
    const S = WHEEL_PX, c = S / 2, R = c - 22; // R: slice radius, inside the rim
    x.clearRect(0, 0, S, S);
    x.imageSmoothingEnabled = false;
    // rim: dark disc, gold ring, bulbs
    x.fillStyle = '#120a1e'; x.beginPath(); x.arc(c, c, c, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#c9a23a'; x.beginPath(); x.arc(c, c, R + 12, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#120a1e'; x.beginPath(); x.arc(c, c, R + 5, 0, Math.PI * 2); x.fill();
    const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
    // upscale a sprite by whole pixels (nearest) first, so rotating it with the slice keeps blocks square
    const blocky = (cvs, k) => {
      const o = document.createElement('canvas');
      o.width = cvs.width * k; o.height = cvs.height * k;
      const ox = o.getContext('2d');
      ox.imageSmoothingEnabled = false;
      ox.drawImage(cvs, 0, 0, o.width, o.height);
      return o;
    };
    x.imageSmoothingEnabled = true;
    let a = 0;
    for (const p of PRIZES) {
      const span = (p.w / PRIZE_TOTAL) * Math.PI * 2;
      x.fillStyle = p.color;
      x.beginPath(); x.moveTo(c, c); x.arc(c, c, R, a, a + span); x.closePath(); x.fill();
      x.strokeStyle = '#120a1e'; x.lineWidth = 6; x.stroke();
      // label along the slice's middle, hub to rim; dark ink on bright slices, light on dark
      x.save(); x.translate(c, c); x.rotate(a + span / 2);
      const dark = lum(p.color) < 110, ink = dark ? '#f4f1ff' : '#1a1030';
      const reach = R - 24, inner = 92;               // text's right edge, hub's edge
      const slice = span * (R * 0.7);                 // slice width about two thirds out
      const text = (str, size, dy = 0, right = reach) => {
        x.font = pixelFont(size);
        x.textAlign = 'right'; x.textBaseline = 'middle';
        x.fillStyle = ink;
        x.fillText(str, right, dy);
      };
      const fit = (str, max) => { // biggest px size that fits `str` between hub and rim
        let size = max;
        for (; size > 10; size -= 2) { x.font = pixelFont(size); if (x.measureText(str).width <= reach - inner) break; }
        return size;
      };
      if (p.kind === 'nothing') {
        // two lines: NOTHING big, lol small (on one line it shrinks illegibly)
        const big = Math.min(fit('NOTHING', 30), Math.floor(slice * 0.4));
        text('NOTHING', big, -big * 0.55);
        text('lol', Math.round(big * 0.75), big * 0.62);
      } else if (p.kind === 'mega') {
        const cvs = pxCanvas('wild'), sz = 44;
        x.drawImage(blocky(cvs, 3), reach - sz, -sz / 2, sz, sz);
      } else if (p.kind === 'chips') {
        const num = String(p.n), size = Math.min(fit(num, 36), Math.floor(slice * 0.7));
        text(num, size, 0, reach - 52);
        x.drawImage(blocky(pxCanvas('chip'), 3), reach - 46, -22, 44, 44);
      } else if (p.kind === 'cosmetic') {
        const size = Math.min(fit('DRIP', 30), Math.max(14, Math.floor(slice * 0.7)));
        text('DRIP', size);
      } else {
        const str = `₵${p.n}`, size = Math.min(fit(str, 40), Math.max(14, Math.floor(slice * 0.7)));
        text(str, size);
      }
      x.restore();
      a += span;
    }
    // bulbs on the rim, alternating
    for (let i = 0; i < 28; i++) {
      const t = (i / 28) * Math.PI * 2, bx = c + Math.cos(t) * (R + 8.5), by = c + Math.sin(t) * (R + 8.5);
      x.fillStyle = i % 2 ? '#fff6a8' : '#ff2e88';
      x.fillRect(Math.round(bx) - 3, Math.round(by) - 3, 6, 6);
    }
    cv.style.transition = 'none';
    cv.style.transform = `rotate(${this.wheelRot}deg)`;
    this.updateWheelButtons();
  }

  freeReady() { return Date.now() - this.st.lastFree >= FREE_SPIN_MS; }

  updateWheelButtons() {
    const b = this.$('[data-wfree]');
    if (!b) return;
    const left = FREE_SPIN_MS - (Date.now() - this.st.lastFree);
    b.disabled = left > 0 || this.busy;
    b.innerHTML = left > 0 ? `FREE IN ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}` : 'FREE SPIN! <small>SPACE</small>';
    b.classList.toggle('ready', left <= 0);
  }

  async spinWheel(free) {
    if (this.busy) { this.say('wait'); return; }
    const s = this.st;
    if (free && !this.freeReady()) { this.flash('NOT YET!'); return; }
    if (!free && !this.take(WHEEL_COST)) return;
    if (free) s.lastFree = Date.now();
    this.busy = true;
    this.updateWheelButtons();
    let r = Math.random() * PRIZE_TOTAL, idx = 0, start = 0;
    for (let i = 0; i < PRIZES.length; i++) { if (r < PRIZES[i].w) { idx = i; break; } r -= PRIZES[i].w; }
    for (let i = 0; i < idx; i++) start += PRIZES[i].w;
    const p = PRIZES[idx];
    const at = ((start + p.w * (0.15 + Math.random() * 0.7)) / PRIZE_TOTAL) * 360;
    const target = 270 - at;
    const delta = (((target - this.wheelRot) % 360) + 360) % 360;
    this.wheelRot += 360 * 6 + delta;
    const cv = this.$('[data-pwheel]');
    const DUR = 5200;
    cv.style.transition = `transform ${DUR}ms cubic-bezier(.1,.7,.15,1)`;
    cv.style.transform = `rotate(${this.wheelRot}deg)`;
    this.$('[data-pwres]').textContent = 'SPINNING…';
    let t = 0, gap = 45;
    while (t < DUR - 250) { setTimeout(() => this.audio.tone(1000, 0.025, 'square', 0.05), t); t += gap; gap *= 1.06; }
    await wait(DUR + 100);
    const out = this.$('[data-pwres]');
    if (p.kind === 'nothing') {
      out.innerHTML = 'NOTHING <i>lol</i>';
      this.burst('NOTHING lol', { color: '#c9c3d9', size: 90 });
      this.sadTrombone();
      this.say('nothing');
    } else if (p.kind === 'cr' || p.kind === 'mega') {
      this.pay(p.n, free ? 0 : WHEEL_COST);
      out.textContent = `YOU WON ₵${fmt(p.n)}!`;
      if (p.kind === 'mega') { this.burst('MEGA PRIZE!!!', { size: 120, confetti: 160, shake: true }); this.fanfare(); setTimeout(() => this.fanfare(), 900); this.say('jackpot'); } else this.celebrate(p.n, free ? 50 : WHEEL_COST);
    } else if (p.kind === 'chips') {
      s.chips += p.n;
      out.textContent = `+${p.n} LUCKY CHIPS!`;
      this.burst(`+${p.n} ${px('chip', 'big')}`, { color: '#7dff6a', size: 90, confetti: 20 });
      this.audio.cash();
    } else if (p.kind === 'cosmetic') {
      const unowned = SHOP.filter((it) => !this.game.upgrades[it.key]);
      if (unowned.length) {
        const it = pick(unowned);
        this.game.upgrades[it.key] = 1;
        out.textContent = `YOU WON: ${this.itemName(it).toUpperCase()}!`;
        this.burst('FREE DRIP!!', { color: '#c77dff', size: 100, confetti: 80, shake: true });
        this.fanfare();
        this.wear(it.key, true);
      } else {
        s.chips += 50;
        out.textContent = 'YOU OWN EVERYTHING ALREADY — +50 CHIPS';
        this.burst(`+50 ${px('chip', 'big')}`, { color: '#7dff6a', size: 90, confetti: 30 });
      }
    }
    this.busy = false;
    this.updateWheelButtons();
    this.game.save();
    this.refresh();
  }

  // ================= HIGH-LOW =================
  html_hilo() {
    return `<div class="hilo felt">
      <div class="hl-top"><div class="hl-streak" data-hstreak></div><div class="hl-pot">POT <b data-hpot>₵0</b></div></div>
      <div class="hl-cards" data-hcards></div>
      <div class="hl-msg" data-hmsg>Guess if the next card is HIGHER or LOWER. Same card = push. Or FLIP a coin for ×1.94. Cash out any time — or ride it to the Moon.</div>
      <div class="hl-ctl" data-hctl></div>
    </div>`;
  }

  hlMult(dir) {
    if (dir === 'flip') return 1.94;
    const r = hiloRank(this.hl.card);
    const p = dir === 'hi' ? (14 - r) / 13 : (r - 2) / 13;
    if (p <= 0) return 0;
    return Math.max(1.01, Math.floor((0.96 * (12 / 13) / p) * 100) / 100);
  }

  drawHilo(flipped) {
    if (this.tab !== 'hilo') return;
    const h = this.hl;
    this.$('[data-hpot]').textContent = `₵${fmt(h.pot)}`;
    this.$('[data-hstreak]').innerHTML = h.streak ? `${px('flame', 'ico').repeat(Math.min(h.streak, 8))} STREAK ×${h.streak}` : `BEST STREAK ${this.st.bestStreak}`;
    this.$('[data-hcards]').innerHTML = h.card ? (h.prev ? this.cardHTML(h.prev).replace('card', 'card old') : '') + this.cardHTML(h.card, false, flipped) : `<div class="card back">${px('moon')}</div>`;
    const ctl = this.$('[data-hctl]');
    if (h.phase === 'play') {
      const hi = this.hlMult('hi'), lo = this.hlMult('lo');
      ctl.innerHTML = `<button data-act="hhi" ${hi ? '' : 'disabled'}>▲ HIGHER ${hi ? '×' + hi.toFixed(2) : ''} <small>↑</small></button>
        <button data-act="hlo" ${lo ? '' : 'disabled'}>▼ LOWER ${lo ? '×' + lo.toFixed(2) : ''} <small>↓</small></button>
        <button data-act="hflip">${px('coin', 'ico')} FLIP ×1.94 <small>F</small></button>
        <button class="big cash" data-act="hcash" ${h.streak ? '' : 'disabled'}>CASH OUT ₵${fmt(h.pot)} <small>ENTER</small></button>`;
    } else ctl.innerHTML = `<button class="big" data-act="hstart">START ₵${fmt(this.bet)} <small>SPACE</small></button>`;
  }

  hlCard() { return { r: pick(RANKS), s: pick(SUITS) }; }

  hlStart() {
    const h = this.hl;
    if (h.phase === 'play' || this.busy) return;
    if (!this.take(this.bet)) return;
    Object.assign(h, { phase: 'play', stake: this.bet, pot: this.bet, streak: 0, card: this.hlCard(), prev: null });
    this.audio.burst(0.05, 5000, 0.18);
    this.hlMsg('HIGHER OR LOWER?');
    this.drawHilo(true);
  }

  hlMsg(t, cls = '') { const m = this.$('[data-hmsg]'); if (m) { m.innerHTML = t; m.className = `hl-msg ${cls}`; } } // t is markup: only our own text and sprites

  async hlGuess(dir) {
    const h = this.hl;
    if (h.phase !== 'play' || this.busy) return;
    const mult = this.hlMult(dir);
    if (!mult) return;
    this.busy = true;
    let ok, push = false;
    if (dir === 'flip') {
      this.hlMsg(`${px('coin', 'ico')} FLIPPING…`);
      for (let i = 0; i < 6; i++) { this.audio.tone(1200 + i * 120, 0.04, 'triangle', 0.08); await wait(90); }
      ok = Math.random() < 0.5;
    } else {
      const next = this.hlCard();
      const a = hiloRank(h.card), b = hiloRank(next);
      h.prev = h.card;
      h.card = next;
      this.audio.burst(0.05, 5000, 0.18);
      push = a === b;
      ok = dir === 'hi' ? b > a : b < a;
    }
    this.busy = false;
    if (push) { this.hlMsg('SAME CARD — PUSH! GO AGAIN.', 'push'); this.drawHilo(true); return; }
    if (ok) {
      h.pot = Math.floor(h.pot * mult);
      h.streak++;
      if (h.streak > this.st.bestStreak) this.st.bestStreak = h.streak;
      this.audio.tone(440 * Math.pow(1.122, Math.min(h.streak, 16)), 0.15, 'square', 0.1);
      this.hlMsg(`${dir === 'flip' ? 'HEADS! ' : ''}YES! POT ₵${fmt(h.pot)} — KEEP GOING?`, 'win');
      if (h.streak >= 3) this.burst(`${h.streak} IN A ROW!`, { color: '#ff9f1c', size: 60 + Math.min(h.streak, 8) * 6, confetti: h.streak * 4 });
      else this.flash(pick(['YES!', 'NAILED IT!', 'BOOM!']));
      this.drawHilo(true);
    } else {
      h.phase = 'idle';
      this.hlMsg(`${dir === 'flip' ? 'TAILS! ' : ''}WRONG! ₵${fmt(h.pot)} GOES TO THE HOUSE.`, 'lose');
      this.burst(h.streak >= 3 ? 'NOOOOO!' : 'BUSTED!', { color: '#ff2a4a', size: 90 });
      this.shake(h.streak < 3);
      if (h.streak >= 3) this.sadTrombone(); else this.lost('');
      h.streak = 0;
      h.pot = 0;
      this.drawHilo(true);
      this.game.save();
    }
  }

  hlCash() {
    const h = this.hl;
    if (h.phase !== 'play' || !h.streak || this.busy) return;
    h.phase = 'idle';
    this.pay(h.pot, h.stake);
    this.hlMsg(`CASHED OUT ₵${fmt(h.pot)}!`, 'win');
    this.celebrate(h.pot, h.stake);
    h.streak = 0;
    this.drawHilo();
    this.game.save();
  }

  // ================= PRIZE COUNTER =================
  itemName(it) { return (it.kind === 'outfit' ? OUTFITS : SKATES)[it.id].name; }

  html_prizes() {
    const g = this.game, s = this.st, ti = this.tierIdx();
    const sw = (c) => `<span class="swatch" style="background:#${c.toString(16).padStart(6, '0')}"></span>`;
    const rows = SHOP.map((it) => {
      const d = (it.kind === 'outfit' ? OUTFITS : SKATES)[it.id];
      const owned = (g.upgrades[it.key] || 0) > 0;
      const worn = it.kind === 'outfit' ? g.cosmetics.outfit === it.id : g.cosmetics.skates === it.id;
      const locked = ti < it.tier;
      const btn = owned ? (worn ? '<button disabled>WEARING</button>' : `<button data-wear="${it.key}">WEAR IT</button>`)
        : locked ? `<button disabled>${px('lock', 'ico')} ${VIP[it.tier].name}</button>`
          : `<button data-buy="${it.key}" ${s.chips < it.chips ? 'disabled' : ''}>${px('chip', 'ico')} ${it.chips}</button>`;
      const cols = it.kind === 'outfit' ? [d.suit, d.accent, d.scarf] : [d.color, d.trail];
      return `<div class="prize ${owned ? 'owned' : ''} ${locked ? 'locked' : ''}"><div class="pz-sw">${cols.map(sw).join('')}</div><div class="pz-txt"><b>${d.name}</b><small>${it.kind === 'outfit' ? 'OUTFIT' : 'SKATE FINISH'} · ${it.desc}</small></div>${btn}</div>`;
    }).join('');
    return `<div class="prizes">
      <div class="pz-head"><h3>PRIZE COUNTER</h3><div class="pz-bal">YOU HAVE <b>${px('chip', 'ico')} ${fmt(s.chips)}</b> LUCKY CHIPS<small>Earn 1 chip per ₵${CHIP_RATE} wagered, plus wheel prizes. Casino exclusives show up in your wardrobe (C).</small></div></div>
      <div class="pz-list">${rows}
        <div class="prize"><div class="pz-sw">${px('chip', 'ico')}<span>→ ₵</span></div><div class="pz-txt"><b>CHIP EXCHANGE</b><small>Trade ${EXCHANGE.chips} Lucky Chips for ₵${EXCHANGE.credits}. Vinnie takes a small cut. A big one, really.</small></div><button data-act="exchange" ${s.chips < EXCHANGE.chips ? 'disabled' : ''}>${px('chip', 'ico')} ${EXCHANGE.chips} → ₵${EXCHANGE.credits}</button></div>
      </div>
    </div>`;
  }

  buyPrize(key) {
    const it = SHOP.find((x) => x.key === key);
    const s = this.st, g = this.game;
    if (!it || g.upgrades[key] || this.tierIdx() < it.tier) return;
    if (s.chips < it.chips) { this.flash('NOT ENOUGH CHIPS!'); return; }
    s.chips -= it.chips;
    g.upgrades[key] = 1;
    this.burst('NEW DRIP!', { color: '#c77dff', size: 100, confetti: 60 });
    this.fanfare();
    this.say('shop');
    this.wear(key, true);
  }

  wear(key, quiet) {
    const it = SHOP.find((x) => x.key === key);
    const g = this.game;
    if (!it || !g.upgrades[key]) return;
    if (it.kind === 'outfit') g.cosmetics.outfit = it.id; else g.cosmetics.skates = it.id;
    g.cosmetics.apply();
    if (!quiet) { this.audio.pickup(); this.flash('LOOKIN\' GOOD!'); }
    g.save();
    if (this.tab === 'prizes') this.renderTab(); else this.refresh();
  }

  exchange() {
    const s = this.st;
    if (s.chips < EXCHANGE.chips) return;
    s.chips -= EXCHANGE.chips;
    this.game.credits += EXCHANGE.credits;
    this.audio.cash();
    this.float(`+₵${EXCHANGE.credits}`, '#7dff6a');
    this.game.save();
    this.renderTab();
  }
}
