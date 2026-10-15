/* Confere que o index.html (data-* do simulador e texto dos planos) está igual a precos.json, e que o formulário
   de lead aceita o nome de cada plano. Preço só muda em um lugar: precos.json; este teste falha se o HTML ficar para trás. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLANOS } from '../api/_lead-lib.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/&nbsp;/g, ' ');
const precos = JSON.parse(readFileSync(new URL('../precos.json', import.meta.url), 'utf8'));
const brl = (n) => n.toLocaleString('pt-BR');

function planoHtml(nome) {
  const re = new RegExp('<label class="plan[^"]*">\\s*<input type="radio" name="tipo" value="' + nome.replace(/[+]/g, '\\+') + '"([^>]*)>([\\s\\S]*?)</label>');
  const m = html.match(re);
  assert.ok(m, 'plano não achado no index.html: ' + nome);
  const attrs = Object.fromEntries([...m[1].matchAll(/data-([\w-]+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
  return { attrs, corpo: m[2] };
}

test('simulador: data-v, data-m, data-prazo e preço riscado batem com precos.json', () => {
  for (const p of precos.planos) {
    const { attrs } = planoHtml(p.nome);
    assert.equal(+attrs.v, p.preco, p.nome + ' data-v');
    assert.equal(+attrs.m, p.mensal, p.nome + ' data-m');
    assert.equal(attrs.prazo, p.prazo, p.nome + ' prazo');
    if (p.preco_de) assert.equal(+attrs['v-de'], p.preco_de, p.nome + ' data-v-de');
    assert.equal(attrs.gestao === '1', p.mensal_tipo === 'gestao', p.nome + ' gestão');
  }
});

test('texto visível dos planos mostra o mesmo preço (e o riscado e o "separados")', () => {
  for (const p of precos.planos) {
    const { corpo } = planoHtml(p.nome);
    const preco = corpo.match(/<span class="plan-price">([\s\S]*?)<\/span>(?=\s*<span class="plan-(?:sep|time)")/);
    assert.ok(preco, p.nome + ': preço não achado');
    const texto = preco[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.ok(texto.includes('R$ ' + brl(p.preco)) || texto.replace(/\s/g, '').includes('R$' + brl(p.preco)), p.nome + ' mostra ' + brl(p.preco) + ' (' + texto + ')');
    if (p.preco_de) assert.ok(texto.includes('R$ ' + brl(p.preco_de)), p.nome + ' mostra o riscado ' + brl(p.preco_de));
  }
});

test('sem "separados" (a configuração da campanha não tem preço fixado) e o riscado é o preço cobrado até 15/10', () => {
  assert.ok(!/separados/i.test(html), 'sobrou "separados" no HTML');
  assert.ok(!/data-sep/.test(html), 'sobrou data-sep');
  assert.ok(!/separados|conta_separados/i.test(JSON.stringify(precos)), 'sobrou "separados" no precos.json');
  const sg = precos.planos.find((p) => p.id === 'site_google');
  const pagina = precos.planos.find((p) => p.id === 'pagina');
  assert.equal(pagina.preco_de, 1200);
  assert.equal(sg.preco_de, 2800);
  assert.ok(html.includes('Inclui a campanha configurada e o 1º mês de gestão; depois R$ 700/mês; verba de anúncio à parte.'));
});

test('extras do simulador batem com precos.json', () => {
  for (const e of precos.extras) {
    const valor = e.valor_html || e.nome;
    const m = html.match(new RegExp('name="extra" value="' + valor.replace(/[+]/g, '\\+') + '" data-v="(\\d+)"'));
    assert.ok(m, 'extra não achado: ' + e.nome);
    assert.equal(+m[1], e.preco, e.nome);
  }
});

test('o formulário de lead lista e a função aceita o nome de cada plano; nada de promoção com data', () => {
  for (const p of precos.planos) {
    assert.ok(PLANOS.includes(p.nome), 'api/_lead-lib.js não aceita ' + p.nome);
    assert.ok(html.includes('<option value="' + p.nome + '">'), 'formulário sem a opção ' + p.nome);
    assert.ok(html.includes("'" + p.nome + "'"), 'lista PLANOS do formulário sem ' + p.nome);
  }
  assert.ok(!/31\/10|data-launch|preço de lançamento/i.test(html), 'sobrou o selo/contador de lançamento');
  const total = html.match(/<b id="sim-total">([^<]+)<\/b>/);
  assert.equal(total && total[1], 'R$ ' + brl(precos.planos[0].preco), '#sim-total deve nascer com o preço do plano marcado, sem depender de JS');
  assert.ok(!/Catálogo/.test(html.replace(/<!--[\s\S]*?-->/g, '').match(/<fieldset class="plans"[\s\S]*?<\/fieldset>/)[0]), 'Catálogo voltou para os planos');
});

test('mostruário: 8 cards (2 no ar + 6 conceito), cada conceito abre uma pasta que existe, e o evento está ligado', async () => {
  const { existsSync } = await import('node:fs');
  const cards = [...html.matchAll(/<a class="work" href="([^"]+)"[^>]*data-nicho="(\w+)" data-mostruario="([\w-]+)" data-tipo="(\w+)"/g)];
  assert.equal(cards.length, 8);
  assert.equal(cards.filter((c) => c[4] === 'no_ar').length, 2);
  const conceito = cards.filter((c) => c[4] === 'conceito');
  assert.equal(conceito.length, 6);
  for (const c of conceito) {
    assert.equal(c[1], 'mostruario/' + c[3] + '/');
    assert.ok(existsSync(new URL('../mostruario/' + c[3] + '/index.html', import.meta.url)), 'falta mostruario/' + c[3]);
    assert.ok(existsSync(new URL('../img/trabalhos/' + c[3] + '.webp', import.meta.url)), 'falta a capa de ' + c[3]);
  }
  assert.ok(html.includes("dl('mostruario_abriu'"), 'evento mostruario_abriu não está ligado');
  assert.ok(html.includes("track('ViewContent',{content_name:'Investimento'})"), 'ViewContent de #investimento sumiu');
});

test('conceitos: aviso no topo, "(projeto conceito)" no título, links sem número, mapa, endereço ou noindex', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const slugs = ['taco-e-navalha', 'pizzaria-dona-zelia', 'piloto-77-oficina-de-motos', 'estudio-lumiar', 'otica-claridade', 'pelucia-spa-pet'];
  for (const s of slugs) {
    const h = readFileSync(new URL('../mostruario/' + s + '/index.html', import.meta.url), 'utf8');
    assert.match(h, /<title>[^<]*\(projeto conceito\)[^<]*<\/title>/, s + ' título');
    assert.ok(h.includes('class="cn-faixa"'), s + ' faixa do topo');
    assert.ok(h.includes('Projeto conceito feito pela Aura. Negócio fictício.'), s + ' aviso do rodapé');
    assert.ok(!/href="(https?:\/\/wa\.me|tel:|https?:\/\/www\.google\.com\/maps)/.test(h), s + ' tem link real de contato ou mapa');
    assert.ok(!/<iframe|noindex/i.test(h), s + ' tem iframe ou noindex');
    assert.ok(!/sala 3|sobreloja/.test(h), s + ' resto de endereço');
  }
  for (const f of ['eduardo-stephano', 'lf-esquadrias', ...slugs]) {
    assert.ok(existsSync(new URL('../img/trabalhos/' + f + '-2x.webp', import.meta.url)), 'falta a capa 2x de ' + f);
  }
});
