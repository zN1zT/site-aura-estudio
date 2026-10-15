/* /api/lead — função serverless (Node) do sitecomaura.com.
   POST  grava o lead no Vercel Blob (privado) e repete o evento Lead pela API de Conversões do Meta.
   GET   ?token=…&desde=<ISO> lista os leads (o painel busca por aqui). Sem token válido: 401.
   Variáveis: BLOB_READ_WRITE_TOKEN (Blob), SITE_LEADS_TOKEN (listagem), META_CAPI_TOKEN (opcional),
   META_CAPI_TEST_CODE (opcional, só para o "Testar eventos"), LEADS_BLOB_ACCESS (padrão "private"). */
import { randomBytes } from 'node:crypto';
import { put, list, get } from '@vercel/blob';
import {
  validar, criarLimitador, ipDe, tokensIguais, montarEventoCapi, enviarCapi, diaBrasilia,
} from './_lead-lib.js';

const ACESSO = process.env.LEADS_BLOB_ACCESS === 'public' ? 'public' : 'private';
const limitador = criarLimitador({ max: 10, janelaMs: 60000 });

const json = (res, status, corpo) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(corpo);
};

/* só aceita pedido vindo do próprio site (navegador manda Origin); curl/servidor não manda e passa */
function origemPermitida(req) {
  const o = req.headers.origin;
  if (!o) return true;
  try {
    const host = new URL(o).host;
    return host === req.headers.host || /(^|\.)sitecomaura\.com$/.test(host) || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  } catch { return false; }
}

async function criar(req, res) {
  if (!origemPermitida(req)) return json(res, 403, { ok: false, erro: 'origem' });
  if (!/^application\/json/i.test(req.headers['content-type'] || '')) return json(res, 415, { ok: false, erro: 'content-type' });
  if (!limitador.permitir(ipDe(req))) { res.setHeader('Retry-After', '60'); return json(res, 429, { ok: false, erro: 'muitos pedidos' }); }

  let corpo;
  try { corpo = req.body; if (typeof corpo === 'string') corpo = JSON.parse(corpo); } catch { return json(res, 400, { ok: false, erro: 'json' }); }
  if (JSON.stringify(corpo || {}).length > 6000) return json(res, 413, { ok: false, erro: 'grande' });

  /* campo-isca: humano não vê nem preenche. Responde como se tivesse aceitado, sem gravar nada. */
  if (corpo && typeof corpo.website === 'string' && corpo.website.trim()) return json(res, 200, { ok: true, id: 'ignorado', capi: 'ignorado' });

  const v = validar(corpo);
  if (!v.ok) return json(res, 400, { ok: false, erros: v.erros });

  const agora = Date.now();
  const id = randomBytes(5).toString('hex');
  const lead = {
    id, ...v.dados,
    event_id: v.dados.event_id || `lead_${agora}_${id}`,
    user_agent: String(req.headers['user-agent'] || '').slice(0, 300),   /* sem IP: só o navegador */
    aceite_lgpd: true,
    criado_em: new Date(agora).toISOString(),
  };

  try {
    await put(`leads/${diaBrasilia(agora)}/${agora}-${id}.json`, JSON.stringify(lead), {
      access: ACESSO, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: false,
    });
  } catch (e) {
    console.error('lead nao gravado', id, e && e.name);   /* sem dados pessoais no log */
    return json(res, 503, { ok: false, erro: 'armazenamento' });
  }

  const capi = await enviarCapi(montarEventoCapi(lead, agora), {
    token: process.env.META_CAPI_TOKEN, testCode: process.env.META_CAPI_TEST_CODE,
  });
  if (capi === 'falhou') console.error('capi falhou', id);
  return json(res, 200, { ok: true, id, event_id: lead.event_id, capi });
}

const tsDoCaminho = (b) => {
  const m = /^leads\/\d{4}-\d{2}-\d{2}\/(\d{12,14})-/.exec(b.pathname);
  return m ? +m[1] : new Date(b.uploadedAt).getTime();
};

async function lerBlob(pathname) {
  const r = await get(pathname, { access: ACESSO, useCache: false });
  if (!r || r.statusCode !== 200) return null;
  return JSON.parse(await new Response(r.stream).text());
}

async function listar(req, res) {
  const cab = String(req.headers.authorization || '');
  const dado = (/^Bearer (.+)$/i.exec(cab) || [])[1] || (req.query && req.query.token) || '';
  if (!tokensIguais(process.env.SITE_LEADS_TOKEN, dado)) return json(res, 401, { ok: false, erro: 'nao autorizado' });

  let desde = 0;
  if (req.query && req.query.desde) {
    desde = Date.parse(String(req.query.desde));
    if (!Number.isFinite(desde)) return json(res, 400, { ok: false, erro: 'desde invalido' });
  }
  const limite = Math.min(Math.max(parseInt(req.query && req.query.limite, 10) || 1000, 1), 5000);

  try {
    let cursor; const blobs = [];
    do {
      const r = await list({ prefix: 'leads/', cursor, limit: 1000 });
      blobs.push(...r.blobs);
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor && blobs.length < 50000);

    const sel = blobs.filter((b) => tsDoCaminho(b) >= desde).sort((a, b) => tsDoCaminho(a) - tsDoCaminho(b));
    const recorte = sel.slice(0, limite);
    const leads = [];
    for (let i = 0; i < recorte.length; i += 10) {
      const lote = await Promise.all(recorte.slice(i, i + 10).map((b) => lerBlob(b.pathname).catch(() => null)));
      lote.forEach((l) => { if (l) leads.push(l); });
    }
    leads.sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)));
    return json(res, 200, { ok: true, total: leads.length, truncado: sel.length > recorte.length, leads });
  } catch (e) {
    console.error('listar leads falhou', e && e.name);
    return json(res, 503, { ok: false, erro: 'armazenamento' });
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') return await criar(req, res);
    if (req.method === 'GET') return await listar(req, res);
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { ok: false, erro: 'metodo' });
  } catch (e) {
    console.error('lead erro', e && e.name);
    return json(res, 500, { ok: false, erro: 'interno' });
  }
}
