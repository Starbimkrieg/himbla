// Pixel fonts (bundled so the desktop build works offline).
//   DISPLAY: Press Start 2P — headings, numbers, chips, in-world signs, canvas labels
//   BODY:    Pixelify Sans — readable pixel text for sentences at small sizes
// CSS gets them through --comic (display) and --body (text) in style.css.
import '@fontsource/press-start-2p/400.css';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';

export const DISPLAY = '"Press Start 2P", "Pixelify Sans", monospace';
export const BODY = '"Pixelify Sans", "Press Start 2P", sans-serif';

// Canvas font string in the display face. Press Start 2P is wide, so callers pass the size
// they want (roughly 0.6x what the old Bangers text used).
export const pixelFont = (px) => `${Math.round(px)}px ${DISPLAY}`;
export const bodyFont = (px, weight = 400) => `${weight} ${Math.round(px)}px ${BODY}`;

// Canvas text only uses a web font once it has loaded, so wait for the faces before any
// textSprite / board canvas is drawn. Never blocks for more than a couple of seconds.
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
