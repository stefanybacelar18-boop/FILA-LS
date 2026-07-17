# Deploy permanente do FrotaTMS

O túnel Cloudflare (ACESSO-WEB.md) é ótimo para teste rápido, mas some quando o agente Cloud encerra.
Para um link fixo (produção), escolha uma destas opções.

## Opção A — Render (recomendada, gratuita)

1. Crie conta em [render.com](https://render.com) e conecte o GitHub `stefanybacelar18-boop/FILA-LS`.
2. **New → Blueprint** ou Web Service apontando para a pasta `frota-tms/api`:
   - Build: `npm install && npx prisma generate && npm run build`
   - Start: `npx prisma db push && npx tsx prisma/seed.ts && node dist/index.js`
   - Env:
     - `DATABASE_URL=file:./data/prod.db`
     - `JWT_SECRET=` (gere uma chave forte)
     - `CORS_ORIGIN=*`
     - `PORT=10000`
3. No mesmo serviço, o front já é servido pela API (precisa do `web/dist` no build).

Build unificado sugerido no Render (root dir `frota-tms`):

```bash
npm install --prefix api && npm install --prefix web \
  && npm run build --prefix web \
  && npx prisma generate --schema api/prisma/schema.prisma \
  && npm run build --prefix api
```

Start (primeiro deploy — bootstrap com seed):

```bash
cd api && mkdir -p data && DATABASE_URL=file:./data/prod.db npx prisma db push \
  && FORCE_SEED=true SEED_ON_START=true npx tsx prisma/seed.ts \
  && JWT_SECRET="(chave-forte-24+)" NODE_ENV=production node dist/index.js
```

Start (produção contínua — **sem seed**, preserva dados):

```bash
cd api && mkdir -p data && DATABASE_URL=file:./data/prod.db npx prisma db push \
  && JWT_SECRET="(chave-forte-24+)" NODE_ENV=production node dist/index.js
```

> ⚠️ Nunca rode o seed em produção após o go-live: ele apaga frota, roteiros e viagens.

## Opção B — Railway

1. [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Root: `frota-tms`
3. Mesmas variáveis da Opção A
4. Railway gera URL pública automáticamente (`*.up.railway.app`)

## Opção C — Vercel (só front) + API em outro host

O front Vite pode ir para a Vercel; a API Express precisa de um host Node (Render/Railway).
Configure `VITE_API_URL` no build do front se a API estiver em outro domínio.

## Checklist pós-deploy

- [ ] Abrir `/api/health` → `{ ok: true }`
- [ ] Login com usuário criado no bootstrap (trocar senha imediatamente)
- [ ] `JWT_SECRET` forte (≥24 chars) definido; `NODE_ENV=production`
- [ ] Seed **não** roda a cada restart (`SEED_ON_START` desligado)
- [ ] (Recomendado) migrar SQLite → PostgreSQL antes de volume alto
- [ ] CORS restrito ao domínio do front
