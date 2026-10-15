/* fora de produção (vercel dev e preview), localhost é aceito na checagem de origem */
process.env.VERCEL_ENV = 'development';
import test from 'node:test';
import assert from 'node:assert/strict';

const { default: handler } = await import('../api/lead.js');

test('desenvolvimento: Origin localhost passa da checagem de origem (corpo vazio vira 400, não 403)', async () => {
  const r = await new Promise((resolve) => {
    const res = { setHeader() {}, status(c) { this.code = c; return this; }, json(o) { resolve({ code: this.code, corpo: o }); } };
    handler({ method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3100', host: 'localhost:3100' }, body: {}, query: {} }, res);
  });
  assert.equal(r.code, 400);
});
