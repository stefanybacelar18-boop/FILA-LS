# Sync instantânea (na hora) — 5 minutos

## ANTES DE TUDO — Redeploy Vercel

O webhook ainda precisa estar no ar:

1. https://vercel.com/fila-lsl/~/deployments
2. Último deploy → **⋯** → **Redeploy** → aguarde **Ready**
3. Teste: abra https://fila-lsl.vercel.app/api/integrations/google-form  
   Deve mostrar: `"configured": true` (não 404)

---

## Apps Script (sync na hora)

### 1. Abrir editor
Planilha **Respostas FORM VIG** → **Extensões** → **Apps Script**

### 2. Colar código
Apague tudo → cole o conteúdo de `scripts/google-form-apps-script.gs` → **Salvar**

### 3. Propriedades do script
Ícone **engrenagem** → **Propriedades do script** → adicionar:

| Propriedade | Valor |
|-------------|--------|
| `FILADOCK_WEBHOOK_URL` | `https://fila-lsl.vercel.app/api/integrations/google-form` |
| `FILADOCK_WEBHOOK_SECRET` | **mesmo token** que está na Vercel em `GOOGLE_FORM_WEBHOOK_SECRET` |

### 4. Instalar gatilhos
1. No dropdown de funções, escolha **`instalarGatilhosFilaDock`**
2. Clique **Executar**
3. Autorize quando o Google pedir

Pronto.

---

## O que passa a ser instantâneo

| Ação na planilha | App |
|------------------|-----|
| Nova resposta do Form | **Aguardando descarregamento** em ~2–5 s |
| STATUS → `FINALIZADO` | **Finalizado** na hora |
| STATUS → `DESCARREGADO` | **Finalizado** na hora |

---

## Testar

1. Mude o STATUS de uma linha para `FINALIZADO`
2. Em ~5 s, confira em https://fila-lsl.vercel.app/operador

Se falhar: Apps Script → **Execuções** (ver erro).

Ou selecione uma linha → execute `testarSyncLinhaAtiva`.

---

## Não prejudica o MVP

- Form e planilha continuam iguais
- Só **lê** a planilha e avisa o FilaDock
- Para desligar: Apps Script → **Gatilhos** → apagar os dois gatilhos
