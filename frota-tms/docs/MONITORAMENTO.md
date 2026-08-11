# Monitoramento — FrotaTMS

Ferramentas para manter o site rápido e detectar problemas. **Nada aqui é obrigatório** — o app funciona sem configurar.

---

## 1. Keep-alive automático (já ativo)

Workflow **FrotaTMS Keep Alive** (`.github/workflows/frota-tms-keepalive.yml`):

- Ping em `https://frota-tms.onrender.com/api/health` **a cada 5 minutos**
- Acorda o Render Free antes de alguém abrir o site
- **Grátis** — usa o GitHub, sem criar conta no UptimeRobot

Após o merge, confira em **Actions → FrotaTMS Keep Alive**. O primeiro ping pode levar alguns minutos para o cron iniciar.

URL customizada (opcional): variável de repositório `FROTA_TMS_HEALTH_URL`.

---

## 2. UptimeRobot (opcional — alertas por e-mail)

Complementa o keep-alive com **notificação** se o site cair.

1. Conta em [uptimerobot.com](https://uptimerobot.com)
2. **Add New Monitor** → HTTP(s) → `https://frota-tms.onrender.com/api/health`
3. Intervalo: 5 minutos + seu e-mail

---

## 3. Tela de carregamento

Enquanto o React inicia, o site mostra “Carregando FrotaTMS…” em vez de tela preta vazia.

---

## 4. Sentry (erros em produção)

Captura exceções na API e no front com stack trace. Plano gratuito costuma bastar para este volume.

### Configuração

1. Crie conta em [sentry.io](https://sentry.io)
2. Crie **dois projetos** (ou um com duas plataformas):
   - **Node.js** → copie o DSN da API
   - **React** → copie o DSN do front
3. No **Render** → serviço `frota-tms` → **Environment**:

| Variável | Valor |
|----------|--------|
| `SENTRY_DSN` | DSN do projeto Node.js |
| `VITE_SENTRY_DSN` | DSN do projeto React |

4. **Redeploy** após salvar (o front embute `VITE_*` no build)

Opcional:

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `SENTRY_TRACES_SAMPLE_RATE` | `0.05` | % de traces na API |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | `0.05` | % de traces no browser |

### Comportamento

- **Sem DSN:** Sentry não inicia — zero impacto em dev local
- **Com DSN:** erros 500 na API e crashes no React são enviados automaticamente
- A lógica de negócio do app **não muda**

### Testar

Após deploy, force um erro (ex.: rota inexistente na API) ou abra o Sentry → **Issues** para confirmar recebimento.

---

## 5. Checklist rápido

- [x] Keep-alive GitHub (a cada 5 min) — automático após deploy
- [ ] UptimeRobot (opcional, para e-mail se cair)
- [ ] `SENTRY_DSN` no Render (opcional)
- [ ] `VITE_SENTRY_DSN` no Render + redeploy (opcional)
- [ ] Senhas de demo trocadas em produção

---

## 6. Plano pago Render

Se ainda houver espera ocasional, o **Starter (~US$ 7/mês)** elimina o “sleep” do Free. O keep-alive resolve na maioria dos casos sem pagar.
