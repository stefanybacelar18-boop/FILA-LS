# Etapa 1.B — Persistência Operacional em PostgreSQL  
## Planejamento técnico (somente planejamento — sem implementação)

**Referência 1.A aprovada:** commit `8ce23b1` (branch `cursor/cortely-fase1a-auth-7332`, PR #170).  
**Escopo deste documento:** diagnóstico, arquitetura, migração, etapas, testes, riscos e critérios de aprovação.  
**Fora de escopo agora:** código funcional, migrations aplicadas, produção, merge #170, WhatsApp, FilaDock.

---

## 1. Diagnóstico da persistência atual

### Veredito

| Camada | Fonte atual (demo) | Fonte atual (prod / não-demo) | Meta 1.B |
|---|---|---|---|
| Agenda / CRM / catálogo / loyalty / reminders / settings / staff profiles | JSON `demo` (`demoStore`) | **PostgreSQL** via Supabase service role | Manter Postgres; alinhar IDs com ops |
| Ops PDV (caixa, vendas, estoque, financeiro, comissões, pacotes, marketing, etc.) | JSON `ops` (`opsStore`) | **ainda JSON `ops`** | Postgres oficial |
| Auth staff | HMAC + demo staff | Supabase Auth + `profiles` + `session_generation` (1.A) | Intacta |
| OTP / client proof / revoke | memória (± SQL) | memória + SQL | Endurecer; sem JSON |

**Risco crítico já observado:** `ops-store.ts` **não** consulta `isDemoMode()` nem Supabase. Em ambiente “produção” com Auth Supabase, a UI ops continua gravando em `cortely-store.json` (ou `/tmp` / memória). Há **fonte única real para ops = JSON**, enquanto as tabelas SQL ops (com RLS 1.A) existem no repo mas **não são usadas pelo app**.

### Arquivo de persistência

- Implementação: `src/lib/persist.ts`
- Arquivo: `cortely-store.json` em `CORTELY_DATA_DIR` → `TMPDIR` → `/tmp/cortely-data` → `.data/`
- Shape: `{ demo?, ops?, updated_at? }`
- Fallback: memória do processo se disco não gravável (serverless)

### Tenant ops

- `opsStore` usa `SHOP_ID` fixo `11111111-1111-4111-8111-111111111111`
- `api/ops` e `api/export` restringem a essa loja
- **Não** multi-tenant real no PDV hoje

---

## 2. Inventário de arquivos e funcionalidades

### 2.1 Stores JSON / memória

| Store | Arquivo | Persistência | Entidades |
|---|---|---|---|
| `demoStore` | `src/lib/demo-store.ts` | JSON chave `demo` | shop, barbers, services, workingHours, appointments, clients, scheduleBlocks, loyalty, reminders, staff |
| `opsStore` | `src/lib/ops-store.ts` + `types-ops.ts` | JSON chave `ops` | products, suppliers, stockMovements, purchaseOrders, inventoryCounts, cashSessions, cashMovements, sales, saleItems, salePayments, commissionRules/Entries, staffAdvances, goals, packages, clientPackages, subscriptionPlans/clientSubscriptions, waitlist, payables, receivables, campaigns, coupons, reviews, deposits, units, auditLog, fiscalDocuments |
| Persistência disco | `src/lib/persist.ts` | arquivo único | une demo+ops |
| OTP | `api/client-otp/route.ts` | memória (+ SQL prod) | challenges |
| Client JTI | `src/lib/auth.ts` | memória (+ SQL prod) | proof JTIs |
| Session revoke | `src/lib/session-revoke.ts` | memória (+ SQL prod) | revogações / audit |
| Rate limit | `src/lib/rate-limit.ts` | só memória | buckets |
| Payment intents | `src/lib/payments.ts` | efêmero | gateway |

### 2.2 Rotas que leem/gravam ops JSON

| Rota | Uso |
|---|---|
| `api/ops/route.ts` | CRUD quase total do PDV |
| `api/export/route.ts` | CSV sales/products/commissions |
| `api/appointments/route.ts` | ao `completed`: pacote ou `createSale` + caixa |
| `api/payments/route.ts` | `createDeposit` se pago |
| `api/client-lookup/route.ts` | leitura pacotes/assinaturas |

### 2.3 Já em PostgreSQL (app usa)

`barbershops`, `profiles`, `barbers`, `services`, `working_hours`, `appointments`, `clients`, `schedule_blocks`, `loyalty_accounts`, `loyalty_events`, `reminders`, `staff_session_revocations`, `permission_audit_log`, `client_otp_challenges`, `client_proof_jtis`, Auth `auth.users`, RPC `provision_owner_barbershop`.

Facade: `src/lib/data.ts` (demo ↔ Supabase).

### 2.4 SQL existe (RLS 1.A), app **não** usa

`products`, `suppliers`, `cash_sessions`, `cash_movements`, `sales`, `sale_items`, `sale_payments`, `stock_movements`, `inventory_counts`, `service_packages`, `waitlist`, `payables`, `receivables`, `campaigns`, `reviews`, `ops_audit_log`, `fiscal_documents`.

### 2.5 Domínio no app **sem** tabela SQL adequada

| Domínio JSON | Gap |
|---|---|
| commission_rules / commission_entries | criar |
| staff_advances | criar |
| goals | criar |
| client_packages | criar |
| subscription_plans / client_subscriptions | criar |
| coupons | criar |
| deposits | criar |
| purchase_orders (+ items) | criar |
| units (multi-unidade) | criar ou adiar |
| sale tip / cancel metadata ricos | alinhar colunas |
| cash counted_by_method | alinhar colunas |

### 2.6 Dependências entre módulos (grafo crítico)

```
appointment.completed
  ├─ consumePackageCredit (ops)
  └─ openCash? → createSale
        ├─ sale_items
        ├─ adjustStock → stock_movements
        ├─ sale_payments ↔ cash_session
        ├─ commission_entries
        └─ audit

createSale + cupom → coupons.used_count
sellPackage → client_packages + sale(kind=package)
receivePurchaseOrder → stock + payable
payCommissions → entries paid + advances
inventoryCount → stock delta
payments.createDeposit ← appointment_id
reports ← sales + payments + payables + receivables + cogs + cash
```

Agenda/CRM e ops compartilham IDs de seed, mas **dois stores** no mesmo JSON.

---

## 3. Arquitetura PostgreSQL proposta

### Princípios

1. **PostgreSQL (Supabase) = fonte oficial** de todos os dados operacionais e de agenda.
2. **Tenant** = `barbershop_id` derivado **somente** da sessão (`getLiveSession` → `profiles` / `user_barbershop_id()`). Nunca confiar em `barbershop_id` do body do cliente.
3. **RLS** (já ENABLE+FORCE nas ops 1.A) + **autorização RBAC no backend** (já em rotas).
4. **Service role** só no servidor, com filtros explícitos `eq('barbershop_id', session.barbershop_id)` além do RLS (defesa em profundidade).
5. **Transações** para: venda+estoque+pagamento+comissão; abertura/fechamento de caixa; recebimento de OC; estorno/cancelamento; pagamento de comissões.
6. **Integridade:** FKs compostas ou CHECK via trigger; `sale_items`/`sale_payments` com `barbershop_id` denormalizado **ou** FK `(sale_id)` + trigger que valida tenant (preferência 1.B: **denormalizar `barbershop_id`** + índice + policy direta, mantendo JOIN como rede de segurança).
7. **Idempotência:** chave `idempotency_key` (header ou body) em vendas, pagamentos, depósitos, fechamento de caixa; tabela `ops_idempotency_keys` ou unique parcial.
8. **Concorrência:** optimistic locking (`version` / `updated_at`) em estoque e caixa aberto; unique parcial “uma cash_session open por loja”; unique appointment slot (já parcialmente coberto).
9. **Auditoria:** gravar `ops_audit_log` em toda mutação financeira/estoque (hoje só array JSON).
10. **Erros:** falha parcial → rollback da transação; compensação só quando gateway externo (pagamentos) exigir outbox.

### Camadas

```
Browser → API Next.js (session + RBAC + tenant bind)
       → Postgres via service role / ou user JWT+RLS
       → (opcional) outbox para WhatsApp/fiscal (fora desta etapa)
```

JSON (`cortely-store.json`) torna-se **artefato de migração / demo local opcional**, não fonte de verdade em produção.

### Isolamento

- Continuação da 1.A: `user_barbershop_id()` + FORCE RLS.
- App: `requirePermission` + `session.barbershop_id` em todo write.
- Testes: suite SQL A×B (já existente) + extensão a novas tabelas + testes E2E 3 tenants.

---

## 4. Modelo de dados e relacionamentos

### Núcleo já existente (manter / enriquecer)

```
barbershops 1──* profiles | barbers | services | clients | appointments | …
products 1──* stock_movements | inventory_counts
suppliers 1──* purchase_orders (nova)
sales 1──* sale_items | sale_payments
sales *──1 cash_sessions
sales *──* commission_entries (nova)
```

### Novas tabelas planejadas (migrations futuras — **não criar agora**)

| Tabela | Propósito |
|---|---|
| `purchase_orders` / `purchase_order_items` | OC + recebimento |
| `commission_rules` | % por barbeiro/serviço |
| `commission_entries` | lançamentos por venda |
| `staff_advances` | vales |
| `goals` | metas |
| `client_packages` | créditos vendidos |
| `subscription_plans` / `client_subscriptions` | assinaturas |
| `coupons` | cupons |
| `deposits` | sinal / depósito de agendamento |
| `units` (opcional / adiar) | multi-unidade |
| `ops_idempotency_keys` | idempotência |

### Ajustes em tabelas existentes

- `sale_items`, `sale_payments`: adicionar `barbershop_id NOT NULL` + backfill + policy direta.
- `sales`: tip, cancel_reason, canceled_at, refunded_at, coupon_id, kind.
- `cash_sessions`: counted_by_method (JSONB), expected_amount.
- `products`: barcode, brand, max_stock (já parcialmente em 20260329).
- `service_packages`: alinhar ao modelo JSON de pacotes.

### Relacionamentos financeiros (integridade)

- `sale_payments.amount` soma ≈ `sales.total` (constraint/trigger ou validação transacional).
- Estoque: `products.stock_qty` atualizado **na mesma transação** que `stock_movements`.
- Comissão: gerada na venda; estorno cancela/ajusta entries na mesma TX.
- Caixa: venda `paid` exige `cash_session_id` open da mesma loja (exceto fluxos explícitos).

---

## 5. Migrations planejadas (repo only — **não aplicar remotamente nesta autorização**)

Ordem sugerida (arquivos futuros, pós-aprovação):

1. `…_fase1b_01_sale_tenant_columns.sql` — `barbershop_id` em items/payments + backfill + policies.
2. `…_fase1b_02_sales_cash_enrichment.sql` — colunas tip/cancel/counted_by_method.
3. `…_fase1b_03_commissions.sql` — rules, entries, advances, goals + RLS.
4. `…_fase1b_04_packages_subscriptions.sql` — client_packages, plans, subscriptions + RLS.
5. `…_fase1b_05_purchase_orders.sql` — OC + items + RLS.
6. `…_fase1b_06_coupons_deposits.sql` — coupons, deposits + RLS.
7. `…_fase1b_07_idempotency_audit.sql` — idempotency keys + grants audit.
8. `…_fase1b_08_constraints_concurrency.sql` — unique cash open, stock checks, FKs.

Cada migration: ENABLE+FORCE RLS, `REVOKE` anon, grants mínimos, `search_path` seguro em funções, verificação explícita (padrão 1.A).

---

## 6. Sequência de implementação (subetapas)

Prioridade: **reduzir risco financeiro** e permitir validação por módulo. JSON permanece legível até cutover; writes passam a Postgres por feature flag `CORTELY_OPS_PG=1`.

| Subetapa | Escopo | Dependências | Critério de conclusão |
|---|---|---|---|
| **1.B.0** | Feature flag + adapter `OpsRepository` (interface) por cima de `opsStore` | 1.A | Interface coberta por testes; zero mudança de UX |
| **1.B.1** | Products + stock_movements + inventory_counts | 1.B.0 + mig enrich | CRUD estoque no PG; isolamento 3 lojas; persistência pós-logout |
| **1.B.2** | Cash sessions + cash_movements | 1.B.1 | Uma sessão open/loja; sangria/suprimento; close atômico |
| **1.B.3** | Sales + items + payments (**TX**) | 1.B.1–2 | Venda cria itens/pagamentos/estoque/auditoria em 1 TX; estorno/cancel rollback consistente |
| **1.B.4** | Comissões + advances + pay-out | 1.B.3 | Entries ligados à venda; payCommissions idempotente |
| **1.B.5** | Packages / client_packages / consumo no `appointment.completed` | 1.B.3 | Completed agenda não escreve mais JSON ops |
| **1.B.6** | Suppliers + purchase_orders + payables link | 1.B.1 | Recebimento OC atualiza estoque+payable em TX |
| **1.B.7** | Receivables, coupons, deposits, campaigns, waitlist, reviews, fiscal draft | 1.B.3 | Paridade API ops; export CSV do PG |
| **1.B.8** | Migração dados JSON→PG + cutover + desligar writes JSON em prod | todas | Reconciliação OK; flag default PG; JSON read-only backup |
| **1.B.9** | Hardening: units (se necessário), outbox futuro, remoção demo ops hardcode | 1.B.8 | SHOP_ID fixo removido; multi-tenant ops real |

**Não iniciar WhatsApp** nesta etapa.

### Feature flag / consistência dual-run

Durante 1.B.1–1.B.7:

- **Write:** Postgres (oficial) + opcional shadow write JSON (auditoria).
- **Read:** Postgres.
- Proibido: dual-write divergente sem reconciliação diária job.

---

## 7. Plano de migração dos dados JSON → PostgreSQL

### 7.1 Backup e snapshot

1. Copiar `cortely-store.json` (e `CORTELY_DATA_DIR`) para artefato versionado `backup/ops-YYYYMMDDThhmmss.json` + checksum SHA-256.
2. Snapshot DB (Supabase PITR / `pg_dump` schema public) **antes** de import.
3. Registrar `migration_batch_id`.

### 7.2 Extração e transformação

- Parser tipado a partir de `OpsSnapshot` (`types-ops.ts`).
- Mapear `SHOP_ID` demo → `barbershops.id` real (tabela de mapeamento explícita se multi-loja futura).
- Normalizar datas, decimais, UUIDs inválidos → rejeitar com relatório.
- Separar lotes: master data (products, suppliers) → documents (sales…) → movements.

### 7.3 Validação e deduplicação

- Unique natural keys onde possível (sku+shop, sale id).
- Rejeitar sales sem items ou com total inconsistente (quarentena + relatório).
- Dedup por `id` UUID do JSON.

### 7.4 Importação transacional

- Um batch = uma transação por loja **ou** savepoints por venda.
- Ordem: products → suppliers → packages → cash_sessions → sales → items → payments → stock_movements → commissions → payables/receivables → resto.
- Recalcular `products.stock_qty` a partir da sequência de movements **ou** importar qty final + movement de abertura “migration_opening”.

### 7.5 Reconciliação

| Métrica | JSON | PG | Tolerância |
|---|---|---|---|
| #sales / Σ total | | | 0 |
| #payments / Σ amount | | | 0 |
| stock_qty por produto | | | 0 |
| commission open/paid | | | 0 |
| cash open sessions | | | 0 |

Job `scripts/reconcile-ops-migration.ts` (a criar na implementação).

### 7.6 Rollback

- Manter JSON imutável pós-snapshot.
- Feature flag volta reads/writes para JSON.
- `DELETE`/`TRUNCATE` por `migration_batch_id` ou restore `pg_dump`.

### 7.7 Cutover

1. Freeze writes ops (manutenção curta) **ou** dual-write com drain.
2. Import final delta.
3. Reconcile.
4. `CORTELY_OPS_PG=1` default.
5. Monitor 48h; JSON vira backup only.

### 7.8 Prevenção perda/duplicação

- Idempotency do import (`ON CONFLICT (id)`).
- Batch id em coluna `imported_from_batch`.
- Proibir segundo import sem `--force` + novo batch.

---

## 8. Estratégia de testes

| Classe | O quê | Como |
|---|---|---|
| Persistência sessão | Logout/login mantém vendas/estoque/caixa | E2E + query PG |
| Isolamento 3 barbearias | A/B/C sem vazamento CRUD | Estender `security-fase1a-rls-sql` + testes API |
| Concorrência agenda | Dois booked mesmo slot | API + unique/constraint |
| Concorrência venda/estoque | Duas vendas último item | TX + stock check; um 409 |
| Integridade pagamentos | Σ payments = total; refund | Suite unit + SQL |
| Estoque | createSale / refund / OC / inventory | Assert movements + qty |
| Cancel/estorno | sale+stock+commission revertidos | TX tests |
| Falha parcial | falha no meio da TX | Nada commitado |
| Idempotência | mesmo key 2× → 1 venda | API header |
| Regressão | phase0 + fase1a + build + smoke admin/ops | CI |
| Migração | reconcile script em fixture JSON | CI fixture |

Ambiente: Postgres service (padrão CI 1.A) + seeds 3 tenants.

---

## 9. Riscos técnicos e medidas preventivas

| Risco | Impacto | Mitigação |
|---|---|---|
| Ops JSON em “prod” hoje | Perda de dados /tmp | Priorizar 1.B.3 cutover; alertar se `!DEMO && ops JSON` |
| Venda sem TX (estoque ≠ pagamento) | Dinheiro/estoque errados | Obrigar TX na 1.B.3 |
| `appointment.completed` acoplado ao ops JSON | Inconsistência agenda×PDV | 1.B.5 cedo após vendas |
| SHOP_ID hardcode | Bloqueia SaaS | Remover na 1.B.9; tenant da sessão desde 1.B.0 |
| Dual-write divergente | Fantasmas | Flag única de read; shadow opcional só append |
| Comissões sem SQL | Lacuna modelo | 1.B.4 dedicado |
| Gateway pagamento externo | $$ cobrado / sale falhou | Outbox + reconcile (mínimo: não marcar paid sem confirmação) |
| Race caixa open | 2 caixas | Unique parcial |
| Race stock | Negativo | `UPDATE … WHERE stock_qty >= n` |
| Migrations remotas acidentais | Fora da autorização | Processo humano; CI não aplica |
| Escopo WhatsApp | Distração | Explicitamente fora |

---

## 10. Critérios de aprovação por subetapa

Cada subetapa só é “aprovada” se:

1. Typecheck + build + suites security existentes verdes.
2. Testes novos da subetapa verdes (incluindo isolamento multi-loja).
3. Nenhuma rota da subetapa aceita `barbershop_id` do cliente para escopo.
4. Writes da subetapa vão ao Postgres quando flag ligada.
5. Documentação da subetapa atualizada (tabelas, flags, reconcile).
6. **Sem** apply remoto sem autorização explícita posterior.
7. Revisão humana do risco financeiro (obrigatória em 1.B.2, 1.B.3, 1.B.4, 1.B.8).

### Critério de conclusão da Etapa 1.B (global)

- Postgres é fonte oficial de **todas** as entidades listadas em `OpsSnapshot` (exceto `units` se adiado com ADR).
- JSON ops não é escrito em produção.
- Isolamento ≥ 3 barbearias comprovado (SQL + API).
- Migração de dados com reconcile 0 diff (ou diffs justificados).
- CI cobre persistência ops + RLS.
- 1.A auth/RLS permanece intacta.

---

## Apêndice A — Mapa de paths-chave

| Path | Papel |
|---|---|
| `src/lib/persist.ts` | disco JSON |
| `src/lib/demo-store.ts` | CRM demo |
| `src/lib/ops-store.ts` | PDV JSON (alvo principal 1.B) |
| `src/lib/types-ops.ts` | contrato snapshot |
| `src/lib/data.ts` | facade agenda/CRM |
| `src/app/api/ops/route.ts` | API PDV |
| `src/app/api/appointments/route.ts` | acoplamento completed→venda |
| `supabase/migrations/20260327_p1_p2_*` … `20261111_06_*` | schema + RLS 1.A |
| `docs/fase1a-rls-inventory.md` | inventário RLS |
| `docs/fase1a-schema-privileges.md` | privilégios schema |

## Apêndice B — O que esta autorização **não** faz

- Não implementa adapters/código.
- Não cria nem aplica migrations.
- Não altera produção / Supabase remoto.
- Não remove JSON.
- Não faz merge do PR #170.
- Não publica.
- Não inicia WhatsApp nem altera FilaDock.

---

**Próximo passo:** aprovação formal humana deste plano. Somente após autorização explícita iniciar a subetapa **1.B.0** (adapter + flag).
