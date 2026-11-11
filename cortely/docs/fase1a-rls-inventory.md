# Etapa 1.A — Inventário RLS / grants (repo; não aplicado remotamente)

## Helpers SECURITY DEFINER

| Função | Owner | search_path | EXECUTE |
|---|---|---|---|
| `user_barbershop_id()` | postgres | public | authenticated only (REVOKE PUBLIC/anon) |
| `user_role()` | postgres | public | authenticated only |
| `provision_owner_barbershop(...)` | postgres | public | **service_role only** |

Leitura de `profiles` nos helpers: `id = auth.uid()` + `is_active` + `ready`.  
Policy SELECT de `profiles` **não** chama `user_barbershop_id()` (anti-recursão).

## Tabelas operacionais 1.A (tenant-owned)

| Tabela | RLS | Policy | Grants authenticated | anon |
|---|---|---|---|---|
| products | ENABLE+FORCE | `*_tenant_all` shop = user_barbershop_id() | SELECT/INSERT/UPDATE/DELETE | REVOKE |
| suppliers | idem | idem | idem | REVOKE |
| cash_sessions | idem | idem | idem | REVOKE |
| sales | idem | idem | idem | REVOKE |
| service_packages | idem | idem | idem | REVOKE |
| waitlist | idem | idem | idem | REVOKE |
| payables | idem | idem | idem | REVOKE |
| campaigns | idem | idem | idem | REVOKE |
| reviews | idem | idem | idem | REVOKE |
| cash_movements | idem | idem | idem | REVOKE |
| stock_movements | idem | idem | idem | REVOKE |
| inventory_counts | idem | idem | idem | REVOKE |
| receivables | idem | idem | idem | REVOKE |
| fiscal_documents | idem | idem | idem | REVOKE |
| ops_audit_log | ENABLE+FORCE | SELECT+INSERT only (append-only) | SELECT/INSERT | REVOKE |
| sale_items | ENABLE+FORCE | via JOIN sales.barbershop_id | CRUD via policy | REVOKE |
| sale_payments | ENABLE+FORCE | via JOIN sales.barbershop_id | CRUD via policy | REVOKE |

## Auth / sessão (também com RLS)

| Tabela | Nota |
|---|---|
| staff_session_revocations | tenant policy via user_barbershop_id |
| permission_audit_log | idem |
| client_otp_challenges | idem (service role na prática) |
| client_proof_jtis | idem |

## Agenda/CRM (schema base — já com RLS de owner)

barbershops, profiles, barbers, services, working_hours, schedule_blocks, clients, appointments, loyalty_*, reminders — policies existentes em `schema.sql` / `20260328`.

## Lacunas conhecidas (não bloqueiam 1.A de Auth; entram em 1.B/FK composta)

- `sale_items` / `sale_payments` sem `barbershop_id` denormalizado (isolamento via JOIN).
- Ops JSON ainda é fonte de verdade da UI ops (1.B).
- Vitrine pública (`Public read *`) permanece ampla para catálogo — writes nunca anon.

## Cross-tenant

Toda policy `USING/WITH CHECK` de ops usa `barbershop_id = public.user_barbershop_id()`.  
Usuário sem profile ativo → helper NULL → 0 linhas.
