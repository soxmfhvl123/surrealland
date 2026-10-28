import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv, type Plugin } from 'vite';

/**
 * Local proxy to Google's Gemini image models ("Nano Banana"). The key lives in
 * .env.local (GEMINI_API_KEY=<key from aistudio.google.com/apikey>) or is sent per
 * request by the page to this local server only — never to any other host.
 *
 *   GET  /api/gemini/config     → { env: boolean }
 *   POST /api/gemini/generate   { model, prompt, images?: [{ mime, data }], aspect?, size? }
 *                               → { images: [{ mime, data }], text?: string }
 *
 * Uses the Interactions API; if a model only answers on the older generateContent
 * endpoint, the same request is retried there.
 */
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MAX_BODY = 60 * 1024 * 1024;
const MODEL_ID = /^[a-z0-9][a-z0-9.\-]{2,80}$/i;
const ASPECTS = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);
const SIZES = new Set(['512px', '1K', '2K', '4K']);

interface InImage {
  mime: string;
  data: string;
}
interface GenRequest {
  model: string;
  prompt: string;
  images?: InImage[];
  aspect?: string;
  size?: string;
}

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

/** Every image anywhere in a response, whichever API shape it came from. */
function collect(node: unknown, images: InImage[], texts: string[]) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((n) => collect(n, images, texts));
    return;
  }
  const o = node as Record<string, unknown>;
  // interactions: { type: 'image', data, mime_type }
  if (o.type === 'image' && typeof o.data === 'string') images.push({ mime: String(o.mime_type ?? 'image/png'), data: o.data });
  // generateContent: { inlineData: { mimeType, data } } / { inline_data: { mime_type, data } }
  const inline = (o.inlineData ?? o.inline_data) as Record<string, unknown> | undefined;
  if (inline && typeof inline.data === 'string') images.push({ mime: String(inline.mimeType ?? inline.mime_type ?? 'image/png'), data: inline.data });
  if (o.type === 'text' && typeof o.text === 'string') texts.push(o.text);
  else if (typeof o.text === 'string' && !('type' in o)) texts.push(o.text);
  for (const [k, v] of Object.entries(o)) if (k !== 'data' && k !== 'inlineData' && k !== 'inline_data') collect(v, images, texts);
}

function errorText(json: unknown, status: number): string {
  // the Interactions API wraps errors in an array
  const first = Array.isArray(json) ? json[0] : json;
  const e = (first as { error?: { message?: string; status?: string; details?: { reason?: string }[] } | string })?.error;
  if (typeof e === 'string') return e;
  const reason = e?.details?.find((d) => d.reason)?.reason ?? '';
  const msg = e?.message ?? '';
  if (reason === 'API_KEY_INVALID' || /API key not valid/i.test(msg)) return 'API 키가 올바르지 않아요. aistudio.google.com/apikey 에서 다시 확인해 주세요.';
  if (status === 429 && /limit:\s*0\b|free tier/i.test(msg))
    return '무료 등급에서는 이 이미지 모델을 쓸 수 없어요 (하루 한도 0). Google AI Studio에서 이 API 키의 프로젝트에 결제(Billing)를 연결해 유료 등급으로 올리면 바로 돼요. 키·연결은 정상이에요.';
  if (status === 429) return `요청 한도를 넘었어요 (잠시 뒤 다시, 또는 결제 등급 확인). ${msg}`;
  if (status === 403) return `이 키로는 쓸 수 없는 모델이에요 (결제 설정이 필요할 수 있어요). ${msg}`;
  return msg || `HTTP ${status}`;
}

async function callInteractions(key: string, r: GenRequest) {
  const input: unknown[] = [{ type: 'text', text: r.prompt }];
  for (const im of r.images ?? []) input.push({ type: 'image', mime_type: im.mime, data: im.data });
  const response_format: Record<string, string> = { type: 'image' };
  if (r.aspect) response_format.aspect_ratio = r.aspect;
  if (r.size) response_format.image_size = r.size;
  const res = await fetch(`${BASE}/interactions`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ model: r.model, input, response_format }),
  });
  return { res, json: (await res.json().catch(() => ({}))) as unknown };
}

async function callGenerateContent(key: string, r: GenRequest) {
  const parts: unknown[] = [{ text: r.prompt }];
  for (const im of r.images ?? []) parts.push({ inline_data: { mime_type: im.mime, data: im.data } });
  const imageConfig: Record<string, string> = {};
  if (r.aspect) imageConfig.aspectRatio = r.aspect;
  if (r.size && r.size !== '512px') imageConfig.imageSize = r.size;
  const res = await fetch(`${BASE}/models/${r.model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig } }),
  });
  return { res, json: (await res.json().catch(() => ({}))) as unknown };
}

export function geminiProxy(): Plugin {
  let envKey = '';

  const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://local');
    if (!url.pathname.startsWith('/api/gemini/')) return next();
    const route = url.pathname.slice('/api/gemini/'.length);
    try {
      if (route === 'config') return send(res, 200, { env: !!envKey });
      if (route !== 'generate' || req.method !== 'POST') return send(res, 404, { error: 'unknown route' });

      const header = req.headers['x-gemini-key'];
      const key = (typeof header === 'string' ? header.trim() : '') || envKey;
      if (!key) return send(res, 401, { error: 'Gemini API 키가 없어요. aistudio.google.com/apikey 에서 만들어 붙여넣으세요.' });

      const body = JSON.parse((await readBody(req)).toString('utf8')) as GenRequest;
      if (!MODEL_ID.test(body.model ?? '')) return send(res, 400, { error: '모델 이름이 올바르지 않아요.' });
      if (!body.prompt?.trim()) return send(res, 400, { error: '프롬프트가 비어 있어요.' });
      const r: GenRequest = {
        model: body.model,
        prompt: body.prompt.slice(0, 8000),
        images: (body.images ?? []).slice(0, 14).filter((im) => /^image\/(png|jpeg|webp)$/.test(im.mime) && typeof im.data === 'string'),
        aspect: body.aspect && ASPECTS.has(body.aspect) ? body.aspect : undefined,
        size: body.size && SIZES.has(body.size) ? body.size : undefined,
      };

      let { res: up, json } = await callInteractions(key, r);
      // some models (older ones) only answer on generateContent
      if (up.status === 404 || (up.status === 400 && /not (found|supported)|unsupported|interactions/i.test(errorText(json, up.status)))) {
        ({ res: up, json } = await callGenerateContent(key, r));
      }
      if (!up.ok) return send(res, up.status, { error: errorText(json, up.status) });

      const images: InImage[] = [];
      const texts: string[] = [];
      collect(json, images, texts);
      if (!images.length) {
        const why = texts.join(' ').slice(0, 300);
        return send(res, 502, { error: why ? `이미지를 받지 못했어요: ${why}` : '이미지를 받지 못했어요 (안전 필터에 걸렸을 수 있어요)' });
      }
      return send(res, 200, { images, text: texts.join('\n').slice(0, 1000) });
    } catch (err) {
      return send(res, 500, { error: (err as Error).message });
    }
  };

  return {
    name: 'gemini-proxy',
    configResolved(config) {
      const env = loadEnv(config.mode, config.envDir || process.cwd(), '');
      envKey = (env.GEMINI_API_KEY || env.GOOGLE_API_KEY || '').trim();
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => void handle(req, res, next));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => void handle(req, res, next));
    },
  };
}
