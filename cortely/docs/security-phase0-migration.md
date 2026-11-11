# Fase 0 — Dados pessoais, JSON e migração para Supabase

## Dados pessoais no armazenamento atual (demo JSON)

Arquivo típico: `.data/cortely-store.json` (ou `CORTELY_DATA_DIR` / `/tmp`).

| Origem | Campos sensíveis |
|---|---|
| `demo` | clientes (nome, telefone, e-mail, notas, preferências), agendamentos, loyalty, staff (e-mail, papel) |
| `ops` | vendas (nome cliente), receivables, waitlist (nome/telefone), reviews, campanhas |

## Quem acessa hoje

- Processo Node do app (filesystem local da instância)
- Staff autenticado da **mesma** `barbershop_id` via APIs admin/ops
- Cliente autenticado por OTP **somente** do próprio telefone + loja

**Não é adequado** para multi-tenant comercial em produção: um arquivo compartilhado, sem criptografia em disco, sem RLS.

## Exposição entre empresas

- Em demo há **uma** loja seed (`navalha-negra`).
- APIs admin/ops/dashboard validam `session.barbershop_id`.
- Client proof agora exige `shop_id` no token.
- `ops-store` ainda é single-tenant em memória até o port Postgres (bloqueia shop_id ≠ seed).

## Estratégia de migração (sem perda)

1. **Congelar escrita** opcional (flag read-only) no JSON no momento do cutover.
2. **Export** estruturado: `demo` → tabelas `clients`, `appointments`, `loyalty_*`, `profiles`; `ops` → `products`, `sales`, `sale_items`, `sale_payments`, `cash_*`, `payables`, `receivables`, `waitlist`, `campaigns` (migration `20260329` + `20260330`).
3. **Mapear UUIDs** existentes (seed estável) para manter FKs.
4. **Import** via service role em transação por `barbershop_id`.
5. **Validar contagens** (clientes, vendas, saldo) e amostragem.
6. **Ligar** `NEXT_PUBLIC_DEMO_MODE=false` + Supabase URL/keys.
7. **Retirar** dependência de `persist.ts` para ops (fase seguinte).
8. **Auth:** migrar staff para Supabase Auth; `profiles.id = auth.users.id`; revogações em `staff_session_revocations`.

Rollback: manter snapshot do JSON + dump SQL até N dias após cutover.

## Supabase Auth (preparação)

- Login staff → Auth e-mail/senha (ou magic link)
- Sessão JWT + `user_barbershop_id()` / `user_role()` já previstos em RLS
- Backend **continua** validando permissão e tenant (RLS não substitui `requirePermission` / shop scope)
- Recuperação de senha nativa do Auth
- Isolamento: toda query com `barbershop_id` + policies
- Bridge atual: `getLiveSession` reconcilia cookie HMAC com `profiles` + `staff_session_revocations`
- OTP/JTI: tabelas `client_otp_challenges` + `client_proof_jtis` (migration `20260331`)
- **Fora do DEMO MODE**, `authenticateStaff` recusa login com senhas compartilhadas por papel (503) até Auth
- `createServiceClient` exige `SUPABASE_SERVICE_ROLE_KEY` fora do demo (sem fallback anon)
- Ops JSON / client-lookup: pacotes e planos só quando `shop.id ===` seed; demais lojas não recebem ops alheio

## WhatsApp

- **Meta:** `META_WHATSAPP_TOKEN` + `META_WHATSAPP_PHONE_NUMBER_ID` (legado: `WHATSAPP_API_*`)
- **Evolution:** `EVOLUTION_API_URL` + `EVOLUTION_API_KEY` + `EVOLUTION_INSTANCE`
- `WHATSAPP_PROVIDER=meta|evolution` opcional
- Não exigir IDs Meta para Evolution

<!-- phase0: cortely-only commit to skip root Vercel after vercel.json ignore update -->
