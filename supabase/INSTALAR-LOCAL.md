# Instalar banco para teste local — FILA LSL

Erro **"Could not find the table public.profiles"** = banco vazio ou setup incompleto.

## Passo a passo (Supabase → SQL Editor)

Rode **cada arquivo em uma NOVA aba**, **na ordem**, clicando **Run**:

| Ordem | Arquivo | O que faz |
|-------|---------|-----------|
| 0 | `verify.sql` | (opcional) vê o que já existe |
| 1 | `reset-completo.sql` | Limpa tudo — **só se quiser recomeçar do zero** |
| 2 | `setup-completo.sql` | Cria tabelas, enums, triggers, RLS base |
| 3 | `evolucao-v1-parte1-enums.sql` | Role empilhador + status racks |
| 4 | `evolucao-v1-parte2.sql` | Colunas motorista, minuta, audit log |
| 5 | `evolucao-v1-parte3-fixes.sql` | RPC fila/TV + policies |
| 6 | `fix-rls-recursion.sql` | Corrige erro "infinite recursion" |
| 7 | `fix-roles-teste.sql` | Corrige roles das contas @lsl.com |
| 8 | `criar-usuarios-fixos.sql` | Vincula perfis às contas de teste |

## Criar usuários de teste no Auth

**Authentication → Users → Add user** (Auto Confirm):

| E-mail | Senha |
|--------|-------|
| motorista@lsl.com | Motorista@2024 |
| operador@lsl.com | Operador@2024 |
| empilhador@lsl.com | Empilhador@2024 |
| admin@lsl.com | Admin@2024 |

Depois rode **`criar-usuarios-fixos.sql`** e **`fix-roles-teste.sql`**.

## Confirmar que funcionou

Rode `verify.sql` — deve listar:

- profiles
- settings
- queue_entries
- queue_history
- user_role
- queue_status

## Criar usuário operador (se ainda não tiver)

1. Supabase → **Authentication** → **Users** → **Add user**
2. E-mail: `oi@oi.com` + senha
3. Marque **Auto Confirm User**
4. Rode de novo: `fix-backfill-profiles.sql`

## Depois no PC

```cmd
cd C:\Users\Stefanie\Projects\fila-lsl
npm run dev
```

Abra: http://localhost:3000

## .env.local mínimo

```
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SKIP_GEOFENCE=true
```

## Se o passo 2 der erro "already exists"

Pule o `reset-completo.sql` e rode só a partir do arquivo que falhou, **ou** faça reset + setup do zero.
