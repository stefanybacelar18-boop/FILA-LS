# Deploy permanente do FrotaTMS

> Escopo: **somente** a pasta `frota-tms/`.  
> O FilaDock (Next.js na raiz) é outro sistema — não use este guia nele.

O túnel Cloudflare/localtunnel é só para teste. Para URL fixa, use Docker, Render ou Railway.

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
- Login demo só existe se o seed rodou — **troque as senhas imediatamente** (menu → Trocar senha).

Backup:

```bash
./scripts/backup.sh
```

---

## Opção B — Render (URL pública)

1. Conta em [render.com](https://render.com) → conecte o GitHub.  
2. **New → Blueprint** usando `frota-tms/render.yaml`  
   - Root Directory: `frota-tms`  
3. O blueprint sobe Postgres + web service Node.  
4. Defina `JWT_SECRET` forte (ou use o gerado).  
5. **Bootstrap único** (Shell do Render, uma vez):

```bash
cd api && FORCE_SEED=true npx tsx prisma/seed.ts
```

6. **Não** deixe `SEED_ON_START=true` no serviço.

---

## Opção C — Railway

1. New Project → Deploy from GitHub  
2. Root Directory: `frota-tms`  
3. Add PostgreSQL plugin → copie `DATABASE_URL`  
4. Build / start equivalentes ao Docker (ou use o `Dockerfile` da pasta)  
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

---

## Checklist pós-deploy

- [ ] `/api/health` → `ok` + `db: up`  
- [ ] Login funciona  
- [ ] Trocar senha do admin  
- [ ] Seed **não** roda a cada restart  
- [ ] Backup agendado (`scripts/backup.sh` ou snapshot do Postgres)  
- [ ] Confirmar que o deploy **não** aponta para o FilaDock na raiz  

---

## Dev local (sem Docker)

Continua com SQLite em `api/prisma` — ver [README.md](./README.md). Não misture o `.env` do FilaDock.
