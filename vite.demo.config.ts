import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
export default defineConfig({
  root: fileURLToPath(new URL('./src/client', import.meta.url)),
  define: { __LOCAL_DEMO__: true },
  publicDir: '../../public',
  optimizeDeps: { entries: ['game.html'] },
  server: { port: 5173 },
  build: {
    outDir: '../../dist/demo',
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL('./src/client/game.html', import.meta.url)) },
  },
});
