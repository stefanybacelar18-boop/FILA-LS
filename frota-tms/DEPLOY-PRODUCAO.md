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

## Opção B — Render (URL pública, sem Vercel) — recomendado agora

**One-click (só FrotaTMS — não mexe no FilaDock):**

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/stefanybacelar18-boop/FILA-LS)

1. Abra o link acima (conta Render gratuita com GitHub).  
2. Confirme o Blueprint `render.yaml` da **raiz** (serviço `frota-tms` + Postgres).  
3. Clique **Apply** / Deploy.  
4. Aguarde o build (~5–10 min) e abra a URL `https://frota-tms.onrender.com`.  
5. **Login produção** (criado automaticamente se o banco estiver vazio):  
   - Admin: `admin@frotatms.app` / `TrocarSenha@2026`  
   - Operação: `operacao@frotatms.app` / `TrocarSenha@2026`  
   - **Troque as senhas** no primeiro acesso  
6. Confirme que o FilaDock (`https://fila-lsl.vercel.app`) segue normal.

> Alternativa manual: New → Blueprint → Path `frota-tms/render.yaml`.  
> Disco free é efêmero para anexos; na empresa prefira Docker.

### Se o Sync falhar em “Create database frota-tms-db”

Causa mais comum: **já existe 1 Postgres free** no workspace (limite do Render).

1. Menu **Databases** no Render  
2. Se houver um banco free antigo/não usado → **Delete**  
3. Volte no Blueprint `frota-tms` → **Manual sync**  
4. Espere o web service ficar **Live**

Se ainda falhar: crie o Postgres free **na mão** (New → Postgres → Free → nome `frota-tms-db`) e depois **Manual sync** de novo.

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
