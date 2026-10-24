// Pixel fonts (bundled so the desktop build works offline).
//   DISPLAY: Press Start 2P — headings, numbers, chips, in-world signs, canvas labels
//   BODY:    Jersey 15 — readable pixel text for sentences at small sizes (a clean 5, letters that don't run together)
// CSS gets them through --comic (display) and --body (text) in style.css.
import '@fontsource/press-start-2p/400.css';
import jerseyLatin from '@fontsource/jersey-15/files/jersey-15-latin-400-normal.woff2?url';
import jerseyExt from '@fontsource/jersey-15/files/jersey-15-latin-ext-400-normal.woff2?url';
import creditDisplay from './assets/fonts/credit-display.woff2?url';
import creditBody from './assets/fonts/credit-body.woff2?url';

// Jersey 15 is registered here rather than through its @fontsource stylesheet so it can be scaled: drawn 15 % larger, its capitals stand as
// tall as the old body face's (Pixelify Sans) did at the sizes the UI was laid out for, and its lines still come out a little shorter.
// It has one weight: a <b> is the browser's synthesised bold, a pixel thicker.
// Neither face has the credit sign (₵): tools/make-credit-glyph.py draws one for each (its own C with a bar through it, on its pixel grid)
// into a one-glyph font, "Display Credit" and "Body Credit", which each stack lists right after its face.
if (typeof FontFace !== 'undefined' && typeof document !== 'undefined' && document.fonts) {
  for (const [url, range] of [
    [jerseyLatin, 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'],
    [jerseyExt, 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'],
  ]) document.fonts.add(new FontFace('Jersey 15', `url(${url}) format('woff2')`, { weight: '400', display: 'swap', sizeAdjust: '115%', unicodeRange: range }));
  document.fonts.add(new FontFace('Display Credit', `url(${creditDisplay}) format('woff2')`, { weight: '400', display: 'swap', unicodeRange: 'U+20B5' }));
  document.fonts.add(new FontFace('Body Credit', `url(${creditBody}) format('woff2')`, { weight: '400', display: 'swap', sizeAdjust: '115%', unicodeRange: 'U+20B5' }));
}

export const DISPLAY = '"Press Start 2P", "Display Credit", "Jersey 15", monospace';
export const BODY = '"Jersey 15", "Body Credit", "Press Start 2P", sans-serif';

// Canvas font string in the display face. Press Start 2P is wide, so callers pass the size
// they want (roughly 0.6x what the old Bangers text used).
export const pixelFont = (px) => `${Math.round(px)}px ${DISPLAY}`;

// Canvas text only uses a web font once it has loaded, so wait for the faces before any
// textSprite / board canvas is drawn. Never blocks for more than a couple of seconds.
export function loadFonts(timeout = 3000) {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const sample = 'MOON-RUNNER 0123456789 abc';
  const all = Promise.all([
    document.fonts.load('16px "Press Start 2P"', sample),
    document.fonts.load('16px "Jersey 15"', sample + ' ₵'),
    document.fonts.load('16px "Display Credit"', '₵'),
    document.fonts.load('16px "Body Credit"', '₵'),
  ]).catch(() => {});
  return Promise.race([all, new Promise((r) => setTimeout(r, timeout))]);
}
