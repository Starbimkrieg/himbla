// Interactive "terminal page": a grid of building tiles (icon, feature line, state chip) plus a detail screen for the selected
// one. Renders from a plain spec and reports clicks, game-agnostic: used by the outpost terminal (story.js outpostMenu, in
// g.dialog) and the council hall (hometown.js, in g.dialog and the job board's second tab). Styles: .otm-* in style.css.
//
//   terminalPage(spec) -> html     wireTerminal(root, { onSelect, onAct })     stepSel(root, sel, code) -> id | null
//
// spec = {
//   accent: '#ff9f1c',                      // faction colour: the header rule
//   title, sub,                             // "PIKE'S HOPE", "KEPLER HOMESTEAD"
//   stats: [{ k: 'CREDITS', v: '₵1200', tone: 'gold' }, ...],
//   tiles: [{ id, name, icon, tint, state: 'built' | 'open' | 'full' | 'locked', feature, chip: 'BUILT' | '₵600', chipTone: 'ok' | 'short', key: '' | 1..9 }],
//   sel,                                    // id of the selected tile
//   detail: { id, name, icon, tint, state, stateText, desc, rows: [[label, value, tone?]], meter?: { v: 0..1, text },
//             action?: { id, label, key, tone: 'go' | 'build' },   // one button, or
//             actions?: [{ id, label, key, tone: 'go' | 'build' | 'vote' }, ...],   // several (town buildings can have more than one)
//             note?: 'why there is no action', msg?: '', msgTone?: 'bad' | 'ok' },
//   closeKey, foot: { kb, pad },            // footer hint html (pad: shown while a controller is in use)
//   bare: true,                             // no header / footer: for a tab inside another screen (the job board)
//   cols: 3,                                // tile columns (default 4; style.css narrow-screen rules still win)
//   side: true,                             // wide screens: tiles left, full-height detail right
//   (a detail with no button shows detail.note instead; a button's `tone` may add ' short' for "can't afford")
// }
// Clicks: tiles carry data-sel="<id>", actions data-act="<id>" ('close' for the header close button).

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- icons: 12x12 pixel art as ASCII bitmaps. '#' body (--i1), '+' accent (--i2), 'o' shade (--i3), '.' empty ----
const ICONS = {
  greenhouse: [
    '....####....',
    '..##oooo##..',
    '.#oo+oo+oo#.',
    '.#o+++o+++#.',
    '#ooo+ooo+oo#',
    '#ooo+oo+++o#',
    '#ooo+ooo+oo#',
    '############',
    '.##oooooo##.',
  ],
  clinic: [
    '..########..',
    '.#oooooooo#.',
    '#oooo++oooo#',
    '#oooo++oooo#',
    '#oo++++++oo#',
    '#oo++++++oo#',
    '#oooo++oooo#',
    '#oooo++oooo#',
    '.#oooooooo#.',
    '..########..',
  ],
  beacon: [
    '.+...##...+.',
    '+..+.##.+..+',
    '+.+..##..+.+',
    '+..+.##.+..+',
    '.+...##...+.',
    '.....##.....',
    '....#oo#....',
    '....#oo#....',
    '...#oooo#...',
    '...#oooo#...',
    '..########..',
  ],
  turret: [
    '..#####.....',
    '.#ooooo#####',
    '.#o+++o#....',
    '.#ooooo#####',
    '..#####.....',
    '...#oo#.....',
    '...#oo#.....',
    '...#oo#.....',
    '..#oooo#....',
    '.########...',
  ],
  turret2: [
    '..#####.....',
    '.#ooooo#####',
    '.#o+++o#....',
    '.#ooooo#####',
    '..#####.....',
    '...#oo#..+++',
    '...#oo#....+',
    '...#oo#..+++',
    '..#oooo#.+..',
    '.########+++',
  ],
  market: [
    '############',
    '+#+#+#+#+#+#',
    '+#+#+#+#+#+#',
    '.+.+.+.+.+.+',
    '..#......#..',
    '..#.++oo.#..',
    '..#.++oo.#..',
    '..########..',
    '..#o....o#..',
    '..#o....o#..',
  ],
  garage: [
    '....####....',
    '..##oooo##..',
    '.#oooooooo#.',
    '#oo######oo#',
    '#oo#++++#oo#',
    '#oo#oooo#oo#',
    '#oo#++++#oo#',
    '#oo#oooo#oo#',
    '############',
  ],
  // town: housing domes, road crew lane, landing pad from above, bank vault door, council hall columns
  housing: [
    '....####....',
    '..##oooo##..',
    '.#oo+oo+oo#.',
    '.#oo+oo+oo#.',
    '#oooooooooo#',
    '#ooo+##+ooo#',
    '#ooo+##+ooo#',
    '############',
  ],
  roads: [
    '.....##.....',
    '....#oo#....',
    '....#oo#....',
    '...#o++o#...',
    '...#oooo#...',
    '..#oo++oo#..',
    '..#oooooo#..',
    '.#ooo++ooo#.',
    '.#oooooooo#.',
    '############',
  ],
  pad: [
    '...######...',
    '..#oooooo#..',
    '.#oo+oo+oo#.',
    '#ooo+oo+ooo#',
    '#ooo++++ooo#',
    '#ooo+oo+ooo#',
    '.#oo+oo+oo#.',
    '..#oooooo#..',
    '...######...',
  ],
  bank: [
    '..########..',
    '.#++++++++#.',
    '.#oooooooo#.',
    '..########..',
    '.##########.',
    '#++++++++++#',
    '#oooooooooo#',
    '.##########.',
  ],
  council: [
    '.....##.....',
    '....#oo#....',
    '..##oooo##..',
    '.#oooooooo#.',
    '############',
    '.#+#+##+#+#.',
    '.#+#+##+#+#.',
    '.#+#+##+#+#.',
    '############',
  ],
};

const iconCache = new Map(), warned = new Set();
// One <svg> per icon, a path per tone: a tile recolours it by setting --i1 / --i2 / --i3.
function icon(name, cls = '') {
  const key = `${name}|${cls}`;
  let svg = iconCache.get(key);
  if (svg) return svg;
  if (!ICONS[name] && !warned.has(name)) { warned.add(name); console.warn(`terminalUI: no icon "${name}"`); }
  const rows = ICONS[name] || ICONS.turret;
  const pad = Math.floor((12 - rows.length) / 2);
  const d = { '#': '', '+': '', o: '' };
  rows.forEach((row, ry) => {
    for (let x = 0; x < row.length;) {
      const c = row[x];
      if (!(c in d)) { x++; continue; }
      let w = 1;
      while (row[x + w] === c) w++;
      d[c] += `M${x} ${ry + pad}h${w}v1h-${w}z`; // horizontal runs: a few dozen commands per icon
      x += w;
    }
  });
  svg = `<svg class="otm-ico ${cls}" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><path class="i3" d="${d.o}"/><path class="i1" d="${d['#']}"/><path class="i2" d="${d['+']}"/></svg>`;
  iconCache.set(key, svg);
  return svg;
}

// ---- markup ----
export function terminalPage(s) {
  const tile = (t) => `<button type="button" class="otm-tile ${t.state}${t.id === s.sel ? ' sel' : ''}" data-sel="${esc(t.id)}" style="--tint:${t.tint}" aria-pressed="${t.id === s.sel}">
      ${t.key ? `<span class="otm-key">${t.key}</span>` : ''}${icon(t.icon)}
      <span class="otm-name">${esc(t.name)}</span>
      <span class="otm-feat">${esc(t.feature).replace(/₵\d+|\d*5\d*/g, '<b class="cr">$&</b>')}</span>
      <span class="otm-chip ${t.chipTone || ''}">${esc(t.chip)}</span>
    </button>`;
  const d = s.detail;
  let detail = '';
  if (d) {
    const list = d.actions || (d.action ? [d.action] : []);
    const btn = (a) => `<button type="button" class="otm-act ${a.tone || ''}" data-act="${esc(a.id)}">${a.key ? `<span class="otm-key">${a.key}</span>` : ''}<span>${esc(a.label)}</span></button>`;
    detail = `<section class="otm-detail ${d.state}" style="--tint:${d.tint}">
      <div class="otm-d-art">${icon(d.icon)}</div>
      <div class="otm-d-main">
        <div class="otm-d-top"><span class="otm-d-name">${esc(d.name)}</span><span class="otm-pill ${d.state}">${esc(d.stateText)}</span></div>
        <p class="otm-d-desc">${esc(d.desc)}</p>
        <div class="otm-rows">${d.rows.map(([k, v, tone]) => { const cls = [tone, /[₵5]/.test(v) ? 'cr' : ''].filter(Boolean).join(' '); return `<div class="otm-row"><span>${esc(k)}</span><b${cls ? ` class="${cls}"` : ''}>${esc(v)}</b></div>`; }).join('')}</div>
        ${d.meter ? `<div class="otm-meter"><div class="otm-bar"><i style="width:${Math.round(Math.max(0, Math.min(1, d.meter.v)) * 100)}%"></i></div><span>${esc(d.meter.text)}</span></div>` : ''}
        ${list.length ? `<div class="otm-acts">${list.map(btn).join('')}</div>` : (d.note ? `<div class="otm-note">${esc(d.note)}</div>` : '')}
        <div class="otm-msg ${d.msg ? d.msgTone || '' : 'empty'}" role="status">${d.msg ? esc(d.msg) : ''}</div>
      </div>
    </section>`;
  }
  const head = s.bare ? '' : `<header class="otm-head">
      <div class="otm-title">◢ ${esc(s.title)}<span class="otm-cursor">█</span><small>${esc(s.sub || '')}</small></div>
      <button type="button" class="otm-close" data-act="close">${s.closeKey ? `<span class="otm-key">${s.closeKey}</span>` : ''}ESC · CLOSE</button>
    </header>`;
  const foot = s.bare ? '' : `<footer class="otm-foot"><span class="foot-kb">&gt; ${s.foot.kb}</span><span class="foot-pad">&gt; ${s.foot.pad}</span><span class="otm-cursor">_</span></footer>`;
  return `<div class="otm${s.bare ? ' bare' : ''}${s.side ? ' side' : ''}" style="--fc:${s.accent || 'var(--yellow)'}">
    ${head}
    <div class="otm-body">
      <div class="otm-stats">${s.stats.map((x) => `<div class="otm-stat"><label>${esc(x.k)}</label><b${x.tone ? ` class="${x.tone}"` : ''}>${esc(x.v)}</b></div>`).join('')}</div>
      <div class="otm-grid" role="group" aria-label="Buildings"${s.cols ? ` style="--cols:${s.cols}"` : ''}>${s.tiles.map(tile).join('')}</div>
    </div>
    ${detail}
    ${foot}
  </div>`;
}

// ---- events: one delegated listener per render (innerHTML rebuilds the page, so nothing leaks) ----
// Clicks stop here, else any <button> in #dialog reads as a dialog choice (hud.dialog's onclick).
export function wireTerminal(root, { onSelect, onAct }) {
  if (!root) return;
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-sel], [data-act]');
    if (!t || !root.contains(t)) return;
    e.stopPropagation();
    const act = root.querySelector('.otm-act');
    if (t.dataset.act) onAct(t.dataset.act);
    // pad A is a click with detail 0 on an already-selected tile (D-pad never lands on the button), so it presses that tile's button
    else if (e.detail === 0 && document.body.classList.contains('pad-on') && t.classList.contains('sel') && act) onAct(act.dataset.act);
    else onSelect(t.dataset.sel);
  });
  // the pad highlight fires a synthetic mouseover (gamepad.js setFocus): the detail follows it
  root.addEventListener('mouseover', (e) => {
    if (!document.body.classList.contains('pad-on')) return;
    const t = e.target.closest('[data-sel]');
    if (t && !t.classList.contains('sel')) onSelect(t.dataset.sel);
  });
}

// A repaint snaps the tile list to the top: `const done = keepScroll(); g.dialog(...); done();` restores the scroll and brings
// the selected tile into view (small screens scroll the grid above the pinned detail). host: '#dialog', or '#board' for the job board tab.
export function keepScroll(host = '#dialog') {
  const b = document.querySelector(`${host} .otm-body`);
  const y = b ? b.scrollTop : 0;
  return () => {
    const n = document.querySelector(`${host} .otm-body`);
    if (!n) return;
    n.scrollTop = y;
    const t = n.querySelector('.otm-tile.sel');
    if (t) t.scrollIntoView({ block: 'nearest' });
  };
}

// Arrow keys / WASD over the tile grid (columns as CSS laid them out): id to select, or null for other keys.
export function stepSel(root, sel, code) {
  const ids = [...root.querySelectorAll('[data-sel]')].map((t) => t.dataset.sel);
  const grid = root.querySelector('.otm-grid');
  if (!ids.length || !grid) return null;
  const cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').length);
  const step = { ArrowRight: 1, KeyD: 1, ArrowLeft: -1, KeyA: -1, ArrowDown: cols, KeyS: cols, ArrowUp: -cols, KeyW: -cols }[code];
  if (step === undefined) return null;
  const i = Math.max(0, ids.indexOf(sel));
  let j = i + step;
  if (Math.abs(step) > 1 && (j < 0 || j >= ids.length)) { // vertical move off the grid: into a short last row lands on its last tile; edge rows stay put
    const lastRow = Math.floor((ids.length - 1) / cols);
    j = j >= ids.length && Math.floor(i / cols) < lastRow ? ids.length - 1 : i;
  }
  return ids[Math.max(0, Math.min(ids.length - 1, j))];
}
