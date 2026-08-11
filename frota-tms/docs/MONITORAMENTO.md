# Monitoramento — FrotaTMS

Ferramentas opcionais para saber quando o sistema cai ou quando há erros em produção. **Nenhuma delas é obrigatória** — o app funciona normalmente sem configurar.

---

## 1. UptimeRobot (disponibilidade)

Monitora se o site está no ar. Plano gratuito: até 50 monitores, ping a cada 5 minutos.

### Configuração

1. Crie conta em [uptimerobot.com](https://uptimerobot.com)
2. **Add New Monitor**
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** FrotaTMS
   - **URL:** `https://frota-tms.onrender.com/api/health`
   - **Monitoring Interval:** 5 minutes
3. **Alert Contacts:** adicione e-mail (ou Telegram/WhatsApp no plano pago)
4. Salve

### O que esperar

Resposta saudável (`200`):

```json
{
  "ok": true,
  "service": "frota-tms-api",
  "db": "up",
  "uptimeSec": 3600,
  "commit": "abc1234"
}
```

Se `ok: false` ou status `503`, o banco está inacessível — o monitor deve alertar.

> **Render free:** o serviço pode “dormir” após inatividade. O primeiro acesso demora ~30s; o UptimeRobot ajuda a manter acordado ou avisa quando cai.

---

## 2. Sentry (erros em produção)

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

## 3. Checklist rápido

- [ ] UptimeRobot apontando para `/api/health`
- [ ] E-mail de alerta configurado
- [ ] `SENTRY_DSN` no Render
- [ ] `VITE_SENTRY_DSN` no Render + redeploy
- [ ] Senhas de demo trocadas em produção

---

## 4. Próximas melhorias (futuro)

- Backup automático do Postgres (cron no Render ou GitHub Actions)
- Playwright smoke tests no CI
- `prisma migrate deploy` em produção (em vez de `db push`)
