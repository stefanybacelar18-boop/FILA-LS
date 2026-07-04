# Instalação Supabase — FilaDock (ordem correta)

Use **apenas esta sequência** para ambiente alinhado com o app atual.

## 1. Reset (opcional — apaga dados)

```sql
-- supabase/reset-completo.sql
```

## 2. Schema base

```sql
-- supabase/setup-completo.sql
```

## 3. Evolução motorista + RLS

```sql
-- supabase/evolucao-v1-parte1-enums.sql
-- supabase/evolucao-v1-parte2.sql
-- supabase/evolucao-v1-parte3-fixes.sql
-- supabase/fix-rls-recursion.sql
```

## 4. Status simplificados (3 status) + prioridade + RPC

```sql
-- supabase/migracao-status-simplificado.sql
-- supabase/migracao-prioridade-cpf.sql
-- supabase/migracao-rpc-fila.sql
```

## 5. Contas de teste

Crie no **Authentication → Users** (Auto Confirm):

| E-mail | Senha |
|--------|-------|
| motorista@lsl.com | Motorista@2024 |
| empilhador@lsl.com | Empilhador@2024 |
| admin@lsl.com | Admin@2024 |

```sql
-- supabase/fix-roles-teste.sql
-- supabase/criar-usuarios-fixos.sql
```

## Papéis do app

| Papel | Função |
|-------|--------|
| **motorista** | Check-in (sem CPF), painel com posição e minutas |
| **empilhador** | Fila, WhatsApp, prioridade, status |
| **administrador** | Tudo + previsões, geofence, dashboard |

> Papéis `operador` e `supervisor` no banco são legados — o app trata como empilhador.

## Arquivos deprecados (não usar)

`schema.sql`, `03-policies.sql`, `criar-operador.sql`, `passo1–4`, `fix-operador-oi.sql`
