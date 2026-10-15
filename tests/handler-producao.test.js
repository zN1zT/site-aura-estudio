/* handler do /api/lead em produção: só Bearer, localhost recusado. Não toca no Blob (só caminhos que respondem antes). */
process.env.VERCEL_ENV = 'production';
process.env.SITE_LEADS_TOKEN = 'token-so-de-teste';
import test from 'node:test';
import assert from 'node:assert/strict';

const { default: handler } = await import('../api/lead.js');

const chamar = (req) => new Promise((resolve) => {
  const res = { h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; }, json(o) { resolve({ code: this.code, corpo: o, h: this.h }); } };
  handler({ headers: {}, query: {}, ...req }, res);
});

test('GET sem Authorization: 401', async () => {
  assert.equal((await chamar({ method: 'GET' })).code, 401);
});

test('GET com o token certo na URL (?token=) NÃO é aceito: 401', async () => {
  assert.equal((await chamar({ method: 'GET', query: { token: 'token-so-de-teste' } })).code, 401);
});

test('GET com Bearer errado ou mal formado: 401', async () => {
  assert.equal((await chamar({ method: 'GET', headers: { authorization: 'Bearer errado' } })).code, 401);
  assert.equal((await chamar({ method: 'GET', headers: { authorization: 'token-so-de-teste' } })).code, 401);
  assert.equal((await chamar({ method: 'GET', headers: { authorization: 'Bearer ' } })).code, 401);
});

test('GET com Bearer certo passa da autenticação (sem Blob aqui, vira 503 e não 401)', async () => {
  const r = await chamar({ method: 'GET', headers: { authorization: 'Bearer token-so-de-teste' } });
  assert.notEqual(r.code, 401);
});

test('resposta nunca é cacheada', async () => {
  assert.equal((await chamar({ method: 'GET' })).h['Cache-Control'], 'no-store');
});

test('produção: Origin localhost é recusado (403); sitecomaura.com passa da checagem de origem', async () => {
  const json = { 'content-type': 'application/json' };
  assert.equal((await chamar({ method: 'POST', headers: { ...json, origin: 'http://localhost:3000' }, body: {} })).code, 403);
  assert.equal((await chamar({ method: 'POST', headers: { ...json, origin: 'http://127.0.0.1:3000' }, body: {} })).code, 403);
  assert.equal((await chamar({ method: 'POST', headers: { ...json, origin: 'https://outro-site.com', host: 'sitecomaura.com' }, body: {} })).code, 403);
  assert.equal((await chamar({ method: 'POST', headers: { ...json, origin: 'https://sitecomaura.com', host: 'sitecomaura.com' }, body: {} })).code, 400);
  assert.equal((await chamar({ method: 'POST', headers: { ...json, origin: 'https://www.sitecomaura.com', host: 'www.sitecomaura.com' }, body: {} })).code, 400);
});

test('método inesperado: 405', async () => {
  assert.equal((await chamar({ method: 'DELETE' })).code, 405);
});
