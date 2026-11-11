# Etapa 1.A — Inventário RLS / grants (repo; não aplicado remotamente)

## Helpers SECURITY DEFINER

| Função | Owner | search_path | EXECUTE |
|---|---|---|---|
| `user_barbershop_id()` | postgres | public | authenticated only (REVOKE PUBLIC/anon) |
| `user_role()` | postgres | public | authenticated only |
| `provision_owner_barbershop(...)` | postgres | public | **service_role only** |

Leitura de `profiles` nos helpers: `id = auth.uid()` + `is_active` + `ready`.  
Policy SELECT de `profiles` **não** chama `user_barbershop_id()` (anti-recursão).

## Schema `public`

Ver `fase1a-schema-privileges.md`: **USAGE** para `anon`/`authenticated`/`service_role`; **CREATE** revogado desses papéis e de `PUBLIC` (`20261111_06`).

## Tabelas operacionais 1.A (tenant-owned)

Todas as linhas abaixo: **ENABLE RLS + FORCE RLS** (obrigatório; migration `20261111_03` falha se `relrowsecurity`/`relforcerowsecurity` for falso — sem swallow de `insufficient_privilege`).

| Tabela | Policy | Grants authenticated | anon |
|---|---|---|---|
| products | `*_tenant_all` shop = user_barbershop_id() | SELECT/INSERT/UPDATE/DELETE | REVOKE |
| suppliers | idem | idem | REVOKE |
| cash_sessions | idem | idem | REVOKE |
| sales | idem | idem | REVOKE |
| service_packages | idem | idem | REVOKE |
| waitlist | idem | idem | REVOKE |
| payables | idem | idem | REVOKE |
| campaigns | idem | idem | REVOKE |
| reviews | idem | idem | REVOKE |
| cash_movements | idem | idem | REVOKE |
| stock_movements | idem | idem | REVOKE |
| inventory_counts | idem | idem | REVOKE |
| receivables | idem | idem | REVOKE |
| fiscal_documents | idem | idem | REVOKE |
| ops_audit_log | SELECT+INSERT only (append-only) | SELECT/INSERT (UPDATE/DELETE bloqueados por policy) | REVOKE |
| sale_items | `sale_items_via_sales` JOIN `sales.barbershop_id` | CRUD via policy | REVOKE |
| sale_payments | `sale_payments_via_sales` JOIN `sales.barbershop_id` | CRUD via policy | REVOKE |

## Isolamento SQL comprovado

Suite `npm run test:security:fase1a-rls-sql` (PostgreSQL + role `authenticated` + `auth.uid()`):

- Barbearia A não SELECT/INSERT/UPDATE/DELETE `sale_items`/`sale_payments` da Barbearia B (e simétrico).
- Demais tabelas ops: SELECT isolado + INSERT cross-tenant bloqueado (`products`).

## Auth / sessão (também com RLS)

| Tabela | Nota |
|---|---|
| staff_session_revocations | tenant policy via user_barbershop_id |
| permission_audit_log | idem |
| client_otp_challenges | idem (service role na prática) |
| client_proof_jtis | idem |

## Agenda/CRM (schema base)

barbershops, profiles, barbers, services, working_hours, schedule_blocks, clients, appointments, loyalty_*, reminders — policies em `schema.sql` / `20260328`.

## Notas

- `sale_items` / `sale_payments` sem `barbershop_id` denormalizado; isolamento por JOIN + RLS (aceitável na 1.A).
- Ops JSON ainda é fonte de verdade da UI ops (1.B).
- Migrations **não** aplicadas remotamente nesta entrega.
