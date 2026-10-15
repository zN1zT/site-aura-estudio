import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validar, celularBR, formatarCelular, sha256, primeiroNome, criarLimitador, tokensIguais,
  montarEventoCapi, enviarCapi, diaBrasilia, PLANOS, PIXEL_ID,
} from '../api/_lead-lib.js';

const ok = () => ({ nome: 'Maria da Silva', whatsapp: '(11) 90000-0000', tipo: 'Clínica odontológica', plano: 'Página única', aceite: true });

test('celular BR: aceita 11 dígitos com 9 e DDD válido, recusa o resto', () => {
  assert.equal(celularBR('(11) 90000-0000'), '11900000000');
  assert.equal(celularBR('+55 11 98918-7347'), '11989187347');
  assert.equal(celularBR('5511989187347'), '11989187347');
  assert.equal(celularBR('(11) 8918-7347'), null);        // fixo / 10 dígitos
  assert.equal(celularBR('(11) 88918-7347'), null);       // terceiro dígito não é 9
  assert.equal(celularBR('(10) 98918-7347'), null);       // DDD inexistente
  assert.equal(celularBR('119891873'), null);
  assert.equal(celularBR(''), null);
  assert.equal(celularBR(null), null);
  assert.equal(formatarCelular('11900000000'), '(11) 90000-0000');
});

test('validar: lead correto vira dados normalizados', () => {
  const v = validar(ok());
  assert.equal(v.ok, true);
  assert.equal(v.dados.whatsapp, '5511900000000');
  assert.equal(v.dados.whatsapp_fmt, '(11) 90000-0000');
  assert.equal(v.dados.nome, 'Maria da Silva');
  assert.equal(v.dados.fonte, 'Contato');
});

test('validar: recusa cada campo inválido com 400-equivalente', () => {
  const casos = [
    [{ nome: 'A' }, 'nome'],
    [{ nome: 'x'.repeat(81) }, 'nome'],
    [{ nome: '1234' }, 'nome'],
    [{ whatsapp: '(11) 3333-3333' }, 'whatsapp'],
    [{ whatsapp: 'abc' }, 'whatsapp'],
    [{ tipo: '' }, 'tipo'],
    [{ tipo: 'y'.repeat(61) }, 'tipo'],
    [{ plano: 'Plano inventado' }, 'plano'],
    [{ plano: undefined }, 'plano'],
    [{ aceite: false }, 'aceite'],
    [{ aceite: 'true' }, 'aceite'],
    [{ aceite: undefined }, 'aceite'],
  ];
  for (const [mut, campo] of casos) {
    const v = validar({ ...ok(), ...mut });
    assert.equal(v.ok, false, JSON.stringify(mut));
    assert.ok(v.erros[campo], `${campo} deveria estar nos erros: ${JSON.stringify(mut)}`);
  }
  assert.equal(validar(null).ok, false);
  assert.equal(validar('texto').ok, false);
  assert.equal(validar([]).ok, false);
});

test('validar: todos os planos da lista passam; limpa < > e controle', () => {
  for (const p of PLANOS) assert.equal(validar({ ...ok(), plano: p }).ok, true, p);
  const v = validar({ ...ok(), nome: '  Ana <b>Paula</b>\n', tipo: 'Loja\u0000 de   roupas' });
  assert.equal(v.dados.nome, 'Ana b Paula /b');
  assert.equal(v.dados.tipo, 'Loja de roupas');
});

test('validar: fbp, fbc, event_id e página só passam se tiverem o formato certo', () => {
  const v = validar({ ...ok(), fbp: 'fb.1.1700000000000.1234567890', fbc: 'fb.1.1700000000000.IwAR0abcdefgh', event_id: 'abc12345-xyz', pagina: 'https://sitecomaura.com/?utm_source=x#topo' });
  assert.equal(v.dados.fbp, 'fb.1.1700000000000.1234567890');
  assert.equal(v.dados.fbc, 'fb.1.1700000000000.IwAR0abcdefgh');
  assert.equal(v.dados.event_id, 'abc12345-xyz');
  assert.equal(v.dados.pagina, 'https://sitecomaura.com/?utm_source=x');
  const ruim = validar({ ...ok(), fbp: 'lixo', fbc: '<script>', event_id: '!!', pagina: 'javascript:alert(1)' });
  assert.equal(ruim.dados.fbp, ''); assert.equal(ruim.dados.fbc, ''); assert.equal(ruim.dados.event_id, ''); assert.equal(ruim.dados.pagina, '');
});

test('limite: 10 pedidos por minuto por IP', () => {
  const l = criarLimitador({ max: 10, janelaMs: 60000 });
  for (let i = 0; i < 10; i++) assert.equal(l.permitir('1.2.3.4', 1000 + i), true);
  assert.equal(l.permitir('1.2.3.4', 2000), false);
  assert.equal(l.permitir('5.6.7.8', 2000), true);          // outro IP não é afetado
  assert.equal(l.permitir('1.2.3.4', 1000 + 61000), true);  // passou a janela
});

test('token: compara sem aceitar vazio', () => {
  assert.equal(tokensIguais('abc', 'abc'), true);
  assert.equal(tokensIguais('abc', 'abd'), false);
  assert.equal(tokensIguais('', ''), false);
  assert.equal(tokensIguais(undefined, 'abc'), false);
  assert.equal(tokensIguais('abc', undefined), false);
});

test('evento da API de Conversões: hash SHA-256 normalizado e event_id igual ao do Pixel', () => {
  const v = validar({ ...ok(), nome: 'MARIA da Silva', event_id: 'evt-12345678', fbp: 'fb.1.1700000000000.1234567890', pagina: 'https://sitecomaura.com/', valor: 1200, fonte: 'Simulador de preco' });
  const lead = { ...v.dados, user_agent: 'UA-teste' };
  const ev = montarEventoCapi(lead, 1700000000123);
  assert.equal(ev.event_name, 'Lead');
  assert.equal(ev.event_id, 'evt-12345678');
  assert.equal(ev.event_time, 1700000000);
  assert.equal(ev.action_source, 'website');
  assert.equal(ev.event_source_url, 'https://sitecomaura.com/');
  assert.deepEqual(ev.user_data.ph, [sha256('5511900000000')]);
  assert.deepEqual(ev.user_data.fn, [sha256('maria')]);
  assert.equal(ev.user_data.fbp, 'fb.1.1700000000000.1234567890');
  assert.equal(ev.user_data.fbc, undefined);
  assert.equal(ev.user_data.client_user_agent, 'UA-teste');
  assert.deepEqual(ev.custom_data, { content_name: 'Simulador de preco', value: 1200, currency: 'BRL' });
  assert.equal(JSON.stringify(ev).includes('Maria'), false);       // nada em claro
  assert.equal(JSON.stringify(ev).includes('5511900000000'), false);
  assert.equal(primeiroNome('  JOÃO-Pedro  Souza'), 'joãopedro');
});

test('API de Conversões: sem token pula sem erro; com token manda POST para o pixel certo', async () => {
  assert.equal(await enviarCapi({ event_name: 'Lead' }, { token: '' }), 'sem token');
  assert.equal(await enviarCapi({ event_name: 'Lead' }, {}), 'sem token');
  let chamada;
  const falso = async (url, init) => { chamada = { url, init }; return { ok: true }; };
  assert.equal(await enviarCapi({ event_name: 'Lead' }, { token: 'TOKEN-FALSO', testCode: 'TEST1', fetchImpl: falso }), 'enviado');
  assert.equal(chamada.url, `https://graph.facebook.com/v21.0/${PIXEL_ID}/events`);
  assert.equal(chamada.url.includes('TOKEN-FALSO'), false);          // token fora da URL
  const corpo = JSON.parse(chamada.init.body);
  assert.equal(corpo.access_token, 'TOKEN-FALSO'); assert.equal(corpo.test_event_code, 'TEST1'); assert.equal(corpo.data.length, 1);
  assert.equal(await enviarCapi({}, { token: 'x', fetchImpl: async () => ({ ok: false }) }), 'falhou');
  assert.equal(await enviarCapi({}, { token: 'x', fetchImpl: async () => { throw new Error('rede'); } }), 'falhou');
});

test('pasta do dia usa o horário de Brasília', () => {
  assert.equal(diaBrasilia(Date.parse('2026-10-15T02:30:00Z')), '2026-10-14');
  assert.equal(diaBrasilia(Date.parse('2026-10-15T03:00:00Z')), '2026-10-15');
});
