# Google Form → FilaDock (sync instantânea)

Planilha: **Respostas FORM VIG**  
https://docs.google.com/spreadsheets/d/15hWsQM_0ht0XSEGn9LZsZhrswCEUxGiQxhem08VxVOo/edit?gid=801601968

## Como funciona (100%)

| Canal | Quando | O que faz |
|-------|--------|-----------|
| **Apps Script** | Nova resposta do Form | Cria na fila em ~2–5 s |
| **Apps Script** | Você edita STATUS na planilha | Atualiza no app na hora |
| **Cron Vercel** | A cada 5 min | Backup — pega o que o script perdeu |
| **Admin** | Botão "Importar todas as linhas" | Histórico completo da planilha |

---

## Passo 1 — Supabase (obrigatório)

SQL Editor → execute:

```
supabase/migracao-google-form.sql
```

---

## Passo 2 — Vercel (obrigatório)

Settings → Environment Variables (Production + Preview):

| Variável | Valor |
|----------|--------|
| `GOOGLE_FORM_WEBHOOK_SECRET` | token longo aleatório (48+ chars) |
| `CRON_SECRET` | **mesmo token** (backup a cada 5 min) |

Opcional (já têm default):

| Variável | Default |
|----------|---------|
| `GOOGLE_FORM_SPREADSHEET_ID` | `15hWsQM_0ht0XSEGn9LZsZhrswCEUxGiQxhem08VxVOo` |
| `GOOGLE_FORM_SHEET_GID` | `801601968` |

**Redeploy** após salvar.

Gerar token no PowerShell:

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
```

---

## Passo 3 — Apps Script na planilha (instantâneo)

1. Planilha → **Extensões** → **Apps Script**
2. Cole `scripts/google-form-apps-script.gs`
3. **Propriedades do script** (Projeto → Configurações):

| Propriedade | Valor |
|-------------|--------|
| `FILADOCK_WEBHOOK_URL` | `https://fila-lsl.vercel.app/api/integrations/google-form` |
| `FILADOCK_WEBHOOK_SECRET` | mesmo valor de `GOOGLE_FORM_WEBHOOK_SECRET` |

4. Executar **uma vez**: `instalarGatilhosFilaDock`  
   - Instala gatilhos  
   - **Importa todo o histórico** da planilha  

---

## Passo 4 — Admin FilaDock (alternativa ao histórico)

`/admin` → card **Google Form → FilaDock** → **Importar todas as linhas agora**

Use se preferir importar pelo app em vez do Apps Script.

---

## Testar

1. Envie uma resposta de teste no Form → aparece no `/operador` em segundos
2. Mude STATUS para `FINALIZADO` → vira Finalizado no app
3. GET `https://fila-lsl.vercel.app/api/integrations/google-form` → `{ "configured": true }`

---

## Status na planilha

| Planilha | FilaDock |
|----------|----------|
| *(vazio)* | Aguardando descarregamento |
| FINALIZADO | Finalizado |
| DESCARREGADO | Finalizado |
