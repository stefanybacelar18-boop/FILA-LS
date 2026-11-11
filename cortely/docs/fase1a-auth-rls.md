# Etapa 1.A — Foundation Auth + RLS Ops

## Arquitetura implementada

- **Demo:** login HMAC + senhas por papel (env). Payload inclui `sg` (`session_generation`).
- **Produção:** somente **Supabase Auth** JWT (`cortely_sb_*`) + cookie `cortely_sg` **assinado** (HMAC). HMAC admin legado **ignorado**.
- **Onboarding owner:** register → confirmação e-mail → `complete-onboarding` → RPC `provision_owner_barbershop`.
- **Convite staff:** `inviteStaffMember` via Auth Admin (`inviteUserByEmail` / fallback `createUser` com `email_confirm: false`). Profile fica `pending_email`/`is_active=false` até confirmação → `activateInvitedStaff` no login. Falha de profile após Auth → `deleteUser` compensatório. Staff **não** escolhe tenant/papel; `barbershop_id` só da sessão; só owner atribui `owner`.
- **RLS/helpers/RPC:** migrations `20261111_02`–`05` (repo only; **não** aplicadas remotamente). Inventário: `docs/fase1a-rls-inventory.md`.

## Revogação — estratégia definitiva

| Sinal | Unidade | Uso |
|---|---|---|
| JWT `iat` (Supabase) | **segundos** Unix | Observabilidade / auxiliar; **insuficiente sozinho** |
| HMAC `iat` (demo) | **milissegundos** | Auxiliar |
| `profiles.session_generation` + proof `cortely_sg` | inteiro + HMAC | **Gate principal (produção)** |

Proof `cortely_sg` = `base64url({uid, sg, ath}).HMAC` onde `ath = sha256(access_token)`.
Vincula usuário + geração + JWT atual. Cookie HttpOnly/Secure/SameSite=Lax — **não** substitui a assinatura.

Fluxo:
1. Login emite proof assinado com `sg` atual + hash do access_token.
2. Revoke / role-change / delete: `session_generation += 1` + `signOut(global)` (prod).
3. Request: proof inválido / uid mismatch / token mismatch / sg mismatch → sessão null.
4. Novo login: novo proof com nova geração → OK. Cookie adulterado ou JWT antigo + sg forjado → falha.

Ver `src/lib/session-epoch.ts`.

## Migrations (repo only)

1. `20261111_02_fase1a_auth_helpers.sql`
2. `20261111_03_fase1a_ops_rls.sql`
3. `20261111_04_fase1a_onboarding_rpc.sql`
4. `20261111_05_fase1a_session_generation.sql`

## CI root cause (d62b0d4)

`security-phase0` falhou na PR: após revoke, `parseSessionToken` ainda aceitava o token quando `iat` (ms) e `revoked_at` coincidiam no mesmo milissegundo (`iat < revoked_at` falso). Correção intermediária usou `<=`, mas a estratégia final é **`session_generation`**, que resolve também o caso JWT de mesmo segundo.
