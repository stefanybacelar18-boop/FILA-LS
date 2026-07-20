# Deploy permanente do FrotaTMS

> **Escopo exclusivo:** pasta `frota-tms/`.  
> **FilaDock** (Next.js na raiz + Vercel `fila-lsl`) é **outro sistema** — não use este guia nele e **não** altere o projeto Vercel do FilaDock para apontar para esta pasta.

Túneis (Cloudflare / localtunnel) são só para teste. Produção = Docker, Render ou Railway.

---

## Isolamento obrigatório (não quebrar o FilaDock)

| Item | FilaDock (produção) | FrotaTMS |
|------|---------------------|----------|
| Pasta | raiz do repo (`src/`, `package.json`) | só `frota-tms/` |
| Host | **Vercel** (já no ar) | **Docker / Render / Railway** |
| Banco | Supabase | Postgres (ou SQLite em dev) |
| Auth / env | `.env` / Vercel do FilaDock | `frota-tms/.env` ou env do serviço |

Proteções no monorepo (já configuradas):

- `.vercelignore` — Vercel do FilaDock **não envia** `frota-tms/`
- `vercel.json` → `ignoreCommand` — commits **só** em `frota-tms/` **não** disparam rebuild do FilaDock

**Nunca** mude Root Directory / Build Command do projeto Vercel do FilaDock para `frota-tms`.

---

## Opção A — Docker Compose (recomendado na empresa)

Na pasta `frota-tms`:

```bash
cp .env.example .env
# Edite POSTGRES_PASSWORD e JWT_SECRET (≥24 caracteres)
```

**Primeiro start (bootstrap + seed):**

```bash
SEED_ON_START=true FORCE_SEED=true docker compose up --build -d
```

**Depois (produção contínua — sem seed):**

```bash
# garanta SEED_ON_START=false no .env
docker compose up -d
```

- App: `http://SERVIDOR:4000`  
- Health: `http://SERVIDOR:4000/api/health` → `{ ok: true, db: "up" }`  
- Uploads de evidência ficam no volume `frota_uploads`  
- Login demo só existe se o seed rodou — **troque as senhas imediatamente**

Backup:

```bash
./scripts/backup.sh
```

---

## Opção B — Render (URL pública, sem Vercel)

1. Conta em [render.com](https://render.com) → conecte o GitHub (mesmo repo).  
2. **New → Blueprint**  
   - Blueprint Path: `frota-tms/render.yaml`  
   - Isso cria **serviço novo** `frota-tms` + Postgres — **não** mexe no Vercel.  
3. Defina `JWT_SECRET` forte (ou use o gerado).  
4. **Bootstrap único** (Shell do Render, uma vez):

```bash
cd api && FORCE_SEED=true npx tsx prisma/seed.ts
```

5. **Não** deixe `SEED_ON_START=true` no serviço.  
6. Abra a URL `*.onrender.com` e teste `/api/health`.

> No plano free do Render o disco é efêmero: evidências de viagem podem sumir após restart. Para anexos permanentes, preferir Docker na empresa ou disco persistente pago.

---

## Opção C — Railway

1. New Project → Deploy from GitHub  
2. **Root Directory: `frota-tms`** (obrigatório)  
3. Add PostgreSQL → copie `DATABASE_URL`  
4. Usa o `Dockerfile` / `railway.toml` desta pasta  
5. Seed **uma vez** com `FORCE_SEED=true`

---

## Variáveis obrigatórias

| Variável | Produção |
|----------|----------|
| `DATABASE_URL` | `postgresql://...` |
| `JWT_SECRET` | ≥24 chars, único |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | domínio do app (ou `*` só se necessário) |
| `SEED_ON_START` | `false` após o go-live |
| `FORCE_SEED` | `false` após o go-live |

---

## Checklist pós-deploy

- [ ] `/api/health` → `ok` + `db: up`  
- [ ] Login funciona  
- [ ] Trocar senha do admin (e operação)  
- [ ] Seed **não** roda a cada restart  
- [ ] Backup agendado (`scripts/backup.sh` ou snapshot do Postgres)  
- [ ] Confirmar que o **Vercel do FilaDock** continua no ar e **não** aponta para `frota-tms`  
- [ ] URL do FrotaTMS é **outro** host (Docker / onrender / railway)

---

## Dev local (sem Docker)

Continua com SQLite em `api/prisma` — ver [README.md](./README.md). Não misture o `.env` do FilaDock.
