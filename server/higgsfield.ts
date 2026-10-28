import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv, type Plugin } from 'vite';

/**
 * Local proxy to the Higgsfield API. The browser never sees the key: it lives in
 * .env.local (HF_API_KEY=<key from open.higgsfield.ai>) or is sent per request by
 * the page to this local server only.
 *
 *   GET  /api/hf/config            → { env: boolean }
 *   POST /api/hf/submit            { model, input } → Higgsfield request JSON
 *   GET  /api/hf/status?id=…       → request status JSON
 *   POST /api/hf/cancel?id=…
 *   POST /api/hf/upload            raw image bytes → { url }
 *   GET  /api/hf/fetch?url=…       generated media, re-served so canvases can read it
 */
const API = 'https://api.higgsfield.ai';
const MAX_BODY = 40 * 1024 * 1024;

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

async function relay(res: ServerResponse, upstream: Response) {
  res.statusCode = upstream.status;
  res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json');
  res.end(Buffer.from(await upstream.arrayBuffer()));
}

const MODEL_PATH = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9._-]+)*$/i;
const REQUEST_ID = /^[a-z0-9-]{6,80}$/i;

/** Only public https hosts may be fetched through /api/hf/fetch. */
function safeMediaUrl(raw: string | null): URL | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    const host = u.hostname;
    if (host === 'localhost' || host.endsWith('.local') || /^[\d.]+$/.test(host) || host.includes(':')) return null;
    return u;
  } catch {
    return null;
  }
}

export function higgsfieldProxy(): Plugin {
  let envCreds = '';

  const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://local');
    if (!url.pathname.startsWith('/api/hf/')) return next();
    const route = url.pathname.slice('/api/hf/'.length);

    try {
      if (route === 'config') return send(res, 200, { env: !!envCreds });

      if (route === 'fetch') {
        const target = safeMediaUrl(url.searchParams.get('url'));
        if (!target) return send(res, 400, { error: 'https 미디어 주소만 가져올 수 있어요.' });
        return relay(res, await fetch(target));
      }

      const headerCreds = req.headers['x-hf-credentials'];
      const creds = (typeof headerCreds === 'string' ? headerCreds.trim() : '') || envCreds;
      if (!creds) return send(res, 401, { error: 'Higgsfield API 키가 없어요. AI 탭에 키를 붙여넣거나 .env.local 에 HF_API_KEY 를 넣어주세요.' });
      const auth = { authorization: `Key ${creds}` };

      if (route === 'submit' && req.method === 'POST') {
        const { model, input } = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        if (typeof model !== 'string' || !MODEL_PATH.test(model) || model.includes('..')) {
          return send(res, 400, { error: '모델 경로가 올바르지 않아요.' });
        }
        const upstream = await fetch(`${API}/${model}`, {
          method: 'POST',
          headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
          body: JSON.stringify(input ?? {}),
        });
        return relay(res, upstream);
      }

      if (route === 'status' || route === 'cancel') {
        const id = url.searchParams.get('id') ?? '';
        if (!REQUEST_ID.test(id)) return send(res, 400, { error: 'request id 가 올바르지 않아요.' });
        const upstream = await fetch(`${API}/requests/${id}/${route}`, {
          method: route === 'cancel' ? 'POST' : 'GET',
          headers: auth,
        });
        return relay(res, upstream);
      }

      if (route === 'upload' && req.method === 'POST') {
        const contentType = (req.headers['content-type'] ?? 'image/png').split(';')[0];
        if (!contentType.startsWith('image/')) return send(res, 400, { error: '이미지 파일만 올릴 수 있어요.' });
        const bytes = await readBody(req);
        const slot = await fetch(`${API}/files/generate-upload-url`, {
          method: 'POST',
          headers: { ...auth, 'content-type': 'application/json' },
          body: JSON.stringify({ content_type: contentType }),
        });
        if (!slot.ok) return relay(res, slot);
        const info = (await slot.json()) as { upload_url: string; public_url: string; upload_headers?: Record<string, string> };
        // credentials are never forwarded to the storage URL
        const put = await fetch(info.upload_url, {
          method: 'PUT',
          headers: { 'content-type': contentType, ...(info.upload_headers ?? {}) },
          body: new Uint8Array(bytes),
        });
        if (!put.ok) return send(res, 502, { error: `업로드 실패 (${put.status})` });
        return send(res, 200, { url: info.public_url });
      }

      return send(res, 404, { error: 'unknown route' });
    } catch (err) {
      return send(res, 502, { error: (err as Error).message });
    }
  };

  return {
    name: 'higgsfield-proxy',
    configResolved(config) {
      const env = loadEnv(config.mode, config.envDir || process.cwd(), '');
      // current keys from open.higgsfield.ai are one complete value (HF_API_KEY);
      // older ones came as an id + secret pair
      envCreds =
        env.HF_CREDENTIALS ||
        (env.HF_API_KEY && env.HF_API_SECRET ? `${env.HF_API_KEY}:${env.HF_API_SECRET}` : env.HF_API_KEY || '');
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => void handle(req, res, next));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => void handle(req, res, next));
    },
  };
}
