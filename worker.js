// worker.js
// Proxy para o KV, atrás de login próprio (SDD seção 3.1).
// A URL do KV nunca chega ao browser — fica só aqui no servidor.
// Bindings necessários: ROTINA_KV (KV namespace).
// Segredos necessários (wrangler secret put, nunca em wrangler.toml):
//   SENHA_HASH, SENHA_SALT, SESSION_SECRET — ver scripts/gerar-segredos.mjs

const USER_ID = 'paulo'; // prefixo das chaves no KV

const SESSION_COOKIE = 'session';
const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60; // 30 dias
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_S = 15 * 60;
// Teto do runtime real do Cloudflare Workers — ver comentário equivalente
// em scripts/gerar-segredos.mjs.
const PBKDF2_ITERACOES = 100000;

function jsonResponse(data, status = 200, extraHeaders) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  return new Response(JSON.stringify(data), { status, headers: { ...headers, ...extraHeaders } });
}

// ═══ CRIPTO (SDD 3.1) ═══
function hexParaBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function bytesParaHex(bytes) {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function bytesParaBase64url(bytes) {
  let bin = '';
  new Uint8Array(bytes).forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlParaBytes(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64urlParaString(b64) {
  return new TextDecoder().decode(base64urlParaBytes(b64));
}

function stringParaBase64url(s) {
  return bytesParaBase64url(new TextEncoder().encode(s));
}

async function derivarHashSenha(senha, saltHex, iteracoes = PBKDF2_ITERACOES) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexParaBytes(saltHex), iterations: iteracoes, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return bytesParaHex(bits);
}

async function hmacSha256(segredoHex, mensagem) {
  const key = await crypto.subtle.importKey('raw', hexParaBytes(segredoHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(mensagem));
  return new Uint8Array(sig);
}

// Compara em tempo constante: sempre percorre o comprimento inteiro, nunca
// retorna cedo. Comparação com === vaza informação por tempo (SDD 3.1).
function compararHexConstante(a, b) {
  const len = Math.max(a.length, b.length, 64);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function compararBytesConstante(a, b) {
  const len = Math.max(a.length, b.length, 32);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a[i] || 0) ^ (b[i] || 0);
  return diff === 0;
}

// ═══ SESSÃO ═══
async function gerarTokenSessao(sessionSecretHex) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_S;
  const payloadB64 = stringParaBase64url(JSON.stringify({ exp }));
  const hmac = await hmacSha256(sessionSecretHex, payloadB64);
  return `${payloadB64}.${bytesParaBase64url(hmac)}`;
}

async function verificarSessao(request, env) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  if (!match) return false;

  const partes = match[1].split('.');
  if (partes.length !== 2) return false;
  const [payloadB64, hmacB64] = partes;

  let hmacRecebido;
  try { hmacRecebido = base64urlParaBytes(hmacB64); } catch { return false; }
  const hmacEsperado = await hmacSha256(env.SESSION_SECRET, payloadB64);
  if (!compararBytesConstante(hmacEsperado, hmacRecebido)) return false;

  let payload;
  try { payload = JSON.parse(base64urlParaString(payloadB64)); } catch { return false; }
  if (!payload || typeof payload.exp !== 'number') return false;
  if (payload.exp < Math.floor(Date.now() / 1000)) return false;

  return true;
}

function cookieDeSessao(token) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE_S}`;
}

function cookieDeLogout() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

// ═══ LOGIN / LOGOUT ═══
async function handleLogin(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const ip = request.headers.get('CF-Connecting-IP') || 'desconhecido';
  const rlKey = `rl:${ip}`;
  const tentativas = parseInt((await env.ROTINA_KV.get(rlKey)) || '0', 10);
  if (tentativas >= RATE_LIMIT_MAX) {
    return jsonResponse({ error: 'muitas tentativas, tenta de novo mais tarde' }, 429);
  }

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'invalid json' }, 400); }
  const senha = typeof body.senha === 'string' ? body.senha : '';

  const hashDerivado = await derivarHashSenha(senha, env.SENHA_SALT);
  const ok = compararHexConstante(hashDerivado, env.SENHA_HASH);

  if (!ok) {
    await env.ROTINA_KV.put(rlKey, String(tentativas + 1), { expirationTtl: RATE_LIMIT_WINDOW_S });
    return jsonResponse({ error: 'senha incorreta' }, 401);
  }

  const token = await gerarTokenSessao(env.SESSION_SECRET);
  return jsonResponse({ ok: true }, 200, { 'Set-Cookie': cookieDeSessao(token) });
}

function handleLogout(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);
  return jsonResponse({ ok: true }, 200, { 'Set-Cookie': cookieDeLogout() });
}

async function handleStore(request, env) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');

  if (!key) return jsonResponse({ error: 'key required' }, 400);

  const storageKey = `${USER_ID}:${key}`;

  if (request.method === 'GET') {
    const value = await env.ROTINA_KV.get(storageKey);
    return jsonResponse({ value });
  }

  if (request.method === 'PUT') {
    const body = await request.text();

    if (body.length > 512 * 1024) {
      return jsonResponse({ error: 'payload too large' }, 413);
    }

    try { JSON.parse(body); } catch {
      return jsonResponse({ error: 'invalid json' }, 400);
    }

    await env.ROTINA_KV.put(storageKey, body);
    return jsonResponse({ ok: true });
  }

  if (request.method === 'DELETE') {
    await env.ROTINA_KV.delete(storageKey);
    return jsonResponse({ ok: true });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  return jsonResponse({ error: 'method not allowed' }, 405);
}

async function handleKeys(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'method not allowed' }, 405);
  }

  const url = new URL(request.url);
  const prefix = url.searchParams.get('prefix') || '';
  const storagePrefix = `${USER_ID}:${prefix}`;

  const keys = [];
  let cursor;
  do {
    const page = await env.ROTINA_KV.list({ prefix: storagePrefix, cursor });
    page.keys.forEach(k => keys.push(k.name.slice(USER_ID.length + 1)));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return jsonResponse({ keys });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/login') return handleLogin(request, env);
    if (url.pathname === '/api/logout') return handleLogout(request);

    // Único ponto de checagem: tudo em /api/ (fora login/logout) exige
    // sessão válida. Uma rota nova em /api/ nasce protegida por padrão.
    if (url.pathname.startsWith('/api/') && request.method !== 'OPTIONS') {
      const sessaoValida = await verificarSessao(request, env);
      if (!sessaoValida) return jsonResponse({ error: 'não autenticado' }, 401);
    }

    if (url.pathname === '/api/store') {
      return handleStore(request, env);
    }

    if (url.pathname === '/api/keys') {
      return handleKeys(request, env);
    }

    // Tudo o mais: serve arquivos estáticos
    return env.ASSETS.fetch(request);
  },
};
