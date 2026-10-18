import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { devGit } from './tools/devGit.mjs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// `vite build --mode release`: the build behind the desktop downloads, without the dev tools (dev menu, cheats, debug overlay,
// Asset Row, trailer director): src/devtools.js; `npm run check:dev-strip`
export default defineConfig(({ mode }) => {
  const release = mode === 'release';
  return {
    base: './',
    define: { __APP_VERSION__: JSON.stringify(version), __DEV_TOOLS__: JSON.stringify(!release) }, // version: shown on title and pause screens
    // the Blender models (src/assets/*.glb) are imported with ?inline (models.js GLB)
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
