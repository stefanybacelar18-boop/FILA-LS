# Backup e migrations — FrotaTMS

## Migrations em produção (`prisma migrate deploy`)

O deploy no Render e no Docker usa `scripts/apply-database-schema.sh`:

| Banco | Comando |
|-------|---------|
| **PostgreSQL** (produção) | `prisma migrate deploy` |
| **SQLite** (dev local) | `prisma db push` |

### Banco legado (criado com `db push`)

Se o Postgres de produção já existia antes desta mudança, o script detecta automaticamente e faz **baseline** (marca migrations antigas como aplicadas), sem apagar dados.

### Rodar manualmente

```bash
cd frota-tms
DATABASE_URL="postgresql://..." npm run db:apply
```

---

## Backup automático (GitHub Actions)

Workflow: `.github/workflows/frota-tms-backup.yml`

- Roda **todo dia às 06:00 UTC** (03:00 Bahia)
- Também pode ser disparado manualmente em **Actions → FrotaTMS DB Backup → Run workflow**

### Configuração (uma vez)

1. No Render → banco `frota-tms-db` → copie a **External Database URL**
2. No GitHub → repositório → **Settings → Secrets and variables → Actions**
3. Crie o secret: `FROTA_TMS_DATABASE_URL` = URL do Postgres
4. Após o próximo cron (ou run manual), baixe o artefato em **Actions**

Os backups ficam como artefatos por **30 dias**.

### Backup manual

```bash
cd frota-tms
DATABASE_URL="postgresql://..." ./scripts/backup.sh
```

Arquivo gerado em `frota-tms/backups/frota-tms-YYYYMMDD-HHMMSS.sql.gz`  
(mantém os 14 mais recentes localmente)

### Restaurar

```bash
FORCE_RESTORE=true DATABASE_URL="postgresql://..." ./scripts/restore.sh backups/frota-tms-XXXX.sql.gz
```

Ou no GitHub: **Actions → FrotaTMS Restore DB → Run workflow** (usa o secret `FROTA_TMS_DATABASE_URL`).

> **Cuidado:** restaurar sobrescreve dados atuais. Faça só em ambiente de teste ou com confirmação explícita.

---

## Banco Free da Render expirou (sem custo)

O Postgres Free **acaba em 30 dias**. Dá para voltar sem pagar, com um banco Free **novo** + o backup do GitHub.

1. Baixe o dump: [Actions → FrotaTMS DB Backup](https://github.com/stefanybacelar18-boop/FILA-LS/actions/workflows/frota-tms-backup.yml) → último sucesso → **Artifacts**.
2. Render → **New → PostgreSQL** → plano **Free** → mesma região do web `frota-tms` → Create.  
   Se a Render bloquear (“já existe 1 Free”), **não apague** o antigo até o dump estar no seu computador. Depois Delete no banco *Expired/Suspended* e crie o Free novo.
3. Copie a **External Database URL** do banco novo.
4. GitHub → Settings → Secrets → `FROTA_TMS_DATABASE_URL` = essa External URL.
5. **Actions → FrotaTMS Restore DB → Run workflow**.
6. No serviço web `frota-tms` → Environment → `DATABASE_URL` = **Internal Database URL** do banco novo.
7. **Manual Deploy** no web. Abra `https://frota-tms.onrender.com`.

Anote no calendário: daqui a **28 dias** repetir (backup → banco Free novo → restore). Sem isso o site cai de novo.

---

## Render snapshots (alternativa)

No plano pago do Render, o Postgres tem snapshots automáticos no painel. O GitHub Actions é a opção **gratuita** para cópia externa.
