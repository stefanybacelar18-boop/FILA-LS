# Cortely

SaaS de agendamento e fidelidade para barbearias — **projeto 100% isolado** (não compartilha código, `.env`, Supabase nem deploy com FilaDock / FrotaTMS).

> Nome de produto: **Cortely** (BarberFlow já existe no mercado).

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Supabase (PostgreSQL + Auth) — projeto próprio
- Vercel — projeto próprio

## Demo local (sem Supabase)

```bash
cd cortely
npm install
cp .env.example .env.local   # já vem com DEMO MODE
npm run dev
```

Abra:

- Landing: http://localhost:3000
- Página do cliente: http://localhost:3000/b/navalha-negra
- Admin demo: http://localhost:3000/admin

No demo mode os dados ficam em memória no processo do servidor (reiniciar o `dev` zera a agenda).

## Supabase (produção / staging)

1. Crie um projeto **novo** no Supabase chamado `cortely` (não reutilize o do FilaDock).
2. Rode `supabase/schema.sql` no SQL Editor.
3. Rode `supabase/seed.sql`.
4. Preencha `.env.local`:

```env
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Deploy Vercel

1. Importe **somente** o repositório/pasta `cortely` (Root Directory = raiz deste app).
2. Configure as env vars do Supabase Cortely.
3. Não aponte para o projeto Vercel do FilaDock.

## Fluxos prontos

1. Agendamento em 3 passos (serviço → barbeiro/horário → dados)
2. Confirmação via WhatsApp (`wa.me`)
3. Admin: agenda do dia, concluir/cancelar
4. Barber Points: ao concluir atendimento, soma ponto; ao atingir a meta, zera e libera o ciclo da recompensa

## Isolamento

Pasta raiz deste app: `cortely/`  
Não importe utilitários, schemas, secrets ou rotas de outros projetos da conta.
