# FILA LSL — Instalação do zero no Supabase

Siga **exatamente** esta ordem. Use **uma nova aba** no SQL Editor para cada arquivo.

---

## Passo 1 — Reset (apaga tudo do FILA LSL)

Arquivo: **`reset-completo.sql`**

- Nova aba → cole → **Run**
- Deve aparecer: *"Reset completo!"*

> Apaga tabelas, triggers, funções e tipos do projeto.
> Não apaga usuários já criados em Authentication.

---

## Passo 2 — Setup (cria tudo de novo)

Arquivo: **`setup-completo.sql`**

- **Nova aba** → cole → **Run**
- Deve listar 4 tabelas:
  - `profiles`
  - `queue_entries`
  - `queue_history`
  - `settings`

---

## Passo 3 — Criar usuário

No painel Supabase (não é SQL):

1. **Authentication → Users → Add user**
2. E-mail: `admin@lsl.com`
3. Senha: `Admin123` (ou outra)
4. Marque **Auto Confirm User**
5. **Create user**

---

## Passo 4 — Tornar administrador

Arquivo: **`criar-admin.sql`**

- Troque `admin@lsl.com` pelo seu e-mail (se diferente)
- **Nova aba** → cole → **Run**
- Deve mostrar seu e-mail com role `administrador`

---

## Passo 5 — Testar

1. `npm run dev` no projeto
2. [http://localhost:3000/login](http://localhost:3000/login)
3. [http://localhost:3000/checkin](http://localhost:3000/checkin) (com `NEXT_PUBLIC_SKIP_GEOFENCE=true` no `.env.local`)

---

## Arquivos antigos (ignore)

Estes foram substituídos pelos 3 arquivos acima:

- `schema.sql`, `schema-safe.sql`, `fix-profiles.sql`
- `passo1` a `passo4`, `01-tables`, `02-triggers`, `03-policies`

Use apenas: **reset-completo → setup-completo → criar-admin**
