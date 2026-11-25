import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { handle, memoryStore } from './api/card.ts';

/**
 * Serves the group-card API (api/card.ts) inside `npm run dev`, with an in-memory store,
 * so cards work locally without Vercel or a database. On Vercel, api/card.ts runs as a function.
 */
function cardApi(): Plugin {
  const store = memoryStore();
  return {
    name: 'satsgift-card-api',
    configureServer(server) {
      server.middlewares.use('/api/card', async (req, res) => {
        const chunks: Uint8Array[] = [];
        for await (const chunk of req) chunks.push(chunk as Uint8Array);
        const request = new Request(`http://localhost${req.originalUrl ?? '/api/card'}`, {
          method: req.method, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : new Blob(chunks as BlobPart[]),
          headers: { 'x-forwarded-for': req.socket.remoteAddress ?? '' }, // like Vercel, for rate limiting
        });
        const response = await handle(request, store);
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(await response.text());
      });
    },
  };
}

export default defineConfig({ plugins: [react(), cardApi()] });
