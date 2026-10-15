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
    if (p.separados) assert.equal(+attrs.sep, p.separados, p.nome + ' data-sep');
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
    if (p.separados) assert.ok(corpo.includes('Separados: R$ ' + brl(p.separados)), p.nome + ' mostra "Separados"');
  }
});

test('"separados" = Site + Google de tabela + 1º mês de gestão (sem inventar preço de configuração)', () => {
  const c = precos.conta_separados;
  const sg = precos.planos.find((p) => p.id === 'site_google');
  const ads = precos.planos.find((p) => p.id === 'site_google_anuncios');
  assert.equal(c.site_google_tabela, sg.preco_de);
  assert.equal(c.primeiro_mes_gestao, ads.mensal);
  assert.equal(c.total, c.site_google_tabela + c.primeiro_mes_gestao);
  assert.equal(ads.separados, c.total);
  assert.ok(ads.preco < ads.separados);
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
