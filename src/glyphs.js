// Controller glyphs. While a pad is in use (gamepad.js calls setActive), every key name the UI shows
// (<b>F</b> in a prompt, "Press V" in a toast, tutorial steps, tips, dialogue, chips) is swapped for
// the button that does the same thing on a controller, drawn the way the pad's own family does
// (Xbox / PlayStation / Switch). Back on the keyboard they all swap back. The pad's actual mapping is
// in gamepad.js; this only names it.

// The real Xbox One button art (Xelu's controller prompts, CC0), inlined like the other assets
import xA from './assets/xbox/A.png?inline';
import xB from './assets/xbox/B.png?inline';
import xX from './assets/xbox/X.png?inline';
import xY from './assets/xbox/Y.png?inline';
import xLB from './assets/xbox/LB.png?inline';
import xRB from './assets/xbox/RB.png?inline';
import xLT from './assets/xbox/LT.png?inline';
import xRT from './assets/xbox/RT.png?inline';
import xView from './assets/xbox/Windows.png?inline';
import xMenu from './assets/xbox/Menu.png?inline';
import xLS from './assets/xbox/Left_Stick.png?inline';
import xRS from './assets/xbox/Right_Stick.png?inline';
import xDU from './assets/xbox/Dpad_Up.png?inline';
import xDD from './assets/xbox/Dpad_Down.png?inline';
import xDL from './assets/xbox/Dpad_Left.png?inline';
import xDR from './assets/xbox/Dpad_Right.png?inline';
const XBOX_ART = { A: xA, B: xB, X: xX, Y: xY, LB: xLB, RB: xRB, LT: xLT, RT: xRT, VIEW: xView, START: xMenu, LS: xLS, RS: xRS, L3: xLS, R3: xRS, DU: xDU, DD: xDD, DL: xDL, DR: xDR };

export const glyphState = { kind: 'xbox' };

// tokens are standard-mapping buttons: each family names (and colours) them its own way
const FACE = {
  xbox: { A: ['A', 'g'], B: ['B', 'r'], X: ['X', 'b'], Y: ['Y', 'y'], LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', VIEW: '⧉', START: '☰' },
  ps: { A: ['✕', 'b'], B: ['○', 'r'], X: ['□', 'p'], Y: ['△', 'g'], LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', VIEW: 'CREATE', START: 'OPTIONS' },
  switch: { A: 'B', B: 'A', X: 'Y', Y: 'X', LB: 'L', RB: 'R', LT: 'ZL', RT: 'ZR', VIEW: '−', START: '+' },
};
const SHAPE = { LB: 'bump', RB: 'bump', LT: 'bump', RT: 'bump', VIEW: 'small', START: 'small', LS: 'stick', RS: 'stick', L3: 'stick', R3: 'stick', DU: 'dpad', DD: 'dpad', DL: 'dpad', DR: 'dpad' };
const MISC = { LS: 'L', RS: 'R', L3: 'L3', R3: 'R3', DU: '▲', DD: '▼', DL: '◀', DR: '▶' };

// PlayStation face symbols are drawn, not typed: fonts place those characters all over their line box
const SYMS = {
  '✕': '<path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5"/>',
  '○': '<circle cx="6" cy="6" r="3.8"/>',
  '□': '<rect x="2.3" y="2.3" width="7.4" height="7.4"/>',
  '△': '<path d="M6 1.8L10.4 9.8H1.6Z"/>',
};

// '#text' in a token list is plain text between glyphs
// [label, colour token] of a face button for a pad family (for the in-world signs, which draw their own glyphs)
export function faceInfo(token, kind = glyphState.kind) {
  const f = (FACE[kind] || FACE.xbox)[token] || token;
  return Array.isArray(f) ? f : [f, ''];
}

export function glyphHtml(tokens, kind = glyphState.kind) {
  const face = FACE[kind] || FACE.xbox;
  return tokens.map((t) => {
    if (t[0] === '#') return `<span class="pg-txt">${t.slice(1)}</span>`;
    if (kind === 'xbox' && XBOX_ART[t]) return `<i class="pg pg-img pg-${SHAPE[t] || 'face'} xb-${t.toLowerCase()}"><img src="${XBOX_ART[t]}" alt="${t}" draggable="false"></i>`;
    const f = face[t] || MISC[t] || t;
    const [txt, col] = Array.isArray(f) ? f : [f, ''];
    if (SYMS[txt]) return `<i class="pg pg-face pg-sym pg-${col}"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">${SYMS[txt]}</svg></i>`;
    const len = [...txt].length; // (labels longer than one character widen the button to a pill so they sit inside it)
    return `<i class="pg pg-${SHAPE[t] || 'face'} ${col ? 'pg-' + col : ''} ${len > 1 ? 'long' : ''} ${len > 3 ? 'tiny' : ''}">${txt}</i>`;
  }).join('');
}

// What a key name in the UI means on the pad (null: no equivalent, left as it is)
const WORDS = {
  SPACE: ['LB'], SHIFT: ['A'], ENTER: ['A'], MOUSE: ['RS'], 'RIGHT MOUSE': ['LT'], RMB: ['LT'], 'E/RMB': ['LT'], LMB: ['RT'],
  E: ['RB'], Q: ['B'], F: ['X'], G: ['R3'], V: ['Y'], M: ['VIEW'], R: ['VIEW', '#hold'],
  X: ['DD'], C: ['DD'], J: ['DD'], P: ['DD'], T: ['DD'], // (the radial menu's wedges; N has no button: music is under Settings → Audio)
};
export function tokensFor(text) {
  const t = text.trim();
  if (WORDS[t]) return WORDS[t];
  if (/^[WASD](?:[ /+]?[WASD])*$/.test(t)) return ['LS'];
  return null;
}

const SKIP = '#settings, #help, .controls-mini, #padradial, #vradial, #powradial, .pgx, script, style, textarea, input, select, canvas';
const KEY_IN_TEXT = /\b(Press|press|PRESS|Hold|hold|HOLD) (ENTER|SPACE|SHIFT|[A-Z])(?![A-Za-z0-9'’])/g;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export class Glyphs {
  constructor() {
    this.on = false;
    this.obs = new MutationObserver((recs) => this.onMutations(recs));
  }

  set(on, kind) {
    if (kind) glyphState.kind = kind;
    if (on === this.on) return;
    this.on = on;
    if (on) {
      this.process(document.body);
      this.obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    } else {
      this.obs.disconnect();
      this.revert();
    }
  }

  onMutations(recs) {
    const roots = new Set();
    for (const r of recs) {
      if (r.type === 'characterData') roots.add(r.target);
      else for (const n of r.addedNodes) roots.add(n);
    }
    for (const n of roots) if (n.isConnected) this.process(n);
    this.obs.takeRecords(); // (our own swaps are not news)
  }

  process(node) {
    if (node.nodeType === 3) { this.text(node); return; }
    if (node.nodeType !== 1 || node.closest(SKIP)) return;
    const bolds = node.matches('b') ? [node] : [];
    bolds.push(...node.querySelectorAll('b'));
    for (const b of bolds) {
      if (b.classList.contains('pgx') || b.closest(SKIP)) continue;
      const toks = tokensFor(b.textContent);
      if (!toks) continue;
      b.dataset.pgo = b.innerHTML;
      b.classList.add('pgx');
      b.innerHTML = glyphHtml(toks);
    }
    const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const texts = [];
    for (let n = w.nextNode(); n; n = w.nextNode()) if (/(?:ress|old) [A-Z]/.test(n.nodeValue)) texts.push(n);
    for (const n of texts) this.text(n);
  }

  // "Press V" / "hold E" in running text: the key becomes a glyph, the rest stays
  text(n) {
    const p = n.parentElement;
    const s = n.nodeValue;
    if (!p || p.closest(SKIP) || !/(?:ress|old) [A-Z]/.test(s)) return;
    let html = '', last = 0, hit = false;
    for (const m of s.matchAll(KEY_IN_TEXT)) {
      let toks = WORDS[m[2]];
      if (!toks) continue;
      if (/^hold$/i.test(m[1]) && m[2] === 'R') toks = ['VIEW']; // ("hold" is already said)
      html += esc(s.slice(last, m.index)) + `${m[1]} ${glyphHtml(toks)}`;
      last = m.index + m[0].length;
      hit = true;
    }
    if (!hit) return;
    html += esc(s.slice(last));
    const span = document.createElement('span');
    span.className = 'pgx';
    span.dataset.pgo = s;
    span.innerHTML = html;
    n.replaceWith(span);
  }

  revert() {
    for (const el of document.querySelectorAll('.pgx[data-pgo]')) {
      if (el.tagName === 'B') { el.innerHTML = el.dataset.pgo; el.classList.remove('pgx'); delete el.dataset.pgo; }
      else el.replaceWith(document.createTextNode(el.dataset.pgo));
    }
  }
}
