// Pixel-art sprites for the casino overlay (casino.js): slot symbols, the pit boss's portrait and small icons.
// Each sprite is rows of palette letters ('.' clear), one per pixel, with a 1 px ink outline. `px(name)` gives the
// markup; CSS --s sets one sprite pixel (default 4px), so `.reel .cell { --s: 6px }` scales a family, in whole pixels
// (image-rendering: pixelated, style.css .px).

const PAL = {
  k: '#1a1030',
  w: '#ffffff',
  a: '#fff6a8',
  y: '#ffd23f',
  o: '#ff9f1c',
  O: '#c4630f',
  r: '#ff2a4a',
  R: '#a3122a',
  p: '#ff2e88',
  c: '#2ee6ff',
  C: '#139fc4',
  b: '#3a8bff',
  g: '#7dff6a',
  G: '#35b84f',
  h: '#1d7a3a',
  s: '#e4e0f0',
  S: '#a9a3c2',
  t: '#6f6a8c',
  e: '#3d3858',
};

const SPRITES = {
  ptr: [
    'rrrrrrrrRRRRR',
    'krwwwwrrRRRRk',
    '.krrrrrrRRRk.',
    '.krrrrrrRRRk.',
    '..krrrrrRRk..',
    '..krrrrrRRk..',
    '...krrrrRk...',
    '....krrrk....',
    '....krrrk....',
    '.....krk.....',
    '......k......',
  ],
  moon: [
    '................',
    '.....kk.........',
    '...kkaak.....c..',
    '..kaaak.....cwc.',
    '.kaaak.......c..',
    '.kaayk..........',
    'kaOyyk..........',
    'kayyyk..........',
    'kyyOyyk.........',
    'kyyOyyk.........',
    '.kyyyyykkkkkk...',
    '.kyyyyyyyyOOOkc.',
    '..kyOyyyyOOOkcwc',
    '...kyyyyOOOk..c.',
    '....kkkkkkk.....',
    '................',
  ],
  comet: [
    '.k..............',
    'kak....k........',
    '.kakk.kyk......w',
    '..kaok.kyk....wc',
    '..koaykkyyk....w',
    '...kyaykkyyk....',
    '..k.kyayoyyyk...',
    '.krkkkyaywwwak..',
    '..krrkoywwwaaak.',
    '...krrrwwwaaayyk',
    '....krrwwaaayyok',
    '.a...krwaaayyook',
    '..o...kaaayyoook',
    '.......kayyoook.',
    '........kyoook..',
    '.........kkkk...',
  ],
  rocket: [
    '......kkkk......',
    '.....kkrpkk.....',
    '....kkrprrkk....',
    '...kkrrprrrkk...',
    '...kksssssSkk...',
    '...kkwwwcsSkk...',
    '...kkwwwcCSkk...',
    '...kkwccCCSkk...',
    '..kkrwwCCsSRkk..',
    '..kkrwwsssSRkk..',
    '.kkrrSSSSSSRRkk.',
    'kkrrrkkkkkkRRRkk',
    'kkrkkkoaaokkkRkk',
    '.kkkk.kook.kkkk.',
    '..k...kook...k..',
    '.......kk.......',
  ],
  alien: [
    '.....kkkkkk.....',
    '...kkaaggggkk...',
    '..kaaagggggggk..',
    '.kaaagggggggggk.',
    '.kggggggggggggk.',
    '.kggggggggggggk.',
    '.kkggggggggggkk.',
    '.kgkwggggggwkGk.',
    '.kgkkckggkckkGk.',
    '..kgkkggggkkGk..',
    '..kgggggggggGk..',
    '...kggghhggGk...',
    '...kggggggGGk...',
    '....kgghhGGk....',
    '.....kggGGk.....',
    '......kkkk......',
  ],
  ufo: [
    '................',
    '......kkkk......',
    '.....kwccck.....',
    '....kwwcccck....',
    '...kwwwccccck...',
    '...kcccccccCk...',
    '...kccgkgkCCk...',
    '.kkwwwwwssssskk.',
    'kssssssssssssssk',
    'sssrssysscsspsss',
    'kSSSttttttttSSSk',
    '.kSttttttttttSk.',
    '..kkkttttttkkk..',
    '.....kkkkkk.....',
    '....aaaaaaaa....',
    '...yayayayaya...',
  ],
  diamond: [
    '................',
    '...kkkkkkkkkkw..',
    '..kwwkcccckCwww.',
    '.kwwwkcccckCCwk.',
    'kwwwkwccccCkCCCk',
    'kkkkkkkkkkkkkkkk',
    'kcccckbbbbbkCCCk',
    '.kccckkbbbkkCCk.',
    '..kccckbbbkCCk..',
    '...kcckbbbkCk...',
    '...kcckkbkkCk...',
    '....kcckbkCk....',
    '.....kckbkk.....',
    '......kkkk......',
    '......kckk......',
    '.......kk.......',
  ],
  wild: [
    '................',
    '.......kk.......',
    '......kaak......',
    '......kaak......',
    '.....kaaaak.....',
    '.kkkkaaaaaakkkk.',
    'kaaaaaaaaayyyyyk',
    '.kaaaaaaayyyyyk.',
    '..kaaaaayyyyyk..',
    '...kyyyyyyyOk...',
    '...kyyyyyyOOk...',
    '...kyyyyyOOOk...',
    '...kyyykkOOOk...',
    '...kyyk..kOOk...',
    '....kk....kk....',
    '................',
  ],
  star: [
    '....k....',
    '...kak...',
    '.kkkakkk.',
    'kaaaaayyk',
    'kaaaayyyk',
    '.kyyyyOk.',
    '.kyyyOOk.',
    '.kyykOOk.',
    '..kk.kk..',
  ],
  lizard: [
    '..........kGk.k.........',
    '........kkkGkkGk.k......',
    '......kkGgggggGkkGk.....',
    '.....kaaGgggggggGGk.....',
    '.....kaaggggggggGGk.....',
    '....kaGaggggggggGGGk....',
    '...kkaaaggggggggGGGGk...',
    '..kkkkkkkkkkkkkkkkkkkk..',
    '..kkkpppcckkkkppcckkkk..',
    '..kkkpppkwkkkkppkkwkGk..',
    '.kGkkkkkkkkkkkkkkkkkkGk.',
    '.kGkkkkkkggggggkkkkkkGk.',
    '.kGGGGgggghgghggGGGGGGk.',
    '.kGGGgggggggggggGGGGGGk.',
    '..kGGkgkggggggggGkGGGk..',
    '..kGk.kGkkkkkkkkkGkkGk..',
    '...k...kGwGyywGwGGk.k...',
    '....kkkwwwGGGGGGwkkk....',
    '...keeeewwwwwwwweeeek...',
    '..keeeeewwwwwwwweeeeek..',
    '.keeeeeeerrRRrreeeeeeek.',
    '.keeeeeeerrRRrreeeeeeek.',
    '.keeeeeeeeewweeeeeeeeek.',
    'keeeeeeeeeeeeeeeeeeeeeek',
  ],
  chip: [
    '...kkgwwgkk...',
    '..kgggggggGk..',
    '.kwggggggGGwk.',
    'kgggghhhhGGGGk',
    'kggghGGGGhGGGk',
    'ggghGGaaaGhGGG',
    'wgghGaaaaGhGGw',
    'wgghGaaaaGhGGw',
    'ggghGGaaaGhGGG',
    'kgGGhGGaGhGGGk',
    'kGGGGhhhhGGGGk',
    '.kwGGGGGGGGwk.',
    '..kGGGGGGGGk..',
    '...kkGwwGkk...',
  ],
  coin: [
    '...kkaakk...',
    '..kaaaayyk..',
    '.kaaayyyyyk.',
    'kaayyOOyoyyk',
    'kaayyOOooyyk',
    'aayyyOOoooOO',
    'aayyyOOoooOO',
    'kyyyoOOooOOk',
    'kyyooOOooOOk',
    '.kyyyooOOOk.',
    '..kyyOOOOk..',
    '...kkOOkk...',
  ],
  flame: [
    '....kk....',
    '...krrk...',
    '...krrrk..',
    '..kkrrrk..',
    '.krkrrrrk.',
    '.krrrorrrk',
    'krrrooorrk',
    'krroooorrk',
    'krooaaoork',
    'krooaaoork',
    'krooaaoork',
    '.kroaaork.',
    '..krrrrk..',
  ],
  lock: [
    '.kwwSSSSk.',
    '.kwwSSSSk.',
    '.kSSkkSSk.',
    '.kSSkkSSk.',
    'kkSSkkSSkk',
    'aaaaaaaaaa',
    'aaaaaaaaaa',
    'yyyykkyyyy',
    'yyyykkyyyy',
    'yyyykkyyyy',
    'OOOOOOOOOO',
    'OOOOOOOOOO',
  ],
  crown: [
    '......kak.....',
    'k.....kk.....k',
    'yk...kayk...ky',
    'kk...kayk...kk',
    'kak.kaayyk.kyk',
    'kyykyyyyyykyyk',
    'kyyyyyyyyyyyyk',
    'kyyyyyyyyyyyyk',
    'kyyyryycyypyyk',
    'kOOOOOOOOOOOOk',
    '.kOOOOOOOOOOk.',
    '..kkkkkkkkkk..',
  ],
  spade: [
    '....k....',
    '...kkk...',
    '..kkkkk..',
    '..kkkkk..',
    '.kkkkkkk.',
    'kkkkkkkkk',
    '.kk.k.kk.',
    '....k....',
    '...kkk...',
  ],
  heart: [
    '.........',
    '.rrr.rrr.',
    'rrrrrrrrr',
    'rrrrrrrrr',
    'rrrrrrrrr',
    '.rrrrrrr.',
    '..rrrrr..',
    '...rrr...',
    '....r....',
  ],
  diamondsuit: [
    '....r....',
    '...rrr...',
    '..rrrrr..',
    '.rrrrrrr.',
    'rrrrrrrrr',
    '.rrrrrrr.',
    '..rrrrr..',
    '...rrr...',
    '....r....',
  ],
  club: [
    '...kkk...',
    '..kkkkk..',
    '..kkkkk..',
    '.kkkkkkk.',
    'kkkkkkkkk',
    'kkkkkkkkk',
    'kkkkkkkkk',
    '..kkkkk..',
    '...kkk...',
  ],
};

// On first use, one data-URL class per sprite goes into a single <style>: `.px-moon { background-image: url(...); --w: 16;
// --h: 16 }`. Canvases are kept for drawing onto other canvases (prize wheel labels).
const CANVAS = new Map();
function canvasOf(name) {
  let cv = CANVAS.get(name);
  if (cv || !SPRITES[name]) return cv || null;
  const rows = SPRITES[name], w = rows[0].length, h = rows.length;
  cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const cx = cv.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const c = PAL[row[x]];
      if (!c) continue;
      cx.fillStyle = c;
      cx.fillRect(x, y, 1, 1);
    }
  });
  CANVAS.set(name, cv);
  return cv;
}

let installed = false;
function install() {
  installed = true;
  let css = '';
  for (const name of Object.keys(SPRITES)) {
    const cv = canvasOf(name);
    css += `.px-${name}{--w:${cv.width};--h:${cv.height};background-image:url(${cv.toDataURL()})}
`;
  }
  const el = document.createElement('style');
  el.id = 'px-icons';
  el.textContent = css;
  document.head.appendChild(el);
}

// Sprite markup. `cls` adds classes (size, layout).
export function px(name, cls = '') {
  if (!installed) install();
  if (!SPRITES[name]) return '';
  return `<span class="px px-${name}${cls ? ' ' + cls : ''}"></span>`;
}

// The sprite canvas (a pixel per cell) to draw with smoothing off, or null.
export function pxCanvas(name) { return canvasOf(name); }
