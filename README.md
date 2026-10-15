# Site da Aura (sitecomaura.com)

Site estático (`index.html`, `assets/`, `img/`) mais uma função serverless, `api/lead.js`, no mesmo projeto da Vercel
(`site-aura-estudio`). Deploy automático a cada merge em `main`; cada branch ganha uma URL de preview. O `.vercelignore` deixa `README.md`, `qa/`, `tests/` e `docs/` fora do deploy.
Não há etapa de build: o `package.json` só declara a dependência da função (`@vercel/blob`).

## Como o lead funciona

1. Os CTAs principais (botão do contato, botão flutuante do WhatsApp e o pedido do simulador) abrem um formulário curto:
   nome, WhatsApp (máscara e validação de celular BR), tipo de negócio, plano e aceite da LGPD.
2. Ao enviar, o navegador faz `POST /api/lead`. A função valida, grava o lead no Vercel Blob e repete o evento `Lead`
   pela API de Conversões do Meta. Só então o site mostra "Recebemos!" e abre o WhatsApp com a mensagem pronta.
3. Se o app do WhatsApp não abrir em 2 s (navegador do Instagram/Facebook, computador sem WhatsApp), o site mostra o
   número, o botão de copiar e o link `api.whatsapp.com/send`. O lead já está gravado, mesmo que a pessoa não mande nada.
4. Se a função estiver fora do ar, o WhatsApp abre do mesmo jeito (a venda não espera o servidor), mas o `Lead` do Pixel
   **não** é disparado, porque ele só sai depois que a função aceita.

### Eventos no Meta

| Evento | Quando | Onde |
|---|---|---|
| `PageView` | carregou a página | Pixel no `<head>` |
| `ViewContent` | mexeu no simulador; chegou na seção `#investimento` | `index.html`, bloco "Medição de anúncios" |
| `Contact` | clicou em qualquer link `wa.me` ou no botão flutuante | `index.html` |
| `Lead` | a função aceitou o formulário | navegador (`eventID`) **e** API de Conversões (`event_id` igual): o Meta deduplica |

O `Lead` leva `content_name` (de onde veio), `value` (preço do plano escolhido, lido do próprio simulador) e `currency: BRL`.

### Variáveis de ambiente (Vercel, projeto `site-aura-estudio`)

| Variável | Para quê | Obrigatória |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | gravar e ler os leads no store `central-leads` (privado, região gru1) | sim (a Vercel preenche ao ligar o store) |
| `SITE_LEADS_TOKEN` | autoriza `GET /api/lead` pelo cabeçalho `Authorization: Bearer` (o painel usa esse token). Fica nas Chaves do macOS: serviço `central-aura`, conta `site_leads_token` | sim |
| `META_CAPI_TOKEN` | token da API de Conversões. Sem ele a função pula o envio ao Meta sem erro (`capi: "sem token"`) | não (mas sem ele o `Lead` só chega pelo Pixel) |
| `META_CAPI_TEST_CODE` | código do "Testar eventos". Só em **Preview**; em produção os eventos iriam para a aba de teste e não contariam | não |
| `LEADS_BLOB_ACCESS` | `private` (padrão) ou `public`, conforme o tipo do store | não |

Nunca escreva token em arquivo, HTML, log ou commit. `.env*` e `.vercel` estão no `.gitignore`.

## Como criar o token da API de Conversões (META_CAPI_TOKEN)

1. Abra o **Gerenciador de Eventos** (business.facebook.com/events_manager2) e escolha o Pixel `1435927114558830`.
2. Vá em **Configurações** e role até **API de Conversões**.
3. Em **Gerar token de acesso**, clique em **Criar token**, copie o valor e guarde-o só no gerenciador de senhas.
4. Na pasta do projeto (já ligada à Vercel), rode e cole o token quando pedir:
   ```
   vercel env add META_CAPI_TOKEN production --sensitive
   vercel env add META_CAPI_TOKEN preview --sensitive
   ```
   (ou em Vercel > Project > Settings > Environment Variables).
5. Faça um novo deploy (variável nova só vale para deploys feitos depois): `vercel deploy --prod` ou um novo merge em `main`.

### Conferir no "Testar eventos"

1. No Gerenciador de Eventos, abra **Testar eventos** e copie o **código do evento de teste** (ex.: `TEST12345`).
2. Cadastre-o **só em Preview**: `vercel env add META_CAPI_TEST_CODE preview`, e faça um deploy de preview.
3. Abra a URL do preview com `?utm_source=teste`, envie o formulário com um número de teste e confira: 1 envio = 1 `Lead`,
   marcado como **Desduplicado** (navegador + servidor com o mesmo `event_id`); o clique no WhatsApp aparece como `Contact`.
4. Depois do teste, remova a variável: `vercel env rm META_CAPI_TEST_CODE preview`.

A função manda no evento: `event_name`, `event_time`, `event_id`, `event_source_url`, `action_source: website`,
`user_data` com telefone (com 55) e primeiro nome em minúsculas em SHA-256, `fbp`, `fbc` e `client_user_agent`.
O token vai no corpo do POST, não na URL. IP não é enviado nem gravado. Se o Meta demorar mais de 1,5 s, a função responde `capi: "falhou"` e o lead continua gravado.

## API `/api/lead`

**POST** `application/json` (só aceita pedido do próprio site):

```json
{ "nome": "Maria", "whatsapp": "11900000000", "tipo": "Clínica", "plano": "Página única", "aceite": true,
  "fonte": "Contato", "valor": 1200, "event_id": "lead_...", "origem": "meta / campanha", "utm": {}, "fbclid": "", "fbp": "", "fbc": "", "pagina": "https://sitecomaura.com/" }
```

- Valida: nome 2 a 80 caracteres; celular BR (11 dígitos, DDD válido, 9 na frente); tipo 2 a 60; plano na lista fechada
  (`Ainda não sei`, `Página única`, `Site institucional`, `Catálogo ou portfólio`); `aceite` igual a `true`.
- Inválido: `400` com `{ ok:false, erros:{campo:mensagem} }`. Mais de 10 pedidos por minuto por IP: `429`.
- Válido: grava `leads/AAAA-MM-DD/<timestamp>-<id>.json` (dia em horário de Brasília) e responde
  `{ ok:true, id, event_id, capi }`, com `capi` = `enviado`, `sem token` ou `falhou`.
- O JSON gravado tem: `id, nome, whatsapp` (com 55, só dígitos)`, whatsapp_fmt, tipo, plano, fonte, valor_plano, origem, utm,
  fbclid, fbp, fbc, event_id, pagina, user_agent, aceite_lgpd, criado_em` (ISO UTC). O IP não é gravado.

**GET** `/api/lead?desde=<ISO>` com o cabeçalho `Authorization: Bearer <SITE_LEADS_TOKEN>` lista os leads criados a partir de
`desde` (mais antigos primeiro, até `limite`, padrão 1000). O token **não** é aceito na URL (`?token=` dá `401`), porque URL vai
para o log de requisições da Vercel. Sem Bearer válido: `401`. Resposta: `{ ok:true, total, truncado, leads:[...] }`.

```
curl -H "Authorization: Bearer $SITE_LEADS_TOKEN" "https://sitecomaura.com/api/lead?desde=2026-10-15T00:00:00Z"
```

Segurança do POST: só aceita `application/json`; recusa `Origin` de outro site (`localhost` só vale fora de produção);
a chamada à API de Conversões tem limite de 1,5 s e nunca segura a resposta; o lead é gravado antes.

## Privacidade

`privacidade.html` explica o que é coletado e como pedir exclusão. O texto precisa de revisão do Nicolas antes de valer
como política oficial.

## Desenvolvimento

```
vercel link --yes --project site-aura-estudio   # uma vez
vercel dev --listen 3100                         # site + função em http://localhost:3100
npm test                                         # testes da validação, hash e evento da API de Conversões
node ~/.claude/skills/site-studio/scripts/qa.mjs index.html qa/ciclo2   # revisão visual e de acessibilidade
```

`vercel dev` grava os leads no mesmo store do site. Lead de teste: nome começando com "Teste Aura" e número `(11) 90000-0000`;
apague depois com `vercel blob del <caminho> --rw-token ...` ou pela tela do Blob na Vercel.

## Título do hero (fx.js)

O `is-in` do que está na primeira tela não depende só do IntersectionObserver: `initSplit` marca o que está visível logo
depois do `buildSplit`, e há uma rede de segurança 1,5 s depois do `load`. `buildSplit` não refaz título que já entrou
(mesma largura, fontes certas), então a barra do navegador do celular sumindo não reinicia a animação.
