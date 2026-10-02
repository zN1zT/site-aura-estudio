# Contexto da sessão — Aura (site + prospecção)

Resumo de tudo o que foi usado, criado e baixado nesta sessão, para outra IA continuar o trabalho.
Data: 2026-09-29. Nenhuma credencial está escrita aqui: elas ficam só no `.env.local` do kit (ver seção 3).

---

## 1. Diretórios

| Caminho | O que é | Status |
|---|---|---|
| `/Users/znizt/Documents/Aura IA/04 Site Aura/Site Aura : Sites` | Site da Aura (estúdio de sites). Repositório git, branch `main`, commit `dbbcd91` | **Sem alterações** nesta sessão (só este arquivo foi criado) |
| `/Users/znizt/Documents/Aura IA/prospeccao-kit-aluno` | Kit de prospecção clonado de `https://github.com/plasdigital/prospeccao-kit-aluno` (commit `f25bd7d`) | Clonado, configurado, dependências instaladas |
| `/private/tmp/claude-501/.../scratchpad/` | Pasta temporária da sessão | Contém só `inspect.mjs` (script de leitura do banco). Descartável |

---

## 2. Site da Aura (projeto atual)

**Arquivos principais:** `index.html` (página única, CSS inline), `assets/fx.css`, `assets/fx.js`, `assets/shader-bg.js`, `img/` (portfólio e nichos), `briefing.md`, `qa/` (screenshots desktop/mobile + `qa-report.json`).

**Briefing:** estúdio de sites para consultores, clínicas, escritórios e negócios locais. Ticket R$ 1,5k–5k. Objetivo: pedido de orçamento pelo WhatsApp. Visual: "Tech escuro", aurora verde, fontes Geist + Instrument Serif. Portfólio: Eduardo Stephano, LF Esquadrias (antes/depois), Forno Vivo (conceito).

**Diagnóstico preliminar** (feito lendo o código; não validado com referências externas):
- Estética "SaaS escuro" padrão de template (preto + aurora verde + serif itálico + bento com cards arredondados).
- Quase todas as seções no mesmo layout (título à esquerda, conteúdo à direita), página sem ritmo.
- Pouca prova: sem depoimentos nem resultados de clientes; os números de abertura são estatísticas genéricas.
- Placeholders ainda visíveis: `[7 a 10] dias`, `[R$ 400]`, `[R$ 350]`, `[R$ 300]`, `[R$ 250]`, `[2 a 3]`, `[30]`, `[10]`, `[EMAIL]`, `[Cidade]`, e nos links `[DDD]`, `[NUMERO]`, `[INSTAGRAM]`. Preços do simulador em `data-v="[1500]"`, `[2800]`, `[4200]`.

**Nenhuma alteração foi feita no site.**

---

## 3. Kit de prospecção (`prospeccao-kit-aluno`)

**O que faz:** "máquina de leads" em linha de comando. Acha empresas de um nicho numa cidade (Google Maps via Apify), enriquece os contatos (WhatsApp, e-mail, Instagram, sócio pelo CNPJ), dá nota de 0 a 100 e marca se a empresa **não tem site** ou tem **site fora do ar**. Não envia mensagens.

**Stack:** Node.js (ES modules, `pg`) conectando direto no Postgres do Supabase. Painel de leitura em `painel/` (Next.js 16, React 19, Tailwind 4). CNPJ pela BrasilAPI.

**Fluxo** (`node prospectar.mjs rodar` executa em sequência):
buscar → enriquecer → ia (pausa: IA da conversa resume sites) → pesquisar → validar → cnpj → instagram → validar → ia (pausa: IA escreve ganchos) → listar/exportar (CSV em `saidas/`).

**Documentação do próprio kit:** `COMECE-AQUI.md`, `README.md`, `MEU-CLIENTE-IDEAL.md` (perguntas para criar um nicho), `OPCOES.md`, `APRENDIZADOS.md`, `docs/`, e instruções para IAs em `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`.

**Nichos prontos:** `nichos/clinica-odontologica.json`, `nichos/energia-solar.json`.

**Configuração — `.env.local`** (permissão 600, ignorado pelo git):
- Usadas pelo código: `APIFY_TOKEN`, `SUPABASE_DB_URL` (session pooler do Supabase; host e projeto no próprio `.env.local`; `@` da senha codificado como `%40`).
- Guardadas, mas não lidas pelo código: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SCHEMA=prospeccao`.
- Vazias (opcionais, economizam Apify): `GOOGLE_PLACES_API_KEY`, `SERPER_API_KEY`.
- Para outra empresa: copie o kit e troque esses valores por credenciais da outra empresa (outro projeto Supabase e outro token Apify, se for o caso).

**O que foi baixado/instalado:**
- Clone do repositório (sem commits locais; só `package-lock.json` e `painel/package-lock.json` novos, não commitados).
- `npm install` na raiz (14 pacotes, 0 vulnerabilidades) e em `painel/` (avisos do `npm audit` não corrigidos; script de instalação do `sharp` bloqueado — liberar com `npm install-scripts approve sharp` se o painel precisar).

**Verificações feitas:**
- Token Apify válido (`GET /v2/users/me` → 200, plano FREE). Nenhum ator rodado, nenhum crédito gasto.
- Banco: conexão OK, inspeção só leitura. Schema `public` vazio. Schema `prospeccao` e tabela `prospeccao.leads` **não existem**.

**Pendente (precisa de aprovação, altera o banco):** aplicar em ordem `sql/001-schema.sql` … `sql/010-ia-da-conversa.sql`. Criam só o schema `prospeccao` (tabela, índices, trigger, RLS). Não mexem em `public`.

**Próximos comandos:**
```bash
cd "/Users/znizt/Documents/Aura IA/prospeccao-kit-aluno"
psql "$SUPABASE_DB_URL" -f sql/001-schema.sql   # repetir até 010, após aprovar
node prospectar.mjs listar --nicho clinica-odontologica   # deve mostrar 0 leads
node prospectar.mjs rodar --nicho clinica-odontologica --praca "Cidade UF"   # ~US$0,02/empresa, 10 empresas
node prospectar.mjs rodar --nicho clinica-odontologica --continuar            # após cada pausa da IA
node prospectar.mjs listar --nicho clinica-odontologica --site sem            # quem não tem site
cd painel && npm run dev   # http://localhost:3000
```

---

## 4. Tentativas que não funcionaram

- **Mobbin MCP:** conectado, mas toda busca retorna "Mobbin MCP requires a paid plan". Precisa de conta paga.
- **Vídeo do YouTube** `https://www.youtube.com/watch?v=QTZzDvcWvwg` — "Como REALMENTE Ganhar Dinheiro Vendendo Sites em 2026" (canal Aprendendo Sites). YouTube bloqueou com verificação anti-robô (navegador e `yt-dlp`). Nada foi baixado. Alternativa: colar a transcrição do próprio YouTube ("Mostrar transcrição").
- Ferramentas locais disponíveis: `yt-dlp`, `ffmpeg`, `whisper-cli` (sem modelo de transcrição baixado).

---

## 5. Segurança

Senha do banco, chave secreta do Supabase e token do Apify foram colados em texto aberto no chat. **Trocar os três** (Supabase: redefinir senha do banco e gerar nova secret key; Apify: novo token) e atualizar o `.env.local`.
