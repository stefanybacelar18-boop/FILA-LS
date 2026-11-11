# Etapa 1.A — Inventário de privilégios do schema `public`

Fonte: migration `20261111_06_fase1a_schema_privileges.sql` + evidência da suite
`npm run test:security:fase1a-rls-sql` (PostgreSQL local/CI; **não** aplicado remotamente).

## Schema `public`

| Papel | USAGE | CREATE |
|---|---|---|
| `PUBLIC` | (ACL base do cluster; `REVOKE CREATE` aplicado) | **revogado** |
| `anon` | **concedido** | **revogado** |
| `authenticated` | **concedido** | **revogado** |
| `service_role` | **concedido** | **revogado** (DDL fica com `postgres`) |
| `postgres` | sim (owner/superuser) | sim |

Separação explícita: **USAGE ≠ CREATE**. Clientes Auth resolvem nomes; não criam objetos.

## Funções SECURITY DEFINER

| Função | Owner | search_path | EXECUTE |
|---|---|---|---|
| `user_barbershop_id()` | postgres | `public` | `authenticated` only |
| `user_role()` | postgres | `public` | `authenticated` only |
| `provision_owner_barbershop(...)` | postgres | `public` | `service_role` only |

Objetos nas funções/policies são qualificados (`public.*`, `auth.*`).

## Tabelas ops 1.A — ENABLE + FORCE RLS

Confirmado pela migration `20261111_03` (verificação `pg_class.relrowsecurity` + `relforcerowsecurity`; falha se ausente) e pela suite SQL:

`products`, `suppliers`, `cash_sessions`, `sales`, `service_packages`, `waitlist`, `payables`, `campaigns`, `reviews`, `cash_movements`, `stock_movements`, `inventory_counts`, `receivables`, `ops_audit_log`, `fiscal_documents`, `sale_items`, `sale_payments`.

Grants tabela: `REVOKE ALL` de `PUBLIC`/`anon`; `SELECT,INSERT,UPDATE,DELETE` a `authenticated` (filtrado por RLS).

## Isolamento A×B

Suite `scripts/sql/fase1a_rls_isolation_*.sql` executa como role `authenticated` com `auth.uid()` simulado e prova SELECT/INSERT/UPDATE/DELETE cruzados em `sale_items`/`sale_payments` e SELECT/INSERT em demais ops.
