import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://realpls.com',
  build: {
    assets: '_assets'
  },
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            exifr: ['exifr']
          }
        }
      }
    }
  }
});

