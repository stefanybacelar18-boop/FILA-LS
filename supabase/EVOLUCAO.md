# FilaDock — Evolução v1

Execute **depois** do `setup-completo.sql`:

## SQL (2 passos obrigatórios)

O PostgreSQL **não permite** adicionar enum e usá-lo na mesma execução.

### Passo A — `evolucao-v1-parte1-enums.sql`
Nova aba → cole → **Run** → deve aparecer *"Enums criados!"*

### Passo B — `evolucao-v1-parte2.sql`
**Nova aba** → cole → **Run** → deve aparecer *"Evolução v1 aplicada!"*

> Não use o `evolucao-v1.sql` antigo de uma vez — ele foi dividido em parte1 e parte2.

## Novidades

### Autenticação motorista
- `/login/motorista` — e-mail + senha
- Magic Link no mesmo login
- `/cadastro/motorista` — criar conta (role: motorista)
- Check-in exige login

### Check-in
- Novos campos: minuta, tipo veículo, placas, racks vazios
- API `/api/checkin` com antifraude (IP, device, GPS)
- Cooldown 6 dias (admin libera em `/admin`)

### Painéis
- `/minha-fila` — motorista autenticado
- `/empilhador` — painel mobile empilhador
- `/fila/[token]` — público LGPD (sem PII)

### Perfis
- Novo: `empilhador`
- Criar no Supabase: `UPDATE profiles SET role = 'empilhador' WHERE email = '...'`

### Status novo
- `aguardando_carregamento_racks`

## Testar

1. Cadastrar motorista em `/cadastro/motorista`
2. Login em `/login/motorista`
3. Check-in em `/checkin` (com `NEXT_PUBLIC_SKIP_GEOFENCE=true` em dev)
4. Acompanhar em `/minha-fila`
