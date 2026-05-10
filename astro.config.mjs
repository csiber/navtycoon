import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://hyperscaler.game',
  output: 'server',
  adapter: cloudflare({
    platformProxy: { enabled: true },
    workerEntryPoint: {
      path: 'src/worker.ts',
      namedExports: ['ShiftRoomDO'],
    },
  }),
  integrations: [tailwind(), sitemap()],
});
