# Ativar Google Form em 3 cliques

## Automático (recomendado)

No PowerShell, na pasta do projeto:

```powershell
.\scripts\ativar-google-form.ps1
```

O script:
1. Copia o SQL e abre o Supabase
2. Verifica a planilha e o app
3. Pergunta se quer importar tudo (`npm run sync:google-form`)

---

## Manual

| # | O quê | Onde |
|---|--------|------|
| 1 | Colar SQL e Run | [Supabase SQL](https://supabase.com/dashboard/project/xctzcizqoussthitrihm/sql/new) |
| 2 | Redeploy (se CRON_SECRET é novo) | [Vercel Deployments](https://vercel.com/fila-lsl/~/deployments) |
| 3 | Importar linhas | `npm run sync:google-form` **ou** [/admin](https://fila-lsl.vercel.app/admin) → **Importar todas** |

---

## SQL (copiar se precisar)

Arquivo: `supabase/migracao-google-form.sql`

---

## Depois

- Novas respostas do Form → fila em até **5 min**
- Edite STATUS na planilha como hoje
- **Apps Script não precisa**
