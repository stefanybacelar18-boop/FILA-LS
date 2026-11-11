# Etapa 1.A — Foundation Auth + RLS Ops

## Arquitetura implementada

- **Demo (`NEXT_PUBLIC_DEMO_MODE=true`):** login HMAC + senhas por papel (env). Sessões reconciliadas com `demoStore` e revogação por `iat`.
- **Produção:** somente **Supabase Auth** (JWT em cookies `cortely_sb_access` / `cortely_sb_refresh`). Cookie `cortely_session` HMAC é **ignorado** (`parseSessionToken` → `null`).
- **Gate:** `getLiveSession` em rotas admin/ops — profile ativo + `provisioning_status=ready` + revogação temporal (`iat > revoked_at` permite novo login; `iat <= revoked_at` rejeita).
- **Onboarding:** `POST /api/auth/register` → confirmação de e-mail → `POST /api/auth/complete-onboarding` → RPC `provision_owner_barbershop` (service_role, idempotente).
- **RLS:** migrations `20261111_02`–`04` (helpers, ops RLS, RPC). **Não aplicadas remotamente** nesta entrega.

## Migrations (repo only)

1. `20261111_02_fase1a_auth_helpers.sql`
2. `20261111_03_fase1a_ops_rls.sql`
3. `20261111_04_fase1a_onboarding_rpc.sql`

## Pendências (fora de 1.A)

- Etapa 1.B: migrar `ops-store` JSON → Postgres
- Convite de funcionários via Auth Admin API
- FKs compostas / Storage (planejado nas revisões)
- Aplicar migrations no projeto Supabase remoto
