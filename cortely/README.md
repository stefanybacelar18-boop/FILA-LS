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

No demo mode os dados **persistem em disco** em `.data/cortely-store.json` (sobrevivem ao restart).
Com Supabase configurado e `NEXT_PUBLIC_DEMO_MODE=false`, usa o banco.

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

## Fluxos prontos (P0 + P1 + P2)

1. Agendamento em 3 passos (serviço → barbeiro/horário → dados)
2. Confirmação WhatsApp (API se configurada; senão `wa.me` manual)
3. Admin com login e papéis (`owner` / `reception` / `barber`)
4. No-show, bloqueios pontuais, CRM mínimo (clientes + notas + inativos)
5. Portal do cliente: consultar, cancelar e reagendar (com antecedência mínima)
6. Fila de lembretes + `POST /api/reminders/process` (cron)
7. Barber Points ao concluir atendimento

### Contas demo

| E-mail | Senha | Papel |
|---|---|---|
| `dono@cortely.demo` | `dono123` | owner |
| `recepcao@cortely.demo` | `recepcao123` | reception |
| `rafael@cortely.demo` | `barbeiro123` | barber |

### Módulos Operação (aba Admin → Operação)

- Caixa (abertura/fechamento, sangria/suprimento, vendas, estorno, cupom, PIX)
- Estoque (produtos, custo/margem, alerta mínimo, fornecedores)
- Financeiro (pagar/receber, fiado, DRE rápido)
- Comissões + ranking + metas
- Pacotes pré-pagos e assinaturas
- Lista de espera / encaixe
- Marketing (campanhas WhatsApp, cupons, avaliações)
- Relatórios e auditoria
- Multi-unidades
- Portal do barbeiro em `/pro`

## Isolamento

Pasta raiz deste app: `cortely/`  
Não importe utilitários, schemas, secrets ou rotas de outros projetos da conta.
