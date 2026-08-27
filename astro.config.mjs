// @ts-check
import { defineConfig } from 'astro/config';
import { writeFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

import tailwindcss from '@tailwindcss/vite';

// Dev-only författar-endpoint: sparar redigerad plagg-PNG (suddgummi i Modeateljén) till public/garderob/<slot>/<id>.png.
// Backar upp originalet EN gång som <id>.orig.png. Finns bara i `astro dev` (ingen adapter i prod) — vilket är meningen.
function garmentSaver() {
  return {
    name: 'garment-saver',
    configureServer(server) {
      server.middlewares.use('/__save-garment', (req, res, next) => {
        if (req.method !== 'POST') { next(); return; }
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 20 * 1024 * 1024) req.destroy(); });
        req.on('end', () => {
          try {
            const { slot, id, dataUrl } = JSON.parse(body);
            if (!/^[a-z]+$/.test(slot) || !/^[a-z0-9_-]+$/i.test(id) || typeof dataUrl !== 'string') {
              res.statusCode = 400; res.end(JSON.stringify({ error: 'bad params' })); return;
            }
            const file = resolve(process.cwd(), 'public/garderob', slot, id + '.png');
            mkdirSync(dirname(file), { recursive: true });
            const orig = resolve(process.cwd(), 'public/garderob', slot, id + '.orig.png');
            if (!existsSync(orig) && existsSync(file)) copyFileSync(file, orig); // spara originalet en gång
            const b64 = dataUrl.split(',')[1] || '';
            writeFileSync(file, Buffer.from(b64, 'base64'));
            res.statusCode = 200; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.statusCode = 500; res.end(JSON.stringify({ error: String(e) }));
          }
        });
      });
      // återställ original: <id>.orig.png → <id>.png
      server.middlewares.use('/__restore-garment', (req, res, next) => {
        if (req.method !== 'POST') { next(); return; }
        let body = ''; req.on('data', (c) => body += c);
        req.on('end', () => {
          try {
            const { slot, id } = JSON.parse(body);
            if (!/^[a-z]+$/.test(slot) || !/^[a-z0-9_-]+$/i.test(id)) { res.statusCode = 400; res.end('{}'); return; }
            const file = resolve(process.cwd(), 'public/garderob', slot, id + '.png');
            const orig = resolve(process.cwd(), 'public/garderob', slot, id + '.orig.png');
            if (existsSync(orig)) copyFileSync(orig, file);
            res.statusCode = 200; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: existsSync(orig) }));
          } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); }
        });
      });
    },
  };
}

// https://astro.build/config
export default defineConfig({
  // Port-schema: carlpalmquist.com är projekt 4 → dev 5004, Chrome debug 9004.
  // (Concept Forge/wrangler kör separat på 8788.)
  server: { port: 5004 },
  vite: {
    plugins: [tailwindcss(), garmentSaver()]
  }
});
