import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://hyperscales.app',
  output: 'server',
  adapter: cloudflare({ platformProxy: { enabled: true } }),
  integrations: [tailwind(), sitemap()],
  vite: {
    build: {
      // A hangfájlok (src/assets/audio) mindig külön, tartalom-hash-es fájlként menjenek ki (/_astro/, immutable),
      // akkor is, ha 4 KB alattiak — különben a Vite base64-ként a JS-be ágyazná őket, és nem lenne lusta a betöltés.
      assetsInlineLimit: (file) => (/\.(ogg|m4a)$/.test(file) ? false : undefined),
    },
  },
});
