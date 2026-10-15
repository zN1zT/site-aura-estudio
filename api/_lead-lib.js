/* Funções puras do /api/lead: validação, normalização, hash e evento da API de Conversões.
   Arquivo com "_" na frente não vira rota na Vercel. Testes em tests/lead.test.js. */
import { createHash, timingSafeEqual } from 'node:crypto';

export const PIXEL_ID = '1435927114558830';
export const CAPI_VERSAO = 'v21.0';

/* lista fechada: os nomes são os mesmos dos planos do simulador (index.html, input[name=tipo]) */
export const PLANOS = ['Ainda não sei', 'Página única', 'Site institucional', 'Catálogo ou portfólio'];
export const FONTES = ['Simulador de preco', 'Contato', 'Botao flutuante'];

/* DDDs em uso no Brasil */
export const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');

/* texto livre: tira controle e <>, junta espaços. Não corta: quem valida compara o tamanho. */
export function limpar(v) {
  if (typeof v !== 'string') return '';
  return v.normalize('NFC').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim();
}

/* celular BR: devolve os 11 dígitos (DDD + 9 + 8) ou null. Aceita +55 na frente. */
export function celularBR(v) {
  let d = String(v == null ? '' : v).replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (!/^\d{11}$/.test(d)) return null;
  if (!DDDS.has(+d.slice(0, 2))) return null;
  if (d[2] !== '9') return null;
  return d;
}

export const formatarCelular = (d) => `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;

export function primeiroNome(nome) {
  return limpar(nome).split(' ')[0].toLowerCase().replace(/[^\p{L}]/gu, '');
}

const RE_FBP = /^fb\.\d\.\d{10,13}\.\d{4,20}$/;
const RE_FBC = /^fb\.\d\.\d{10,13}\.[\w-]{8,300}$/;
const RE_EVENT = /^[A-Za-z0-9_-]{8,64}$/;

function urlHttp(v) {
  try {
    const u = new URL(String(v));
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    u.hash = '';
    return u.toString().slice(0, 400);
  } catch { return ''; }
}

/* valida o corpo do POST. Devolve { ok, erros } ou { ok:true, dados } (dados já normalizados) */
export function validar(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const erros = {};

  const nome = limpar(b.nome);
  if (nome.length < 2 || nome.length > 80 || !/\p{L}.*\p{L}/u.test(nome)) erros.nome = 'Informe seu nome (2 a 80 caracteres).';

  const cel = celularBR(b.whatsapp);
  if (!cel) erros.whatsapp = 'Informe um celular brasileiro com DDD, ex.: (11) 99999-9999.';

  const tipo = limpar(b.tipo);
  if (tipo.length < 2 || tipo.length > 60) erros.tipo = 'Informe o tipo de negócio (2 a 60 caracteres).';

  const plano = typeof b.plano === 'string' ? b.plano.normalize('NFC') : '';
  if (!PLANOS.includes(plano)) erros.plano = 'Escolha um plano da lista.';

  if (b.aceite !== true) erros.aceite = 'É preciso aceitar para continuar.';

  if (Object.keys(erros).length) return { ok: false, erros };

  const fonte = FONTES.includes(b.fonte) ? b.fonte : 'Contato';
  const valor = Number.isFinite(+b.valor) && +b.valor >= 0 && +b.valor <= 100000 ? Math.round(+b.valor) : 0;
  const utmIn = b.utm && typeof b.utm === 'object' ? b.utm : {};
  const utm = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
    const v = limpar(utmIn[k]).slice(0, 80);
    if (v) utm[k] = v;
  }
  const fbclid = limpar(b.fbclid).replace(/[^\w.-]/g, '').slice(0, 300);
  const fbp = typeof b.fbp === 'string' && RE_FBP.test(b.fbp) ? b.fbp : '';
  const fbc = typeof b.fbc === 'string' && RE_FBC.test(b.fbc) ? b.fbc : '';

  return {
    ok: true,
    dados: {
      nome, whatsapp: '55' + cel, whatsapp_fmt: formatarCelular(cel), tipo, plano, fonte, valor_plano: valor,
      origem: limpar(b.origem).slice(0, 200), utm, fbclid, fbp, fbc,
      event_id: typeof b.event_id === 'string' && RE_EVENT.test(b.event_id) ? b.event_id : '',
      pagina: urlHttp(b.pagina),
    },
  };
}

/* limite por IP em memória (por instância da função; basta como freio de abuso) */
export function criarLimitador({ max = 10, janelaMs = 60000 } = {}) {
  const mapa = new Map();
  return {
    permitir(chave, agora = Date.now()) {
      const lista = (mapa.get(chave) || []).filter((t) => agora - t < janelaMs);
      if (lista.length >= max) { mapa.set(chave, lista); return false; }
      lista.push(agora); mapa.set(chave, lista);
      if (mapa.size > 5000) for (const [k, v] of mapa) if (!v.some((t) => agora - t < janelaMs)) mapa.delete(k);
      return true;
    },
  };
}

/* IP do pedido (só para o limite; nunca é gravado) */
export function ipDe(req) {
  const h = req.headers || {};
  const xff = String(h['x-forwarded-for'] || '').split(',')[0].trim();
  return String(h['x-real-ip'] || xff || (req.socket && req.socket.remoteAddress) || 'desconhecido');
}

/* comparação sem vazar tamanho nem tempo */
export function tokensIguais(a, b) {
  if (!a || !b) return false;
  return timingSafeEqual(createHash('sha256').update(String(a)).digest(), createHash('sha256').update(String(b)).digest());
}

/* evento Lead para a API de Conversões, com o mesmo event_id do Pixel (deduplicação) */
export function montarEventoCapi(lead, agora = Date.now()) {
  const user_data = {
    ph: [sha256(lead.whatsapp)],
    fn: [sha256(primeiroNome(lead.nome))],
    client_user_agent: lead.user_agent || '',
  };
  if (lead.fbp) user_data.fbp = lead.fbp;
  if (lead.fbc) user_data.fbc = lead.fbc;
  return {
    event_name: 'Lead',
    event_time: Math.floor(agora / 1000),
    event_id: lead.event_id,
    event_source_url: lead.pagina || 'https://sitecomaura.com/',
    action_source: 'website',
    user_data,
    custom_data: { content_name: lead.fonte, value: lead.valor_plano, currency: 'BRL' },
  };
}

/* envia pela API de Conversões. Nunca lança: devolve 'enviado', 'sem token' ou 'falhou'.
   O token vai no corpo (não na URL) para não aparecer em log de requisição. */
export async function enviarCapi(evento, { token, testCode, fetchImpl = fetch, timeoutMs = 1500 } = {}) {
  if (!token) return 'sem token';
  const corpo = { data: [evento], access_token: token };
  if (testCode) corpo.test_event_code = testCode;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(`https://graph.facebook.com/${CAPI_VERSAO}/${PIXEL_ID}/events`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo), signal: ctl.signal,
    });
    return r.ok ? 'enviado' : 'falhou';
  } catch { return 'falhou'; } finally { clearTimeout(t); }
}

/* pasta por dia no horário de Brasília (sem horário de verão desde 2019) */
export const diaBrasilia = (ms) => new Date(ms - 3 * 3600e3).toISOString().slice(0, 10);
