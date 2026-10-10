import { OUTFITS, SKATES } from './cosmetics.js';
import { pixelFont } from './fonts.js';
import { CasinoGames } from './casinoGames.js';

// The Lucky Crater Casino: slots, blackjack, roulette, a prize wheel, high-low, a prize
// counter and a loan shark, all in one comic overlay. State lives in game.stats.casino.

// Casino-exclusive cosmetics: no `shop`/`cost`, so faction shops skip them, but the
// wardrobe (C) picks them up once owned via game.upgrades['outfit_<id>' / 'skates_<id>'].
Object.assign(OUTFITS, {
  loungelizard: { name: 'Lounge Lizard Tux', casino: true, suit: 0x16121f, accent: 0xffd23f, helmet: 0xf4f1ff, visor: 0xff2e88, scarf: 0xd7263d, sc: [0.7, 0.28, 2] },
  highroller: { name: 'High Roller Gold Lamé', casino: true, suit: 0xffc83a, accent: 0xff2e88, helmet: 0xffe27a, visor: 0x120a1e, scarf: 0xff2e88, sc: [1.9, 0.34, 2], extras: ['halo'] },
  moonroyal: { name: 'Moon Royalty Regalia', casino: true, suit: 0x5a1a8f, accent: 0xffd23f, helmet: 0xffd23f, visor: 0x2ee6ff, scarf: 0xffffff, sc: [2.1, 0.4, 2], extras: ['crest', 'pads'] },
});
Object.assign(SKATES, {
  felt: { name: 'Lucky Felt Rollers', casino: true, color: 0x1f8a4a, trail: 0x7dff6a, coins: 'chips' },
  jackpot: { name: 'Jackpot Rollers', casino: true, color: 0xffd23f, trail: 0xfff6a8, coins: 'gold' },
});

const VIP = [
  { name: 'BRONZE', min: 0, max: 250, color: '#e0975a' },
  { name: 'SILVER', min: 2000, max: 1000, color: '#dfe6f2' },
  { name: 'GOLD', min: 10000, max: 2500, color: '#ffd23f' },
  { name: 'PLATINUM', min: 40000, max: 10000, color: '#9be7ff' },
  { name: 'MOON ROYALTY', min: 150000, max: 50000, color: '#c77dff' },
];
const BETS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];
const TABS = [
  ['slots', 'LUNAR SLOTS'], ['roulette', 'CRATER ROULETTE'], ['wheel', 'PRIZE WHEEL'],
  ['hilo', 'HIGH-LOW'], ['prizes', 'PRIZE COUNTER'], ['shark', 'LOAN SHARK'],
];
const DEFAULTS = { wagered: 0, won: 0, biggest: 0, spins: 0, hands: 0, bjs: 0, bestStreak: 0, chips: 0, chipFrac: 0, jackpot: 2500, lastFree: 0, debt: 0, debtAt: 0, loans: 0, visits: 0, ducks: 0, plinko: 0 };
const CHIP_RATE = 50; // credits wagered per Lucky Chip
const FREE_SPIN_MS = 10 * 60 * 1000;
const INTEREST_MS = 10 * 60 * 1000;

// ---------- slots ----------
const SYMS = {
  moon: { e: '🌙', w: 13 }, comet: { e: '☄️', w: 9 }, rocket: { e: '🚀', w: 7 }, alien: { e: '👽', w: 5 },
  ufo: { e: '🛸', w: 4 }, diamond: { e: '💎', w: 2 }, wild: { e: '⭐', w: 2 },
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

// Returns { mult, jackpot }. Wilds substitute for everything except diamonds. Base RTP ≈ 91.6%, ~95% with the jackpot.
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
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const cardVal = (c) => (c.r === 'A' ? 11 : ['J', 'Q', 'K'].includes(c.r) ? 10 : +c.r);
function handValue(h) {
  let t = 0, aces = 0;
  for (const c of h) { t += cardVal(c); if (c.r === 'A') aces++; }
  while (t > 21 && aces) { t -= 10; aces--; }
  return { t, soft: aces > 0 };
}
const isBJ = (h) => h.length === 2 && handValue(h).t === 21;
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
  { label: '★', w: 1, kind: 'mega', n: 5000, color: '#fff6a8' },
];
const PRIZE_TOTAL = PRIZES.reduce((a, p) => a + p.w, 0);
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
const LOANS = [{ n: 500, tier: 0 }, { n: 2000, tier: 1 }, { n: 10000, tier: 2 }];

// ---------- the pit boss ----------
const LINES = {
  greet: ['Welcome to the Lucky Crater, kid. The house always wins. Usually.', 'Step right up! Low gravity, high stakes!', 'Ah, a courier. Couriers tip well. Couriers LOSE well.', 'Air\'s free. Everything else costs.', 'No helmets on the tables. Kidding. Keep your helmet on. Vacuum.'],
  win: ['Huh. Beginner\'s luck.', 'Don\'t get used to it.', 'Nice. Now give it back.', 'The odds are just warming up.', 'See? Winning is easy. Do it again.', 'A winner! Somebody take a photo for the wall.'],
  big: ['WHOA! Somebody check that machine!', 'Security! …No wait, that\'s legit. Ugh.', 'That\'s coming out of MY bonus!', 'Now THAT\'s a moonshot!', 'I need to sit down. I AM sitting down. I need to sit down more.'],
  lose: ['The house thanks you for your donation.', 'Close! …Not really, but close.', 'Gravity\'s low. So are your odds.', 'Have you tried winning?', 'Keep going, you\'re due! (You are not due.)', 'That one\'s going toward the new chandelier.', 'Ooh. Unlucky. Again?'],
  broke: ['Outta credits? Rusty the loan shark has a… flexible rate. Press 7.', 'No credits, no service. Those are the rules. I made them.', 'Go deliver some packages and come back rich. Or come back poor. I\'m easy.'],
  jackpot: ['JACKPOT?! I\'m calling my mom. I\'m calling YOUR mom!', 'THE MACHINE IS SCREAMING! THE MACHINE IS SCREAMING!'],
  bj: ['Blackjack! Smooth like a lizard.', 'Twenty-one. Show-off.'],
  bust: ['Bust! Twenty-two is just twenty-one with ambition.', 'Too many. Story of my life.', 'Black hole got you. It happens. Mostly to you.'],
  nothing: ['NOTHING! Ha! That\'s my favourite slice.', 'It says "lol" right on it, kid.', 'The wheel giveth. Mostly the wheel taketh.'],
  vip: ['VIP upgrade! I\'ll have them warm up the velvet rope.', 'A high roller! I knew it the moment you skated in.'],
  shark: ['Rusty\'s watching you, kid. Pay your debts.', 'I\'d pay Rusty back if I were you. He bites. Literally. He\'s a shark.'],
  wait: ['Easy, easy — let it finish!', 'Patience. The Moon wasn\'t built in a day.'],
  push: ['A push. Nobody wins. My favourite kind of boring.'],
  shop: ['Lookin\' sharp! Very… expensive.', 'Drip acquired. The Moon salutes you.'],
};
const SHARK = {
  offer: ['"Need a little float, friend? Rustmoon rates: fifty percent up front, ten percent every ten minutes. Very reasonable. For a shark."', '"I lend, you spend, you pay me back. Simple. Simple like a shark."'],
  owed: ['"Tick tock, courier. The vig don\'t sleep."', '"I can smell debt from three craters away."', '"Nice skates. Be a shame if something… compounded."'],
  paid: ['"Pleasure doin\' business. Come back when you\'re desperate."'],
};

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Casino {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('casino');
    this.tab = 'slots';
    this.bet = 10;
    this.busy = false;
    this.auto = 0;
    this.shown = game.credits;
    this.reels = [['moon', 'rocket', 'comet'], ['ufo', 'alien', 'moon'], ['comet', 'diamond', 'rocket']];
    this.shoe = [];
    this.bj = { phase: 'idle', player: [], dealer: [], stake: 0 };
    this.rl = { bets: {}, rot: 0, ball: 0, history: [] };
    this.wheelRot = 0;
    this.hl = { phase: 'idle', card: null, pot: 0, stake: 0, streak: 0 };
    this.lastSay = '';
    this.mode = null; // a walk-in 3D game you're seated at ('bj' | 'duck' | 'plinko'), or null
    if (this.el) this.build();
    this.games = new CasinoGames(game, this);
  }

  // Saved state, with defaults filled in for older saves.
  get st() {
    const g = this.game;
    const s = g.stats.casino || (g.stats.casino = {});
    for (const k in DEFAULTS) if (s[k] === undefined) s[k] = DEFAULTS[k];
    return s;
  }

  get audio() { return this.game.audio; }

  near(p) {
    const c = this.game.world.casino;
    return !!c && c.loc.active && c.near(p);
  }

  // Walk-in casino: prompt + F at a game station. Returns true when it owns the prompt.
  interact() {
    const g = this.game;
    if (!this.games || !this.games.ok) return false;
    const s = this.games.stationAt(g.player.pos);
    if (!s) return false;
    g.hud.prompt(`<b>F</b> — ${s.label}`);
    if (g.input.pressed('KeyF') && g.boardCooldown <= 0) {
      if (s.id === 'classic') this.open();
      else if (s.id === 'prizes') { this.open(); this.setTab('prizes'); } else this.sit(s.id);
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
  open() {
    const g = this.game;
    g.openModal('casino');
    this.el.classList.remove('hidden');
    const s = this.st;
    s.visits++;
    if (s.visits === 1) { s.chips += 10; this.welcome = true; }
    this.clampBet();
    this.shown = g.credits;
    this.refresh(true);
    this.renderTab();
    this.say(this.debt() > 0 ? 'shark' : 'greet');
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
    if (code.startsWith('Digit') && n >= 1 && n <= TABS.length) { this.setTab(TABS[n - 1][0]); return; }
    if (code === 'ArrowLeft' || code === 'Minus') { this.stepBet(-1); return; }
    if (code === 'ArrowRight' || code === 'Equal') { this.stepBet(1); return; }
    const go = code === 'Space' || code === 'Enter';
    switch (this.tab) {
      case 'slots': if (go) this.spinSlots(); else if (code === 'KeyA') this.autoSpin(); break;
      case 'bj':
        if (go && this.bj.phase !== 'play') this.deal();
        else if (code === 'KeyH') this.hit();
        else if (code === 'KeyS' || (go && this.bj.phase === 'play')) this.stand();
        else if (code === 'KeyD') this.double();
        break;
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

  // Deduct a stake. Returns false (and complains) when you can't cover it.
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

  // Loan-shark debt grows 10% per 10 real minutes, applied lazily.
  debt() {
    const s = this.st;
    if (s.debt <= 0) return 0;
    const steps = Math.floor((Date.now() - s.debtAt) / INTEREST_MS);
    if (steps > 0) { s.debt = Math.ceil(s.debt * Math.pow(1.1, Math.min(steps, 50))); s.debtAt += steps * INTEREST_MS; }
    return s.debt;
  }

  // ---------- DOM skeleton ----------
  build() {
    this.el.innerHTML = `<div class="cas">
      <div class="cas-bulbs"></div>
      <header class="cas-head">
        <div class="cas-logo">LUCKY CRATER <span>CASINO</span></div>
        <div class="cas-meters">
          <div class="cas-cred" data-cred>₵0</div>
          <div class="cas-chips" title="Lucky Chips: earned by playing (1 per ₵${CHIP_RATE} wagered). Spend them at the Prize Counter.">🍀 <b data-chips>0</b></div>
          <div class="cas-vip" data-vip></div>
        </div>
        <button class="cas-x" data-act="close">✕ LEAVE <small>ESC</small></button>
      </header>
      <div class="cas-boss"><div class="cas-face">🦎</div><div class="cas-say"><b>VINNIE "THE VISOR"</b>, PIT BOSS<p data-say></p></div><div class="cas-jp">PROGRESSIVE JACKPOT<b data-jp>₵0</b></div></div>
      <nav class="cas-tabs">${TABS.map(([id, name], i) => `<button data-tab="${id}"><i>${i + 1}</i>${name}</button>`).join('')}</nav>
      <div class="cas-body" data-body></div>
      <footer class="cas-foot">
        <div class="cas-bet"><button data-act="betdown">◀</button><span>BET <b data-bet>₵10</b></span><button data-act="betup">▶</button><small data-max></small></div>
        <div class="cas-stats" data-stats></div>
      </footer>
      <div class="cas-fx" data-fx></div>
    </div>`;
    this.$ = (q) => this.el.querySelector(q);
    this.root = this.$('.cas');
    // never steal focus from the game: keyboard shortcuts must not re-click a focused button
    this.el.addEventListener('mousedown', (e) => e.preventDefault());
    this.el.addEventListener('click', (e) => this.onClick(e));
  }

  onClick(e) {
    const t = e.target.closest('[data-act],[data-tab],[data-rb],[data-buy],[data-wear],[data-loan]');
    if (!t || !this.el.contains(t)) return;
    const d = t.dataset;
    if (d.tab) return this.setTab(d.tab);
    if (d.rb) return this.placeBet(d.rb);
    if (d.buy) return this.buyPrize(d.buy);
    if (d.wear) return this.wear(d.wear);
    if (d.loan) return this.borrow(+d.loan);
    switch (d.act) {
      case 'close': this.close(false); break;
      case 'betdown': this.stepBet(-1); break;
      case 'betup': this.stepBet(1); break;
      case 'spin': this.spinSlots(); break;
      case 'auto': this.autoSpin(); break;
      case 'deal': this.deal(); break;
      case 'hit': this.hit(); break;
      case 'stand': this.stand(); break;
      case 'double': this.double(); break;
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
      case 'repay': this.repay(+d.n); break;
    }
  }

  setTab(id) {
    if (id === this.tab) return;
    if (this.busy || this.bj.phase === 'play' || this.hl.phase === 'play') {
      this.say('wait');
      this.shake(true);
      return;
    }
    this.auto = 0;
    this.tab = id;
    this.audio.click();
    this.renderTab();
  }

  // Header, footer and the credits ticker.
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
    const debt = this.debt();
    this.$('[data-stats]').innerHTML = `WAGERED <b>₵${fmt(s.wagered)}</b> · NET <b class="${net >= 0 ? 'up' : 'down'}">${net >= 0 ? '+' : '−'}₵${fmt(Math.abs(net))}</b> · BIGGEST WIN <b>₵${fmt(s.biggest)}</b>${debt ? ` · <b class="down">OWE RUSTY ₵${fmt(debt)}</b>` : ''}`;
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
    if (this.tab === 'shark') this.renderShark();
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

  // Celebrate a win scaled to its size relative to the stake.
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
    if (this.tab === 'bj') this.drawBJ();
    if (this.tab === 'roulette') this.drawRoulette();
    if (this.tab === 'wheel') this.drawWheel();
    if (this.tab === 'hilo') this.drawHilo();
    if (this.tab === 'shark') this.renderShark();
    this.refresh();
  }

  // ================= LUNAR SLOTS =================
  html_slots() {
    const row = (syms, pay) => `<tr><td>${syms}</td><td>×${pay}</td></tr>`;
    return `<div class="slots">
      <div class="slot-machine">
        <div class="slot-top">★ LUNAR SLOTS ★</div>
        <div class="reels">${[0, 1, 2].map((i) => `<div class="reel" data-reel="${i}"><div class="strip"></div></div>`).join('')}<div class="payline"></div></div>
        <div class="slot-win" data-swin>PULL THE LEVER, LOSER. I MEAN, LEGEND.</div>
        <div class="slot-ctl"><button class="big" data-act="spin">SPIN <small>SPACE</small></button><button data-act="auto">AUTO ×10 <small>A</small></button></div>
        <div class="lever" data-act="spin"><i></i></div>
      </div>
      <table class="paytable"><tr><th colspan="2">PAYTABLE (× BET)</th></tr>
        <tr class="jp"><td>💎💎💎</td><td>JACKPOT</td></tr>
        ${row('⭐⭐⭐', PAY3.wild)}${row('🛸🛸🛸', PAY3.ufo)}${row('👽👽👽', PAY3.alien)}${row('🚀🚀🚀', PAY3.rocket)}${row('☄️☄️☄️', PAY3.comet)}${row('🌙🌙🌙', PAY3.moon)}
        ${row('any 💎💎', 2.5)}${row('any 🌙🌙', 1)}
        <tr><td colspan="2" class="fine">⭐ WILD subs for anything but 💎. Jackpot pays in full on bets of ₵${JACKPOT_FULL_BET}+ (bet/₵${JACKPOT_FULL_BET} share below). ${Math.round(JACKPOT_CUT * 100)}% of every spin feeds the pot.</td></tr>
      </table>
    </div>`;
  }

  cell(id) { return `<div class="cell s-${id}">${SYMS[id].e}${id === 'wild' ? '<small>WILD</small>' : ''}</div>`; }

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
    // near-miss tease: first two reels agree, the third takes its sweet time
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
          this.$('[data-swin]').textContent = res[0] === 'diamond' ? '💎 💎 … JACKPOT?!' : 'C\'MON… C\'MON…';
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
      msg.textContent = `💎 JACKPOT! ₵${fmt(amount)} 💎`;
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

  // ================= BLACK HOLE BLACKJACK =================
  draw() {
    if (this.shoe.length < 60) {
      this.shoe = [];
      for (let d = 0; d < 6; d++) for (const s of SUITS) for (const r of RANKS) this.shoe.push({ r, s });
      for (let i = this.shoe.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.shoe[i], this.shoe[j]] = [this.shoe[j], this.shoe[i]]; }
      this.flash('SHUFFLING THE SHOE…');
    }
    return this.shoe.pop();
  }

  cardHTML(c, hidden = false, fresh = false) {
    if (hidden) return `<div class="card back${fresh ? ' deal' : ''}"></div>`;
    const red = c.s === '♥' || c.s === '♦';
    return `<div class="card${red ? ' red' : ''}${fresh ? ' deal' : ''}"><i>${c.r}<br>${c.s}</i><b>${c.s}</b><i class="br">${c.r}<br>${c.s}</i></div>`;
  }

  html_bj() {
    return `<div class="bj felt">
      <div class="bj-rules">BLACKJACK PAYS 3:2 · DEALER STANDS ON ALL 17s · 6-DECK SHOE</div>
      <div class="bj-row"><div class="bj-label">DEALER <b data-dtot></b></div><div class="hand" data-dealer></div></div>
      <div class="bj-msg" data-bjmsg>PLACE YOUR BET AND DEAL.</div>
      <div class="bj-row"><div class="bj-label">YOU <b data-ptot></b></div><div class="hand" data-player></div></div>
      <div class="bj-ctl" data-bjctl></div>
    </div>`;
  }

  drawBJ(fresh = {}) {
    if (this.tab !== 'bj') return;
    const b = this.bj;
    const hideHole = b.phase === 'play' || b.phase === 'dealing';
    this.$('[data-dealer]').innerHTML = b.dealer.map((c, i) => this.cardHTML(c, i === 1 && hideHole, fresh.d === i)).join('');
    this.$('[data-player]').innerHTML = b.player.map((c, i) => this.cardHTML(c, false, fresh.p === i)).join('');
    const pv = handValue(b.player);
    this.$('[data-ptot]').textContent = b.player.length ? `${pv.soft && pv.t <= 21 && pv.t !== 21 ? 'soft ' : ''}${pv.t}` : '';
    this.$('[data-dtot]').textContent = b.dealer.length ? (hideHole ? `${handValue([b.dealer[0]]).t} + ?` : handValue(b.dealer).t) : '';
    const ctl = this.$('[data-bjctl]');
    if (b.phase === 'play') {
      const canD = b.player.length === 2 && !b.doubled;
      ctl.innerHTML = `<button data-act="hit">HIT <small>H</small></button><button data-act="stand">STAND <small>S</small></button><button data-act="double" ${canD ? '' : 'disabled'}>DOUBLE <small>D</small></button>`;
    } else if (b.phase === 'dealing' || b.phase === 'dealer') ctl.innerHTML = '<button disabled>…</button>';
    else ctl.innerHTML = `<button class="big" data-act="deal">DEAL ₵${fmt(this.bet)} <small>SPACE</small></button>`;
  }

  bjMsg(t, cls = '') {
    const m = this.$('[data-bjmsg]');
    if (!m) return;
    m.textContent = t;
    m.className = `bj-msg ${cls}`;
  }

  async deal() {
    const b = this.bj;
    if (b.phase === 'play' || b.phase === 'dealing' || b.phase === 'dealer') return;
    if (!this.take(this.bet)) return;
    Object.assign(b, { phase: 'dealing', player: [], dealer: [], stake: this.bet, doubled: false });
    this.st.hands++;
    this.bjMsg('DEALING…');
    for (let k = 0; k < 4; k++) {
      const toP = k % 2 === 0;
      (toP ? b.player : b.dealer).push(this.draw());
      this.audio.burst(0.05, 5000, 0.18);
      this.drawBJ(toP ? { p: b.player.length - 1 } : { d: b.dealer.length - 1 });
      await wait(260);
    }
    const pBJ = isBJ(b.player), dBJ = isBJ(b.dealer);
    if (pBJ || dBJ) {
      b.phase = 'done';
      this.drawBJ();
      if (pBJ && dBJ) { this.pay(b.stake, b.stake); this.bjMsg('BOTH BLACKJACK — PUSH.', 'push'); this.say('push'); } else if (pBJ) {
        const w = Math.floor(b.stake * 2.5);
        this.pay(w, b.stake);
        this.st.bjs++;
        this.bjMsg(`BLACKJACK! +₵${fmt(w - b.stake)}`, 'win');
        this.burst('BLACKJACK!!', { size: 100, confetti: 50, shake: true });
        this.fanfare();
        this.say('bj');
      } else { this.bjMsg('DEALER BLACKJACK. THE VOID STARES BACK.', 'lose'); this.lost('DEALER 21!'); }
      return this.finishBJ();
    }
    b.phase = 'play';
    this.bjMsg('HIT, STAND OR DOUBLE?');
    this.drawBJ();
  }

  hit() {
    const b = this.bj;
    if (b.phase !== 'play') return;
    b.player.push(this.draw());
    this.audio.burst(0.05, 5000, 0.18);
    const v = handValue(b.player).t;
    this.drawBJ({ p: b.player.length - 1 });
    if (v > 21) {
      b.phase = 'done';
      this.drawBJ();
      this.bjMsg(`BUST WITH ${v}!`, 'lose');
      this.burst('BUST!', { color: '#ff2a4a', size: 100 });
      this.shake(true);
      this.sadTrombone();
      this.say('bust');
      this.finishBJ();
    } else if (v === 21) this.stand();
  }

  double() {
    const b = this.bj;
    if (b.phase !== 'play' || b.player.length !== 2 || b.doubled) return;
    if (!this.take(b.stake)) return;
    b.stake *= 2;
    b.doubled = true;
    this.flash('DOUBLE DOWN!');
    b.player.push(this.draw());
    this.audio.burst(0.05, 5000, 0.18);
    const v = handValue(b.player).t;
    this.drawBJ({ p: 2 });
    if (v > 21) {
      b.phase = 'done';
      this.drawBJ();
      this.bjMsg(`DOUBLE BUST WITH ${v}! OUCH.`, 'lose');
      this.burst('BUST!', { color: '#ff2a4a', size: 100 });
      this.sadTrombone();
      this.say('bust');
      this.finishBJ();
    } else this.stand();
  }

  async stand() {
    const b = this.bj;
    if (b.phase !== 'play') return;
    b.phase = 'dealer';
    this.drawBJ({ d: 1 });
    this.audio.burst(0.05, 5000, 0.18);
    this.bjMsg('DEALER PLAYS…');
    await wait(550);
    while (handValue(b.dealer).t < 17) {
      b.dealer.push(this.draw());
      this.audio.burst(0.05, 5000, 0.18);
      this.drawBJ({ d: b.dealer.length - 1 });
      await wait(550);
    }
    b.phase = 'done';
    this.drawBJ();
    const p = handValue(b.player).t, d = handValue(b.dealer).t;
    if (d > 21 || p > d) {
      const w = b.stake * 2;
      this.pay(w, b.stake);
      this.bjMsg(d > 21 ? `DEALER BUSTS WITH ${d}! YOU WIN ₵${fmt(b.stake)}` : `${p} BEATS ${d}! YOU WIN ₵${fmt(b.stake)}`, 'win');
      this.celebrate(w, b.stake);
    } else if (p === d) {
      this.pay(b.stake, b.stake);
      this.bjMsg(`PUSH AT ${p}. STAKE RETURNED.`, 'push');
      this.say('push');
    } else {
      this.bjMsg(`DEALER ${d} BEATS ${p}.`, 'lose');
      this.lost();
    }
    this.finishBJ();
  }

  finishBJ() {
    this.game.save();
    this.refresh();
    this.drawBJ();
  }

  // ================= CRATER ROULETTE =================
  html_roulette() {
    const cellN = (n) => `<div class="rn c-${numColor(n)}" data-rb="n${n}">${n}<em data-chip="n${n}"></em></div>`;
    let grid = '';
    for (let row = 0; row < 3; row++) for (let col = 0; col < 12; col++) grid += cellN(col * 3 + (3 - row));
    const out = (k) => `<div class="ro ${k}" data-rb="${k}">${OUTSIDE[k][0]}<em data-chip="${k}"></em></div>`;
    return `<div class="roul felt">
      <div class="rl-left">
        <div class="rl-wheel"><canvas width="300" height="300" data-rwheel></canvas><div class="rl-ballring" data-rball><i></i></div><div class="rl-ptr">▼</div></div>
        <div class="rl-result" data-rres>PLACE YOUR BETS</div>
        <div class="rl-hist" data-rhist></div>
      </div>
      <div class="rl-right">
        <div class="rl-board"><div class="rn c-green zero" data-rb="n0">0<em data-chip="n0"></em></div><div class="rl-grid">${grid}</div></div>
        <div class="rl-dozens">${out('d1')}${out('d2')}${out('d3')}</div>
        <div class="rl-outs">${['low', 'even', 'red', 'black', 'odd', 'high'].map(out).join('')}</div>
        <div class="rl-info">Click to stack ₵${fmt(this.bet)} chips (bet size ◀ ▶). Number pays 35:1 · dozens 2:1 · outside 1:1 · 0 sweeps the outside. Keys: R B O E, SPACE spins, C clears.</div>
        <div class="rl-ctl"><span data-rtot></span><button data-act="rclear">CLEAR <small>C</small></button><button class="big" data-act="rspin">SPIN <small>SPACE</small></button></div>
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
    // pocket i's centre sits at (i + .5)/37 of a turn clockwise from 3 o'clock; bring it to 12 o'clock
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
    // bets ride again; drop what you can no longer afford
    if (this.rlTotal() > this.game.credits) { this.rl.bets = {}; this.flash('BETS CLEARED'); }
    this.drawRBets();
    this.game.save();
    this.refresh();
  }

  // ================= PRIZE WHEEL =================
  html_wheel() {
    return `<div class="pwheel">
      <div class="pw-wrap"><canvas width="420" height="420" data-pwheel></canvas><div class="pw-ptr">▼</div><div class="pw-hub">SPIN<br>ME</div></div>
      <div class="pw-side">
        <h3>THE WHEEL OF MILD FORTUNE</h3>
        <p>One <b>free spin every 10 minutes</b> — real minutes, the Moon doesn't care. Extra spins ₵${WHEEL_COST}. Slice size = your actual odds. That tiny ★ is the <b>₵5,000 MEGA PRIZE</b>. Good luck, it's thin.</p>
        <div class="pw-btns"><button class="big" data-act="wfree" data-wfree>FREE SPIN</button><button data-act="wpaid">PAID SPIN ₵${WHEEL_COST} <small>P</small></button></div>
        <div class="pw-res" data-pwres></div>
      </div>
    </div>`;
  }

  drawWheel() {
    const cv = this.$('[data-pwheel]');
    const x = cv.getContext('2d');
    const c = 210;
    x.clearRect(0, 0, 420, 420);
    x.fillStyle = '#120a1e'; x.beginPath(); x.arc(c, c, c, 0, Math.PI * 2); x.fill();
    let a = 0;
    for (const p of PRIZES) {
      const span = (p.w / PRIZE_TOTAL) * Math.PI * 2;
      x.fillStyle = p.color;
      x.beginPath(); x.moveTo(c, c); x.arc(c, c, c - 12, a, a + span); x.closePath(); x.fill();
      x.strokeStyle = '#120a1e'; x.lineWidth = 4; x.stroke();
      x.save(); x.translate(c, c); x.rotate(a + span / 2);
      x.textAlign = 'right'; x.textBaseline = 'middle';
      const fs = Math.max(12, Math.min(26, span * 90));
      x.font = pixelFont(fs * 0.55);
      x.lineWidth = 4; x.strokeStyle = '#120a1e'; x.strokeText(p.label, c - 24, 0);
      x.fillStyle = p.kind === 'nothing' ? '#c9c3d9' : '#fff';
      x.fillText(p.label, c - 24, 0);
      x.restore();
      a += span;
    }
    // bulbs on the rim
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * Math.PI * 2;
      x.fillStyle = i % 2 ? '#fff6a8' : '#ff2e88';
      x.beginPath(); x.arc(c + Math.cos(t) * (c - 6), c + Math.sin(t) * (c - 6), 4, 0, Math.PI * 2); x.fill();
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
      this.burst(`+${p.n} 🍀`, { color: '#7dff6a', size: 90, confetti: 20 });
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
        this.burst('+50 🍀', { color: '#7dff6a', size: 90, confetti: 30 });
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
    this.$('[data-hstreak]').innerHTML = h.streak ? `${'🔥'.repeat(Math.min(h.streak, 8))} STREAK ×${h.streak}` : `BEST STREAK ${this.st.bestStreak}`;
    this.$('[data-hcards]').innerHTML = h.card ? (h.prev ? this.cardHTML(h.prev).replace('card', 'card old') : '') + this.cardHTML(h.card, false, flipped) : '<div class="card back"></div>';
    const ctl = this.$('[data-hctl]');
    if (h.phase === 'play') {
      const hi = this.hlMult('hi'), lo = this.hlMult('lo');
      ctl.innerHTML = `<button data-act="hhi" ${hi ? '' : 'disabled'}>▲ HIGHER ${hi ? '×' + hi.toFixed(2) : ''} <small>↑</small></button>
        <button data-act="hlo" ${lo ? '' : 'disabled'}>▼ LOWER ${lo ? '×' + lo.toFixed(2) : ''} <small>↓</small></button>
        <button data-act="hflip">🪙 FLIP ×1.94 <small>F</small></button>
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

  hlMsg(t, cls = '') { const m = this.$('[data-hmsg]'); if (m) { m.textContent = t; m.className = `hl-msg ${cls}`; } }

  async hlGuess(dir) {
    const h = this.hl;
    if (h.phase !== 'play' || this.busy) return;
    const mult = this.hlMult(dir);
    if (!mult) return;
    this.busy = true;
    let ok, push = false;
    if (dir === 'flip') {
      this.hlMsg('🪙 FLIPPING…');
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
      const btn = owned ? (worn ? '<button disabled>WEARING ✔</button>' : `<button data-wear="${it.key}">WEAR IT</button>`)
        : locked ? `<button disabled>🔒 ${VIP[it.tier].name}</button>`
          : `<button data-buy="${it.key}" ${s.chips < it.chips ? 'disabled' : ''}>🍀 ${it.chips}</button>`;
      const cols = it.kind === 'outfit' ? [d.suit, d.accent, d.scarf] : [d.color, d.trail];
      return `<div class="prize ${owned ? 'owned' : ''} ${locked ? 'locked' : ''}"><div class="pz-sw">${cols.map(sw).join('')}</div><div class="pz-txt"><b>${d.name}</b><small>${it.kind === 'outfit' ? 'OUTFIT' : 'SKATE FINISH'} · ${it.desc}</small></div>${btn}</div>`;
    }).join('');
    return `<div class="prizes">
      <div class="pz-head"><h3>PRIZE COUNTER</h3><div class="pz-bal">YOU HAVE <b>🍀 ${fmt(s.chips)}</b> LUCKY CHIPS<small>Earn 1 chip per ₵${CHIP_RATE} wagered, plus wheel prizes. Casino exclusives show up in your wardrobe (C).</small></div></div>
      <div class="pz-list">${rows}
        <div class="prize"><div class="pz-sw">🍀→₵</div><div class="pz-txt"><b>CHIP EXCHANGE</b><small>Trade ${EXCHANGE.chips} Lucky Chips for ₵${EXCHANGE.credits}. Vinnie takes a small cut. A big one, really.</small></div><button data-act="exchange" ${s.chips < EXCHANGE.chips ? 'disabled' : ''}>🍀 ${EXCHANGE.chips} → ₵${EXCHANGE.credits}</button></div>
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

  // ================= LOAN SHARK =================
  html_shark() { return '<div class="shark" data-shark></div>'; }

  renderShark() {
    const el = this.$('[data-shark]');
    if (!el) return;
    const s = this.st, debt = this.debt(), ti = this.tierIdx();
    let html = `<div class="sh-card"><div class="sh-face">🦈</div><div class="sh-txt"><h3>RUSTY "KNUCKLES" VASQUEZ</h3><small>RUSTMOON CLANS · "FINANCIAL SERVICES"</small>`;
    if (debt > 0) {
      const next = INTEREST_MS - ((Date.now() - s.debtAt) % INTEREST_MS);
      html += `<div class="bubble">${this.sharkLine || (this.sharkLine = pick(SHARK.owed))}</div>
        <div class="sh-debt">YOU OWE <b>₵${fmt(debt)}</b><small>+10% in ${Math.floor(next / 60000)}:${String(Math.floor((next % 60000) / 1000)).padStart(2, '0')}</small></div>
        <div class="sh-btns">${[100, 500, 2000].filter((n) => n < debt).map((n) => `<button data-act="repay" data-n="${n}" ${this.game.credits < n ? 'disabled' : ''}>PAY ₵${fmt(n)}</button>`).join('')}<button class="big" data-act="repay" data-n="${debt}" ${this.game.credits < debt ? 'disabled' : ''}>PAY IT ALL ₵${fmt(debt)}</button></div>`;
    } else {
      html += `<div class="bubble">${this.sharkLine || (this.sharkLine = pick(SHARK.offer))}</div>
        <div class="sh-btns">${LOANS.map((l) => (ti >= l.tier ? `<button data-loan="${l.n}">BORROW ₵${fmt(l.n)}<small>OWE ₵${fmt(l.n * 1.5)}</small></button>` : `<button disabled>🔒 ₵${fmt(l.n)}<small>VIP ${VIP[l.tier].name}</small></button>`)).join('')}</div>`;
    }
    html += `<p class="sh-fine">Loans taken: ${s.loans}. Interest compounds in real time while you owe, even when you're out delivering. Rusty does not accept chips, excuses, or chimeras.</p></div></div>`;
    el.innerHTML = html;
  }

  borrow(n) {
    const s = this.st;
    if (this.debt() > 0) return;
    const l = LOANS.find((x) => x.n === n);
    if (!l || this.tierIdx() < l.tier) return;
    s.debt = Math.ceil(n * 1.5);
    s.debtAt = Date.now();
    s.loans++;
    this.game.credits += n;
    this.sharkLine = '"Pleasure. I know where your skates sleep."';
    this.audio.cash();
    this.float(`+₵${fmt(n)}`, '#7dff6a');
    this.say('shark');
    this.game.save();
    this.renderShark();
    this.refresh();
  }

  repay(n) {
    const s = this.st, g = this.game;
    const debt = this.debt();
    const amt = Math.min(n, debt);
    if (!amt || g.credits < amt) return;
    g.credits -= amt;
    s.debt -= amt;
    if (s.debt <= 0) {
      s.debt = 0;
      this.sharkLine = pick(SHARK.paid);
      this.burst('DEBT FREE!', { color: '#7dff6a', size: 90, confetti: 40 });
      this.audio.cash();
    } else this.audio.tone(600, 0.1, 'triangle', 0.1);
    g.save();
    this.renderShark();
    this.refresh();
  }
}
