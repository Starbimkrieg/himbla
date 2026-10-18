import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { devGit } from './tools/devGit.mjs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// `vite build --mode release` makes the build the desktop downloads are made from: the dev tools (the hidden dev menu, the
// cheat menu, the debug overlay, the Asset Row, the trailer director) are left out of it (src/devtools.js; `npm run check:dev-strip`)
export default defineConfig(({ mode }) => {
  const release = mode === 'release';
  return {
    base: './',
    define: { __APP_VERSION__: JSON.stringify(version), __DEV_TOOLS__: JSON.stringify(!release) }, // (version: shown on the title and pause screens)
    // the runner model (src/assets/runner.glb, exported from Blender) is imported with ?inline
    assetsInclude: ['**/*.glb'],
    build: { chunkSizeWarningLimit: 2000 },
    plugins: [
      devGit(), // (dev server only: the dev menu's GIT FETCH & PULL)
      ...(release ? [{
        name: 'strip-dev-html',
        transformIndexHtml: (html) => html.replace(/<button id="dev-btn-pause"[^>]*>[^<]*<\/button>/, ''), // (the pause card's DEV MENU button)
      }] : []),
    ],
  };
});
