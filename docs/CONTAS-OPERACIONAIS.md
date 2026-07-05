# Contas operacionais — Admin e Empilhador

O FilaDock **sempre precisa** de pelo menos:

| Papel | Função no pátio | Login |
|-------|-----------------|-------|
| **Administrador** | Dashboard, fila completa, minutas, check-ins, geofence | `/login` |
| **Empilhador** | Fila, chamar motorista, finalizar/ausente | `/login` |

As melhorias de segurança **não removem** esses papéis. Elas só impedem que um **motorista** se promova a admin sozinho.

## Como criar ou recuperar as contas

### Passo 1 — Supabase Auth

1. [Supabase → Authentication → Users](https://supabase.com/dashboard)
2. **Add user** (e-mail + senha forte, marque **Auto Confirm User**)
3. Repita para admin e empilhador (podem ser e-mails `@lsl.com` ou corporativos reais)

### Passo 2 — Perfis no banco

1. Abra `supabase/contas-operacionais-producao.sql`
2. Ajuste os e-mails nas linhas `admin@lsl.com` e `empilhador@lsl.com` se usar outros
3. Rode no **SQL Editor**

### Passo 3 — Testar

| Conta | URL | Deve abrir |
|-------|-----|------------|
| Admin | `/login` → `/admin` ou `/dashboard` | Painel admin |
| Empilhador | `/login` → `/empilhador` | Fila operacional |

## E-mails fixos no código

Estes e-mails têm papel **corrigido automaticamente** no login (via service role):

- `admin@lsl.com` → administrador  
- `empilhador@lsl.com` → empilhador  

Definido em `src/lib/constants.ts` (`FIXED_ACCOUNT_ROLES`). Se usar outros e-mails, o SQL do passo 2 define o papel; não é obrigatório usar `@lsl.com`.

## Segurança vs operação

| Faça | Não faça |
|------|----------|
| Senhas fortes e únicas para admin e empilhador | Senhas padrão tipo `Admin@2024` em produção |
| Manter sempre 1 admin + 1 empilhador ativos | Apagar as duas contas staff |
| Trocar senha se alguém sair da equipe | Compartilhar a mesma senha entre pessoas |

## Trocar empilhador ou admin

1. Crie o novo usuário no Supabase Auth  
2. Rode o SQL de perfis com o e-mail novo  
3. Desative ou apague o usuário antigo no Auth  

Motoristas continuam entrando só por `/login/motorista` (Google/Apple).
