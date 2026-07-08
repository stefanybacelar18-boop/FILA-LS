# Segurança — checklist de produção (FilaDock)

## 1. Supabase (obrigatório)

No **SQL Editor**, execute na ordem (se ainda não rodou):

1. `supabase/fix-rls-recursion.sql`
2. `supabase/evolucao-v1-parte3-fixes.sql`
3. `supabase/migracao-seguranca-performance.sql`
4. **`supabase/migracao-seguranca-producao.sql`** ← trigger anti-admin falso + perfis
5. **`supabase/migracao-auditoria-seguranca.sql`** ← RPCs LGPD + índices (auditoria 2026)

Confirme que não existem políticas `"Public read by token"` nem `"Public check-in insert"`.

## 2. Vercel — variáveis de ambiente

| Variável | Produção |
|----------|----------|
| `NEXT_PUBLIC_SKIP_GEOFENCE` | **não definir** |
| `NEXT_PUBLIC_SKIP_CHECKIN_LIMITS` | **não definir** |
| `SKIP_GEOFENCE` | **não definir** |
| `SKIP_CHECKIN_LIMITS` | **não definir** |

O código **ignora** esses bypasses quando `NODE_ENV=production`.

## 3. Contas operacionais (obrigatório)

Mantenha **sempre 1 administrador + 1 empilhador** com senhas fortes no Supabase Auth.

- Guia: `docs/CONTAS-OPERACIONAIS.md`
- SQL: `supabase/contas-operacionais-producao.sql`

Remova ou desative contas de **teste** não usadas (ex.: motorista de homologação). **Não** apague admin/empilhador de produção.

## 4. Google Maps (admin)

Restrinja a API key por **HTTP referrer** (domínio Vercel apenas).

## 5. Rotacionar chaves se expostas

Se `.env.local` ou `SUPABASE_SERVICE_ROLE_KEY` vazou, gere nova **service role** no Supabase e atualize a Vercel.

## 6. Histórico Git (opcional)

Commits antigos no GitHub podem conter trailer `Co-authored-by: Cursor`. Isso **não afeta** o app em produção. Remover exige reescrever histórico (`git filter-repo`) e force push — só faça se souber o impacto na equipe/TI.
