# Etapa 1.A — Foundation Auth + RLS Ops

## Arquitetura implementada

- **Demo:** login HMAC + senhas por papel (env). Payload inclui `sg` (`session_generation`).
- **Produção:** somente **Supabase Auth** JWT (`cortely_sb_*`) + cookie `cortely_sg`. HMAC admin **ignorado**.
- **Onboarding owner:** register → confirmação e-mail → `complete-onboarding` → RPC `provision_owner_barbershop`.
- **Convite staff:** `inviteStaffMember` via Auth Admin (`inviteUserByEmail` / fallback `createUser`) + profile com `barbershop_id` do owner e role atribuída. Staff **não** escolhe tenant/papel próprio.
- **RLS/helpers/RPC:** migrations `20261111_02`–`05` (repo only; **não** aplicadas remotamente nesta entrega).

## Revogação — estratégia definitiva

| Sinal | Unidade | Uso |
|---|---|---|
| JWT `iat` (Supabase) | **segundos** Unix | Observabilidade / auxiliar; **insuficiente sozinho** (mesmo segundo ⇒ mesmo iat) |
| HMAC `iat` (demo) | **milissegundos** | Auxiliar |
| `profiles.session_generation` + cookie/`sg` | inteiro | **Gate principal** |

Fluxo:
1. Login grava geração atual em `cortely_sg` (e no HMAC `sg`).
2. Revoke / role-change / delete: `session_generation += 1`.
3. Próxima request: `presented sg !== current` → 401 (token antigo rejeitado mesmo antes do exp).
4. Novo login (mesmo segundo): cookie/payload com nova geração → OK.

Ver `src/lib/session-epoch.ts`.

## Migrations (repo only)

1. `20261111_02_fase1a_auth_helpers.sql`
2. `20261111_03_fase1a_ops_rls.sql`
3. `20261111_04_fase1a_onboarding_rpc.sql`
4. `20261111_05_fase1a_session_generation.sql`

## CI root cause (d62b0d4)

`security-phase0` falhou na PR: após revoke, `parseSessionToken` ainda aceitava o token quando `iat` (ms) e `revoked_at` coincidiam no mesmo milissegundo (`iat < revoked_at` falso). Correção intermediária usou `<=`, mas a estratégia final é **`session_generation`**, que resolve também o caso JWT de mesmo segundo.
