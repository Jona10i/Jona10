import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        'firebase/app': path.resolve(__dirname, './src/lib/firebase-shim.ts'),
        'firebase/auth': path.resolve(__dirname, './src/lib/firebase-shim.ts'),
        'firebase/firestore': path.resolve(__dirname, './src/lib/firebase-shim.ts'),
        'firebase/storage': path.resolve(__dirname, './src/lib/firebase-shim.ts'),
      },
    },
    build: {
      // Firebase vendor legitimately exceeds 500 kB minified; it is cached
      // independently and rarely changes, so the warning threshold is raised.
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          // Split heavy, rarely-changing vendor code into long-lived chunks so
          // app-code deploys don't bust the whole bundle's cache. The 'charts'
          // chunk is only referenced by the lazy AuditLogView, so it loads on demand.
          // onlyExplicitManualChunks: don't pull dependencies of matched modules
          // into these chunks -- otherwise a dep shared with eager code (e.g. a
          // recharts sub-dep) would force the entry to import 'charts' eagerly.
          onlyExplicitManualChunks: true,
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return;
            if (id.includes('node_modules/@firebase/') || id.includes('node_modules/firebase/')) {
              return 'firebase-vendor';
            }
            if (
              id.includes('node_modules/recharts/') ||
              id.includes('node_modules/victory-vendor/') ||
              id.includes('node_modules/d3-') ||
              id.includes('node_modules/decimal.js-light/') ||
              id.includes('node_modules/react-smooth/')
            ) {
              return 'charts';
            }
            if (
              id.includes('node_modules/motion/') ||
              id.includes('node_modules/motion-dom/') ||
              id.includes('node_modules/motion-utils/')
            ) {
              return 'motion';
            }
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/scheduler/')
            ) {
              return 'react-vendor';
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify -- file watching is disabled to prevent flickering during agent edits.
      hmr: false,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: null,
      // Allow requests arriving via tunnel/share URLs (Vite 6 default-denies
      // unknown Host headers). Leading dot matches all subdomains, so quick
      // tunnels keep working even though their hostname changes each restart.
      allowedHosts: [
        'stored-precision-interpreted-worcester.trycloudflare.com',
        '.trycloudflare.com',
        '.ngrok.io',
        '.ngrok-free.app',
      ],
    },
  };
});
