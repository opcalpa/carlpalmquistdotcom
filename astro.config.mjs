// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Port-schema: carlpalmquist.com är projekt 4 → dev 5004, Chrome debug 9004.
  // (Concept Forge/wrangler kör separat på 8788.)
  server: { port: 5004 },
  vite: {
    plugins: [tailwindcss()]
  }
});