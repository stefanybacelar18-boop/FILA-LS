# FrotaTMS na Vercel + Supabase (conta NOVA)

> **Não use a conta/projeto Vercel do FilaDock.**  
> **Não use o projeto Supabase `xctzcizqoussthitrihm` das filas.**  
> Este guia é só o FrotaTMS (pasta `frota-tms/`).

O FilaDock permanece em `https://fila-lsl.vercel.app` + o Supabase atual.

---

## Por que assim

- O Postgres **Free da Render expira em 30 dias** — foi isso que derrubou o site.
- O FilaDock não cai porque o banco é **Supabase** (sempre ligado).
- O FrotaTMS passa a usar **outro** projeto Supabase (mesmo tipo de banco) e **outra** conta Vercel (mesmo tipo de host).

Socket.io não existe na Vercel: o front atualiza sozinho a cada 8s.

---

## 1. Conta Vercel nova

1. Saia da conta do FilaDock (ou janela anônima).
2. Crie/entre na **outra** conta em [vercel.com](https://vercel.com).
3. **Add New → Project** → importe o GitHub `stefanybacelar18-boop/FILA-LS`.
4. **Root Directory:** clique Edit e coloque **`frota-tms`** (obrigatório).
5. Framework Preset deve aparecer **Express** (já está no `vercel.json`).
6. **Ainda não dê Deploy** — configure o Supabase e as variáveis antes.

Se o Root Directory ficar vazio, a Vercel tenta buildar o FilaDock nesta conta. Não faça isso.

---

## 2. Projeto Supabase novo

1. [supabase.com](https://supabase.com) → **New project** (nome sugerido: `frota-tms`).
2. Região próxima (ex.: `South America` / `East US`).
3. Guarde a senha do banco.
4. **Settings → Database → Connection string**:
   - **Transaction pooler** (porta **6543**) → `DATABASE_URL`  
     Acrescente no final (se ainda não tiver):  
     `?pgbouncer=true&connection_limit=1`
   - **Direct / Session** (porta **5432**) → `DIRECT_URL`  
     Usado nas migrations. Pode ser o host `db.<ref>.supabase.co`.

São URIs `postgresql://...`. Não copie as chaves `anon` / `service_role` do FilaDock.

Não rode os SQL da pasta `supabase/` (isso é FilaDock). O FrotaTMS usa Prisma.

---

## 3. Variáveis no projeto Vercel do FrotaTMS

Project → **Settings → Environment Variables** (Production + Preview):

| Nome | Valor |
|------|--------|
| `DATABASE_URL` | Pooler 6543 + `pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | Conexão direta 5432 |
| `JWT_SECRET` | ≥24 caracteres, único (não reutilize o do FilaDock) |
| `JWT_EXPIRES_IN` | `8h` |
| `CORS_ORIGIN` | `*` |
| `NODE_ENV` | `production` |
| `SEED_ON_START` | `false` |
| `FORCE_SEED` | `false` |
| `BOOTSTRAP_ADMIN_EMAIL` | `lsl@.com` |
| `BOOTSTRAP_ADMIN_PASSWORD` | senha atual do admin |
| `BOOTSTRAP_ADMIN_NAME` | `LSL Admin` |
| `BOOTSTRAP_OPS_EMAIL` | `ag@.com` |
| `BOOTSTRAP_OPS_PASSWORD` | senha atual da AG |
| `BOOTSTRAP_OPS_NAME` | `AG Operação` |
| `LSL_DRIVER_PIN` | `lsl2026` (ou o PIN em uso) |

Depois: **Deploy**.

---

## 4. Restaurar os dados (backup da Render)

O dump de 20/08/2026 está em:  
https://github.com/stefanybacelar18-boop/FILA-LS/actions/runs/32341568987

1. Baixe o artefato `.sql.gz`.
2. No GitHub → Settings → Secrets → `FROTA_TMS_DATABASE_URL` = **DIRECT_URL** do Supabase novo (porta 5432).
3. Actions → **FrotaTMS Restore DB** → Run workflow (branch desta alteração, ou `main` após o merge).
4. Recarregue o site da Vercel.

Login continua o mesmo (usuários vão no dump). Se o banco estiver vazio, o bootstrap cria `lsl@.com` / `ag@.com`.

---

## 5. Conferir isolamento

- FilaDock: `https://fila-lsl.vercel.app` (conta Vercel antiga, Supabase antigo).
- FrotaTMS: URL `*.vercel.app` da **conta nova**.
- Dois projetos GitHub na Vercel podem apontar para o mesmo repo: um com Root Directory vazio (FilaDock), outro com `frota-tms`.

---

## 6. Render

Pode desligar o web `frota-tms` na Render depois que a Vercel estiver ok. O Postgres Free expirado pode ficar (não clique em Upgrade). Não apague até o restore no Supabase ter funcionado.
