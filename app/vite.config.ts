/// <reference types="vitest/config" />
import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'
// @ts-expect-error Cloudflare Pages Function is JavaScript shared with local dev.
import { onRequestPost as lookupLandmarks } from '../functions/api/landmarks.js'
// @ts-expect-error Cloudflare Pages Function is JavaScript shared with local dev.
import { MAX_JSON_BODY_BYTES } from '../functions-lib/http.js'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Cloudflare Pages Functions (functions/api/*.js — landmarks, contact) only
  // run when the site is served through Cloudflare itself. Plain `vite dev`
  // has no backend for `/api/*` at all, so those requests hit this dev
  // server's own origin and fail. Set LOCAL_API_PROXY_TARGET in a git-ignored
  // `.env` (see .gitignore) to forward `/api/*` to a real deployment instead
  // — left unset, no proxy is configured and `/api/*` behaves as it always
  // did locally (404/no backend).
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxyTarget = env.LOCAL_API_PROXY_TARGET;

  return {
  base: '/',
  server: {
    proxy: apiProxyTarget ? {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: true,
      },
    } : undefined,
  },
  // Generate is lazy-loaded. Without an eager prebundle, opening it can make
  // Vite discover these two packages after the page already holds older dep
  // URLs, producing 504 "Outdated Optimize Dep" and a failed dynamic import.
  optimizeDeps: {
    include: ['fix-webm-duration', 'mp4-muxer'],
  },
  // The inspector stamps `code-path` source locations onto every element, so it
  // is dev-only: in production it leaks source structure and bloats both the
  // bundles and the prerendered HTML. The prerender script runs a Vite server
  // (command === 'serve') purely to render, so it opts out explicitly.
  plugins: [
    ...(command === 'serve' && !process.env.TRAILREPLAY_PRERENDER && !apiProxyTarget ? [{
      name: 'local-landmarks-api',
      configureServer(server: ViteDevServer) {
        server.middlewares.use('/api/landmarks', async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          if (req.method !== 'POST') return next();
          try {
            const chunks: Buffer[] = [];
            const declaredLength = Number(req.headers['content-length']);
            if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
              res.statusCode = 413;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'payload_too_large', message: 'Request body is too large' }));
              return;
            }
            let totalBytes = 0;
            for await (const chunk of req) {
              const buffer = Buffer.from(chunk);
              totalBytes += buffer.byteLength;
              if (totalBytes > MAX_JSON_BODY_BYTES) {
                res.statusCode = 413;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'payload_too_large', message: 'Request body is too large' }));
                req.resume();
                return;
              }
              chunks.push(buffer);
            }
            const response = await lookupLandmarks({
              request: new Request('http://localhost/api/landmarks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: Buffer.concat(chunks),
              }),
              env: {},
              waitUntil: () => undefined,
            });
            res.statusCode = response.status;
            res.setHeader('Content-Type', response.headers.get('Content-Type') ?? 'application/json');
            res.end(await response.text());
          } catch (error) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Nearby-place lookup failed' }));
          }
        });
      },
    }] : []),
    ...(command === 'serve' && !process.env.TRAILREPLAY_PRERENDER ? [inspectAttr()] : []),
    react(),
  ],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        tutorial: path.resolve(__dirname, 'tutorial.html'),
        agents: path.resolve(__dirname, 'agents.html'),
        gpxGuide: path.resolve(__dirname, 'gpx-download-guide.html'),
        stravaToVideo: path.resolve(__dirname, 'strava-to-video.html'),
        garminToVideo: path.resolve(__dirname, 'garmin-to-video.html'),
        gpxAnimation: path.resolve(__dirname, 'gpx-animation.html'),
        cyclingRouteAnimation: path.resolve(__dirname, 'cycling-route-animation.html'),
        runningRouteAnimation: path.resolve(__dirname, 'running-route-animation.html'),
        cinematicCamera: path.resolve(__dirname, 'cinematic-camera.html'),
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('maplibre-gl')) return 'maplibre';
          if (id.includes('mp4-muxer') || id.includes('fix-webm-duration')) return 'video-export';
          // Keep the HEIC decoder behind imagePreview's dynamic import. Grouping
          // it with EXIF readers downloads it for ordinary JPEG/video metadata.
          if (id.includes('heic-to')) return 'heic-decoder';
          if (
            id.includes('exifr') ||
            id.includes('exifreader') ||
            id.includes('@xmldom')
          ) return 'media-processing';
          if (id.includes('recharts')) return 'charts';
          if (id.includes('@radix-ui')) return 'radix';
          return 'vendor';
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
  };
});
