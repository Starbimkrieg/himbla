import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // the runner model (src/assets/runner.glb, exported from Blender) is imported with ?inline
  assetsInclude: ['**/*.glb'],
  build: { chunkSizeWarningLimit: 2000 },
});
