# Monitoramento — FrotaTMS

Ferramentas para manter o site rápido e detectar problemas. **Nada aqui é obrigatório** — o app funciona sem configurar.

---

## 1. Keep-alive automático (já ativo)

Dois workflows no GitHub mantêm o Render acordado:

| Workflow | Quando |
|----------|--------|
| **FrotaTMS Keep Alive** | :00, :15, :30, :45 de cada hora |
| **FrotaTMS Keep Alive (offset)** | :07, :22, :37, :52 |

Cada execução faz **rajada de pings** (health + home) por ~15 minutos — cobre a limitação do cron do GitHub (que nem sempre roda a cada 5 min).

O **app também pinga** `/api/health` a cada 4 min enquanto alguém está com a aba aberta.

> **Tela preta com logo Render?** Isso é o próprio Render acordando — aparece **antes** do FrotaTMS. Aguarde ~1 min e recarregue. Com os pings acima, deve ser raro.
>
> Se passar de **2 minutos**, não é cold start normal:
> 1. Recarregue a página.
> 2. No [status da Render](https://status.render.com/) veja se o plano Free está degradado (em incidente o spin-up Free pode ser desligado).
> 3. Painel Render → serviço `frota-tms` → **Manual Deploy**.
> 4. Confira o Postgres Free: ele **expira em 30 dias**. Sem custo: crie um banco Free **novo** e restaure o backup ([guia](./BACKUP-E-MIGRATIONS.md#banco-free-da-render-expirou-sem-custo)). Não clique em Upgrade.

`/api/health` é **liveness** (HTTP 200 quando o processo escuta, mesmo com banco acordando).  
`/api/ready` exige o Postgres (`db: up`).

URL customizada (opcional): variáveis `FROTA_TMS_HEALTH_URL` e `FROTA_TMS_BASE_URL` no repositório.

---

## 2. UptimeRobot (opcional — alertas por e-mail)

Complementa o keep-alive com **notificação** se o site cair.

1. Conta em [uptimerobot.com](https://uptimerobot.com)
2. **Add New Monitor** → HTTP(s) → `https://frota-tms.onrender.com/api/health` (site no ar). Para exigir banco, use `/api/ready`.
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
