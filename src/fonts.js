// Pixel fonts, bundled so the desktop build works offline.
//   DISPLAY: Press Start 2P (headings, numbers, chips, in-world signs, canvas labels)
//   BODY:    Pixelify Sans (sentences at small sizes)
// CSS uses them via --comic (display) and --body in style.css.
import '@fontsource/press-start-2p/400.css';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';

export const DISPLAY = '"Press Start 2P", "Pixelify Sans", monospace';
export const BODY = '"Pixelify Sans", "Press Start 2P", sans-serif';

// Canvas font string in the display face (it is wide, so callers pass small sizes).
export const pixelFont = (px) => `${Math.round(px)}px ${DISPLAY}`;

// Canvas only uses a web font once loaded, so await this before drawing textSprites / boards. Gives up after `timeout` ms.
export function loadFonts(timeout = 3000) {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const sample = 'MOON-RUNNER 0123456789 abc';
  const all = Promise.all([
    document.fonts.load('16px "Press Start 2P"', sample),
    document.fonts.load('400 16px "Pixelify Sans"', sample),
    document.fonts.load('700 16px "Pixelify Sans"', sample),
  ]).catch(() => {});
  return Promise.race([all, new Promise((r) => setTimeout(r, timeout))]);
}
