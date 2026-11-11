# Etapa 1.B — Persistência Operacional em PostgreSQL  
## Planejamento técnico consolidado (somente planejamento — sem implementação)

**Referência 1.A aprovada:** commit `8ce23b1` (branch `cursor/cortely-fase1a-auth-7332`, PR #170).  
**Documento de planejamento:** PR #171 (`cursor/cortely-fase1b-plan-7332`).  
**Status:** consolidação arquitetural pós-revisão humana — **implementação ainda NÃO autorizada**.

**Fora de escopo até autorização explícita:** código funcional, adapters, testes funcionais, criação/aplicação de migrations, Supabase remoto, remoção de JSON, merge, publish, deploy, início de 1.B.0.

---

## 0. Decisões arquiteturais consolidadas (obrigatórias)

| # | Decisão |
|---|---|
| D1 | **Após cutover de um domínio (ou conjunto), PostgreSQL é a fonte oficial.** Não há retorno automático PG→JSON. Rollback de aplicação **preserva** todos os dados já gravados no PG. Retorno excepcional a JSON exige exportação do delta + reconciliação + validação integral; **proibido** `TRUNCATE`/delete destrutivo do batch pós-cutover. |
| D2 | **Registry por domínio:** uma única fonte oficial de **leitura e escrita** por domínio. Dual-write operacional **proibido**. Shadow logging apenas auditoria (não é segunda fonte). **Bridges JSON↔PG em fluxos financeiros: proibidas.** |
| D3 | **Operações cruzadas** (venda ↔ estoque ↔ caixa ↔ pagamentos ↔ comissões; OC ↔ stock ↔ payables) só fazem **cutover de fonte oficial** quando **todas** as dependências do fluxo flippam **juntas** para `pg`. Proibida execução financeira partida JSON+PG. |
| D3a | **Prep ≠ cutover.** Subetapas podem preparar schema, backfill, adapters e testes em PG **sem** alterar a fonte oficial em produção. Enquanto `sales=json` em produção, `products`, `stock` e `cash` **permanecem** `registry=json` em produção. |
| D3b | **Fail-fast de registry:** configuração incompatível com o grafo transacional (ex.: `sales=json` + `stock=pg`) **impede boot/execução** do fluxo — não executa parcialmente. |
| D4 | Estados explícitos de venda/pagamento; pendente **nunca** conta como pago; descontos, gorjetas, troco, cancelamentos e estornos modelados. |
| D5 | Multi-tenant: sequência segura backfill → UNIQUE → FK composta → índices → RLS; preservar controles 1.A (FORCE RLS, helpers, grants). |
| D6 | Comissão já **paga**: política **bloquear estorno da venda** até clawback/estorno de payout (ou clawback automático em TX dedicada) — ver §4.5. |
| D7 | Gateway: tabela `payment_intents`, webhook autenticado, idempotência, reconcile; **obrigatório antes do cutover financeiro** (ver §6 / 1.B.3–G). |
| D8 | **Tenant da sessão** em todo código novo desde **1.B.0**. `SHOP_ID` fixo só em legado JSON + ETL até remoção em 1.B.9. |
| D9 | **`units` adiadas** — ADR formal (§11); não bloqueia conclusão de 1.B.8. |
| D10 | DDL de comissões com constraints anti-duplicidade (incl. NULLS); backfill de `barbershop_id` **antes** de NOT NULL / FKs compostas. |

---

## 1. Diagnóstico da persistência atual

### Veredito

| Camada | Fonte atual (demo) | Fonte atual (prod / não-demo) | Meta 1.B |
|---|---|---|---|
| Agenda / CRM / catálogo / loyalty / reminders / settings / staff profiles | JSON `demo` (`demoStore`) | **PostgreSQL** via Supabase service role | Manter Postgres; alinhar IDs com ops |
| Ops PDV (caixa, vendas, estoque, financeiro, comissões, pacotes, marketing, etc.) | JSON `ops` (`opsStore`) | **ainda JSON `ops`** | Postgres oficial por **conjuntos de cutover** (registry) |
| Auth staff | HMAC + demo staff | Supabase Auth + `profiles` + `session_generation` (1.A) | Intacta |
| OTP / client proof / revoke | memória (± SQL) | memória + SQL | Endurecer; sem JSON |

**Risco crítico:** `ops-store.ts` não consulta `isDemoMode()` nem Supabase. Em “produção” com Auth, a UI ops grava `cortely-store.json` (ou `/tmp`/memória). Tabelas SQL ops + RLS 1.A existem no repo e **não são usadas** pelo app. `SHOP_ID` fixo — PDV sem multi-tenant real hoje.

**Acoplamento atual (relevante a D3):** `createSale` no JSON lê `currentCash()`, grava `cash_session_id`, items/payments, chama `adjustStock` para produtos e `accrueCommission`. `refundSale` devolve estoque. `appointment.completed` pode `openCash` + `createSale`. `receivePurchaseOrder` move estoque e cria payable. Esses grafos **não** admitem fonte oficial mista.

### Arquivo de persistência

- `src/lib/persist.ts` → `cortely-store.json` (`CORTELY_DATA_DIR` → `TMPDIR` → `/tmp/cortely-data` → `.data/`)
- Shape: `{ demo?, ops?, updated_at? }`; fallback memória se disco não gravável

---

## 2. Inventário de arquivos e funcionalidades

### 2.1 Stores JSON / memória

| Store | Arquivo | Persistência | Entidades |
|---|---|---|---|
| `demoStore` | `src/lib/demo-store.ts` | JSON chave `demo` | shop, barbers, services, workingHours, appointments, clients, scheduleBlocks, loyalty, reminders, staff |
| `opsStore` | `src/lib/ops-store.ts` + `types-ops.ts` | JSON chave `ops` | products, suppliers, stockMovements, purchaseOrders, inventoryCounts, cashSessions, cashMovements, sales, saleItems, salePayments, commissionRules/Entries, staffAdvances, goals, packages, clientPackages, subscriptionPlans/clientSubscriptions, waitlist, payables, receivables, campaigns, coupons, reviews, deposits, units, auditLog, fiscalDocuments |
| Disco | `src/lib/persist.ts` | arquivo único | une demo+ops |
| OTP / JTI / revoke / rate-limit / payment intents efêmeros | rotas/libs indicadas | memória (± SQL) | — |

### 2.2 Call sites `opsStore` (validados por busca em `cortely/src`)

| Rota / módulo | Uso |
|---|---|
| `api/ops/route.ts` | CRUD quase total do PDV |
| `api/export/route.ts` | CSV |
| `api/appointments/route.ts` | `completed` → pacote ou `createSale` + caixa |
| `api/payments/route.ts` | `createDeposit` se intent sync `paid` |
| `api/client-lookup/route.ts` | leitura pacotes/assinaturas |
| `ops-store.ts` (Proxy) | `persistOps` a cada mutação |

Não há outros imports de `opsStore` no app. UI admin acessa via HTTP. Tip/troco/cancel dedicado **não** existem no JSON atual (`refundSale` sim; `cancelSale` não).

### 2.3 Já em PostgreSQL (app usa)

`barbershops`, `profiles`, `barbers`, `services`, `working_hours`, `appointments`, `clients`, `schedule_blocks`, `loyalty_*`, `reminders`, `staff_session_revocations`, `permission_audit_log`, `client_otp_challenges`, `client_proof_jtis`, `auth.users`, RPC `provision_owner_barbershop`. Facade: `data.ts`.

### 2.4 SQL existe (RLS 1.A), app não usa

`products`, `suppliers`, `cash_sessions`, `cash_movements`, `sales`, `sale_items`, `sale_payments`, `stock_movements`, `inventory_counts`, `service_packages`, `waitlist`, `payables`, `receivables`, `campaigns`, `reviews`, `ops_audit_log`, `fiscal_documents`.

### 2.5 Domínio sem tabela adequada

commission_rules/entries, staff_advances, goals, client_packages, subscription_plans/client_subscriptions, coupons, deposits, purchase_orders(+items), payment_intents, ops_idempotency_keys, ops_shop_id_map; **units adiadas (ADR)**.

### 2.6 Grafos transacionais (conjuntos de cutover — D3)

**Grafo Venda (cutover conjunto obrigatório):**
```
createSale / refundSale / appointment.completed(venda)
  → sales + sale_items + sale_payments
  → stock (adjustStock) + products.qty
  → cash_session_id / openCash
  → commission_entries (accrual)
  → ops_audit_log (+ cupom se houver)
```
Registry em produção: `sales`, `products`, `stock`, `cash` (+ accrual de commissions na TX) flippam **juntos** → `pg`.

**Grafo OC (cutover conjunto obrigatório):**
```
receivePurchaseOrder → purchasing (OC) + stock + payables
```
Registry: `purchasing`, `stock`, `payables` flippam **juntos** (ver 1.B.6). *Nota:* após o grafo Venda já ter colocado `stock=pg`, o cutover OC exige que `purchasing`+`payables` entrem em `pg` no mesmo flip (stock já estará `pg`).

**Grafo Pacote:** `sellPackageToClient` → packages + `createSale` (mesmo conjunto da Venda + packages).

Qualquer fluxo **só** executa quando todos os domínios do seu grafo têm a **mesma** fonte oficial; senão **fail-fast** (D3b).

---

## 3. Arquitetura PostgreSQL proposta

### 3.1 Princípios

1. PostgreSQL (Supabase) = fonte oficial após **cutover** do domínio ou conjunto (D1).  
2. `barbershop_id` **somente** da sessão em código novo desde 1.B.0 (D8).  
3. RLS 1.A (ENABLE+FORCE) + RBAC backend; service role com filtro explícito de tenant.  
4. Transações obrigatórias nos grafos D3.  
5. Denormalizar `barbershop_id` em `sale_items`/`sale_payments` + FK composta (D5).  
6. Idempotência: `ops_idempotency_keys` e/ou unique parcial.  
7. Concorrência: `FOR UPDATE`, unique cash open, `UPDATE stock WHERE qty >= n`.  
8. Auditoria em `ops_audit_log`.  
9. Falha parcial → rollback TX; gateway → intents + webhook + reconcile (D7).  
10. **Prep sem mudar fonte oficial** (D3a): migrations/adapters/testes podem existir enquanto produção continua `json`.

### 3.2 Registry por domínio (D2) + prep vs cutover (D3a)

Configuração (ex.: env JSON ou mapa versionado):

```
products, stock, cash, sales, commissions, packages, purchasing,
payables, receivables, coupons, deposits, campaigns, waitlist,
reviews, fiscal, payment_intents  →  "json" | "pg"
```

Regras:
- **Read e write do mesmo domínio = mesma fonte.**  
- Dual-write operacional **proibido**. Bridges JSON↔PG em fluxos financeiros **proibidas**.  
- Shadow log opcional **não** é lido pela aplicação.  
- Adapter `OpsRepository` consulta o registry.  
- **Preparação (1.B.1, 1.B.2, partes de 1.B.3):** schema, backfill, código adapter e testes contra PG em CI/staging; em **produção** o registry dos domínios do grafo Venda permanece `json` até o cutover 1.B.3.  
- **Cutover:** flip atômico do **conjunto** exigido por D3 (não domínio a domínio isolado quando há grafo).

#### Fail-fast (D3b) — grafos ilegais (exemplos)

| Configuração | Resultado |
|---|---|
| `sales=json` + (`stock=pg` \| `cash=pg` \| `products=pg`) | **Rejeitada** — não boot / não executa createSale |
| `sales=pg` + (`stock=json` \| `cash=json`) | **Rejeitada** |
| `purchasing=pg` + `payables=json` (ou stock≠purchasing) no receive OC | **Rejeitada** |
| Conjunto Venda todo `json` ou todo `pg` | OK |
| Conjunto OC coerente | OK |

### 3.3 Rollback (D1)

| Situação | Ação permitida |
|---|---|
| Bug de UI/read | Corrigir app; dados PG permanecem |
| Necessidade excepcional de servir JSON | 1) Export delta PG (`written_at > cutover_at`) 2) Merge no snapshot JSON 3) Reconcile 4) Validação integral 5) Só então reads legados — **sem** apagar batch PG |
| “Desfazer import” | Só batches **sem** delta pós-cutover; senão restore + preserve delta |

### 3.4 Isolamento / camadas

```
Browser → API Next.js (session + RBAC + tenant bind)
       → OpsRepository(registry + fail-fast graphs)
       → Postgres | JSON legado (uma fonte por domínio)
       → payment_intents + webhook (PG)
```

---

## 4. Modelo de dados e relacionamentos

### 4.1 Núcleo

```
barbershops 1──* profiles | barbers | services | clients | appointments | …
products 1──* stock_movements | inventory_counts
suppliers 1──* purchase_orders
sales 1──* sale_items | sale_payments | commission_entries
sales *──1 cash_sessions (open)
payment_intents *──? sales | appointments | deposits
```

### 4.2 Estados de venda e pagamento (D4)

**`sales.status`:**
- `draft` — opcional/interno (se usado)
- `pending_payment` — aguarda confirmação (intent); **não** baixa estoque definitivo / **não** comissiona como paid
- `paid` — total liquidado e confirmado
- `canceled` — cancelada antes de paid (sem estorno de stock se nunca paid)
- `refunded` — estornada após paid

**`sale_payments` / intents:**
- Pagamento na venda `paid`: linhas cuja soma = `total` (após desconto/gorjeta/troco)
- Intent: `pending` | `paid` | `failed` | `canceled` — **`pending` nunca implica receita/sale paid**

**Desconto:** `sales.discount` (+ cupom); `total = max(0, subtotal - discount + tip)`.  
**Gorjeta (`tip`):** coluna em `sales`; fora da base de comissão por padrão.  
**Troco:** `change_due` auditado; Σ payments líquidos = total.  
**Sinal/parcial:** `deposits` / intent — **não** marcar sale `paid`.  
**Estorno:** TX: sale→`refunded`, stock devolve, comissões conforme D6, audit.

### 4.3 Sequência multi-tenant `sale_items` / `sale_payments` (D5)

Ordem **obrigatória** (preserva 1.A):

1. `ADD COLUMN barbershop_id UUID NULL`.  
2. **Backfill** a partir de `sales`; quarentenar órfãos.  
3. Verificar zero NULL.  
4. `SET NOT NULL`.  
5. `UNIQUE (id, barbershop_id)` em `sales`.  
6. `FOREIGN KEY (sale_id, barbershop_id) REFERENCES sales (id, barbershop_id)`.  
7. Índices `(barbershop_id)`, `(barbershop_id, sale_id)`.  
8. Policies tenant + EXISTS sale mesmo shop; ENABLE+FORCE; grants 1.A.  
9. Suite SQL A×B + asserts FK cruzada.

### 4.4 DDL proposto — comissões (D10)

```text
commission_rules (
  id UUID PK,
  barbershop_id UUID NOT NULL REFERENCES barbershops(id),
  barber_id UUID NULL,
  service_id UUID NULL,
  service_percent NUMERIC(5,2) NOT NULL,
  product_percent NUMERIC(5,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
-- UNIQUE NULLS NOT DISTINCT (barbershop_id, barber_id, service_id)  -- PG 15+
-- ou índice único por expressão coalesce(...)

commission_entries (
  id UUID PK,
  barbershop_id UUID NOT NULL,
  barber_id UUID NOT NULL,
  sale_id UUID NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  basis NUMERIC(12,2) NOT NULL,
  percent NUMERIC(5,2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','paid','reversed','clawback')),
  created_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ NULL,
  reversed_at TIMESTAMPTZ NULL,
  payout_batch_id UUID NULL,
  FOREIGN KEY (sale_id, barbershop_id) REFERENCES sales (id, barbershop_id)
)
-- UNIQUE parcial ativo: (barbershop_id, sale_id, barber_id) WHERE status IN ('pending','paid')

staff_advances (
  id UUID PK,
  barbershop_id UUID NOT NULL,
  barber_id UUID NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','deducted','canceled')),
  created_at TIMESTAMPTZ NOT NULL,
  deducted_at TIMESTAMPTZ NULL
)
```

RLS ENABLE+FORCE + policy tenant; REVOKE anon.  
Backfill `barbershop_id`: nullable → map/ETL → quarentena → NOT NULL → FKs.

### 4.5 Política de comissão no estorno (D6)

| Estado da entry | Política |
|---|---|
| `pending` | Na TX de refund: `reversed` (preserva amount) |
| `paid` | **Bloquear** refund até clawback liquidado (**default**) |
| `reversed`/`clawback` | Idempotente |

Código JSON atual (zerar amount + marcar `paid`) **não** será reproduzido no PG.

### 4.6 `payment_intents` e gateway (D7)

```text
payment_intents (
  id UUID PK,
  barbershop_id UUID NOT NULL,
  provider TEXT NOT NULL,
  provider_ref TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','paid','failed','canceled')),
  appointment_id UUID NULL,
  sale_id UUID NULL,
  deposit_id UUID NULL,
  idempotency_key TEXT NULL,
  raw_last_event JSONB NULL,
  created_at, updated_at,
  UNIQUE (provider, provider_ref),
  UNIQUE (barbershop_id, idempotency_key) -- onde key NOT NULL
)
```

Fluxo: create `pending` → sync só se confirmado → webhook assinado idempotente → reconcile job → efeito de negócio **só** se `status=paid`. `simulated` **nunca** `paid`.

**Obrigatório antes do cutover do grafo Venda (1.B.3).** Subetapa **1.B.3-G**.

### 4.7 Outras tabelas planejadas

purchase_orders(+items), client_packages, subscription_plans/client_subscriptions, coupons, deposits, goals, ops_idempotency_keys, ops_shop_id_map, ops_migration_rejects.

### 4.8 Migrations planejadas (repo only — **não criar/aplicar nesta autorização**)

1. `fase1b_01` — sale tenant columns + backfill + FK composta + RLS  
2. `fase1b_02` — sales/cash enrichment (tip, cancel, change_due, counted_by_method)  
3. `fase1b_03` — commissions + advances + RLS + constraints NULLS  
4. `fase1b_04` — packages/subscriptions  
5. `fase1b_05` — purchase_orders  
6. `fase1b_06` — coupons, deposits, payment_intents  
7. `fase1b_07` — idempotency + audit grants  
8. `fase1b_08` — concurrency constraints (cash open unique, stock checks)

Cada uma: ENABLE+FORCE, verificação `relforcerowsecurity`, grants mínimos, padrão 1.A.  
**Aplicar migrations no ambiente de prep/CI não implica flip de registry em produção** (D3a).

---

## 5. SHOP_ID e tenant (D8)

| Contexto | Comportamento |
|---|---|
| Código novo (adapters PG) desde **1.B.0** | `session.barbershop_id` / profile — **nunca** constant |
| JSON legado / seed demo | Constant `11111111-…-111` permitido |
| ETL 1.B.8 | `ops_shop_id_map(legacy_id → barbershop_id)`; órfãos → quarentena |
| **1.B.9** | Remover constant e writes JSON ops em prod |

---

## 6. Subetapas 1.B.0–1.B.9 (versão consolidada)

**Princípio:** preparação pode avançar em PG (schema/adapters/testes) **sem** mudar a fonte oficial em produção. Cutover = flip de registry do **conjunto** D3.

Registry de produção inicia tudo ops em `json` (CRM/PG já existente permanece).

| Subetapa | Tipo | Escopo | Dependências | Critérios de aceite | Riscos |
|---|---|---|---|---|---|
| **1.B.0** | Prep | `OpsRepository` + registry + **fail-fast de grafos** + tenant session; shadow log opcional; **sem** mudança UX | 1.A | Invariantes de registry testados; configs ilegais rejeitadas; SHOP_ID ausente em código novo; produção continua `json` nos domínios ops | Registry mal configurado |
| **1.B.1** | **Prep (não cutover)** | Schema/backfill/adapters/testes de **products + stock_movements + inventory_counts** | 1.B.0 + mig produtos | Testes PG (CRUD/isolamento) em CI/staging; **produção: `products`/`stock` = `json`**; createSale legado inalterado (ainda JSON) | Confundir prep com cutover — **proibido** flip stock enquanto sales=json |
| **1.B.2** | **Prep (não cutover)** | Schema/adapters/testes de **cash_sessions + cash_movements** (unique open, FOR UPDATE) | 1.B.1 prep | Testes caixa em CI/staging; **produção: `cash` = `json`** | Flip cash cedo — **proibido** enquanto sales=json |
| **1.B.3-G** | Prep + cutover gateway | `payment_intents` + webhook auth + idempotência + reconcile | 1.B.0 + mig intents | Intent pending≠pago; webhook replay safe; simulated≠paid; registry `payment_intents=pg` permitido (não faz parte do grafo Venda JSON de createSale atual) | Webhook inseguro; race sync/async |
| **1.B.3** | **Cutover conjunto do grafo Venda** | Flip atômico produção: `products`+`stock`+`cash`+`sales` (+ accrual commissions na TX) → `pg`; createSale/refundSale/TX completa; tip/desconto/troco/cancel/refund | 1.B.1 prep, 1.B.2 prep, **1.B.3-G**, mig tenant FK, D4/D5 | Um único momento de flip; pós-flip createSale só PG; zero JSON+PG; Σ payments; estorno OK; RLS A×B; fail-fast ainda ativo; pending nunca paid | Cutover parcial — **proibido**; exige freeze curto ou drain |
| **1.B.4** | Cutover payout | Comissões payout + advances + política D6 | 1.B.3 | DDL/constraints; pay idempotente; refund bloqueado se paid sem clawback | Clawback |
| **1.B.5** | Cutover packages | Packages / client_packages; `appointment.completed` só no backend PG do grafo já cutover | 1.B.3 | Completed não escreve JSON ops | Pacote+venda |
| **1.B.6** | **Cutover conjunto OC** | Flip conjunto `purchasing` + `payables` (com `stock` já `pg` desde 1.B.3) **no mesmo go-live**; receivePurchaseOrder TX stock+payable | 1.B.3 (stock oficial pg) + mig OC | receive OC sem fontes divididas; fail-fast se purchasing≠payables≠stock | Divergência se flip só OC |
| **1.B.7** | Cutover restante leve | Receivables, coupons, deposits (intents), campaigns, waitlist, reviews, fiscal draft; export CSV PG | 1.B.3, 1.B.3-G | Paridade API; deposit só intent paid | Deposit fantasma |
| **1.B.8** | Migração residual + harden | ETL JSON residual; registry global ops `pg`; JSON **read-only backup**; reconcile 0 | anteriores + D1 | Sem writes JSON prod; PG preservado; sem truncate pós-cutover | Rollback destrutivo — **proibido** |
| **1.B.9** | Limpeza | Remover SHOP_ID; ADR units (sem implementar units) | 1.B.8 | Constant ausente; multi-tenant ops real | — |

**WhatsApp:** fora desta etapa.

### Sequência de cutover (produção) — resumo

```
[Prep 1.B.0 → 1.B.1 → 1.B.2 → 1.B.3-G]  fonte oficial ops = json
        ↓
[1.B.3] flip conjunto: products+stock+cash+sales(+accrual) → pg
        ↓
[1.B.4 → 1.B.5] payout / packages
        ↓
[1.B.6] flip conjunto: purchasing+payables (stock já pg) → pg
        ↓
[1.B.7 → 1.B.8 → 1.B.9]
```

### Critérios transversais de aceite (toda subetapa)

1. Typecheck + build + suites security 1.A verdes (quando CI Cortely aplicável).  
2. Nenhuma rota aceita `barbershop_id` do cliente para escopo.  
3. Registry: uma fonte R/W por domínio; **fail-fast** nos grafos D3.  
4. Sem dual-write operacional; sem bridges.  
5. Prep **não** altera fonte oficial em produção.  
6. Sem apply remoto de migrations sem autorização.  
7. Revisão humana de risco financeiro: **1.B.3-G, 1.B.3, 1.B.4, 1.B.6, 1.B.8**.

---

## 7. Plano de migração JSON → PostgreSQL

### 7.1 Backup

Snapshot JSON + SHA-256; `pg_dump`/PITR antes do import; `migration_batch_id`.

### 7.2 ETL

Parser `OpsSnapshot`; `ops_shop_id_map`; normalização; lotes master → documents → movements; rejeitos em `ops_migration_rejects`.

### 7.3 Dedup / validação

Unique por id; sales inconsistentes → quarentena.

### 7.4 Import TX

Ordem: products → suppliers → packages → cash → sales → items → payments → stock → commissions → payables/receivables → resto.  
Stock: recalcular por movements **ou** qty final + `migration_opening`.

### 7.5 Reconciliação (tolerância 0)

#sales/Σ total; #payments/Σ; stock_qty; commissions pending/paid; cash open; intents paid vs deposits.

### 7.6 Rollback (D1)

Não apagar PG pós-cutover. Export delta + reconcile se retorno excepcional a JSON. Registry aponta fontes; dados PG permanecem.

### 7.7 Cutover

1. **Prep concluída** (1.B.1–1.B.2–1.B.3-G) com produção ainda `json` no grafo Venda.  
2. Freeze curto ou dual-read drain **sem** dual-write.  
3. Import/reconcile delta do conjunto Venda.  
4. **Flip atômico** registry: `products`,`stock`,`cash`,`sales` → `pg`.  
5. Monitor; depois cutovers 1.B.4–1.B.7; 1.B.6 flip `purchasing`+`payables`.  
6. 1.B.8: residual + JSON backup read-only.

### 7.8 Anti-duplicação

`ON CONFLICT (id)`; `imported_from_batch`; segundo import só `--force` + novo batch.

---

## 8. Estratégia de testes

| Classe | Conteúdo |
|---|---|
| **Invariante registry** | Uma fonte R/W por domínio; suite lista grafos legais |
| **Fail-fast** | `sales=json`+`stock=pg` (e espelhos) → rejeição no boot/fluxo; zero side-effects |
| **Prep sem cutover** | Em 1.B.1/1.B.2 com registry produção json: probes — createSale **não** escreve tabelas PG de stock/cash (contagem before/after = 0) |
| **createSale pós-1.B.3** | Todos writes (sale, items, payments, stock_movements, stock_qty, cash_session_id, commission_entries, audit) só em PG; JSON ops inalterado |
| **refundSale** | Stock e status só PG; coerência qty |
| **Caixa** | open → sale → cash_session_id existe em PG; close/conferência só com sales PG |
| **Estoque** | venda produto + refund; movements PG; isolamento 3 lojas |
| **appointment.completed** | caminho pacote/venda/caixa em fonte única; sem write JSON ops após cutover |
| **receivePurchaseOrder (1.B.6)** | stock+payable mesma fonte; fail-fast se registry OC incoerente |
| FK cruzada / RLS | item A ≠ sale B |
| Concorrência | caixa unique; stock 409; refund idempotente |
| Pagamentos | pending≠paid; webhook replay; simulated≠paid |
| Comissão D6 | refund bloqueado se paid |
| Migração | reconcile fixture |
| Regressão | phase0 + fase1a + build |

Ambiente: Postgres service (CI 1.A) + seeds 3 tenants. Prep testável em CI **sem** flip de produção.

---

## 9. Riscos técnicos e mitigativas

| Risco | Mitigação |
|---|---|
| Ops JSON em prod hoje | Cutover conjunto 1.B.3; alertas |
| Flip stock/cash antes de sales | **Proibido** (D3a); 1.B.1/1.B.2 = prep only |
| Bridges / dual-write | D2; fail-fast D3b |
| Cutover parcial venda/stock/caixa | Aceite 1.B.3 exige flip atômico |
| OC com stock/payables divididos | Cutover conjunto 1.B.6 |
| Intent pending como pago | D4/D7 + 1.B.3-G |
| Comissão paid + refund | D6 |
| SHOP_ID em código novo | D8 |
| Units scope creep | ADR §11 |
| Migrations remotas acidentais | Processo humano; CI não aplica |
| WhatsApp | Fora de escopo |

---

## 10. Critério de conclusão da Etapa 1.B (global)

- Registry: domínios ops obrigatórios em `pg` (exceto `units` — ADR).  
- JSON ops não escrito em produção.  
- Isolamento ≥ 3 barbearias (SQL+API).  
- Grafo Venda e grafo OC sem fontes mistas (testes fail-fast + E2E).  
- Migração reconcile 0 (ou diffs justificados).  
- Gateway: intents+webhook+reconcile; pending≠paid.  
- 1.A auth/RLS intacta.  
- SHOP_ID removido (1.B.9).

---

## 11. ADR — Adiamento de `units` (D9)

**Status:** Aceito para o planejamento 1.B.  
**Contexto:** `units` existe no JSON ops sem tabela SQL/RLS; multi-tenant SaaS já é `barbershops` + `profiles.barbershop_id`.  
**Decisão:** **Não** implementar `units` na 1.B; não bloqueia 1.B.8.  
**Consequências:** multi-unidade intra-loja fica para fase posterior.  
**Revisita:** pós-1.B.9 se houver requisito comercial.

---

## 12. Decisões ainda pendentes

| Pendência | Notas |
|---|---|
| P1 | Formato exato do registry (env JSON vs tabela `ops_domain_registry`) |
| P2 | Introduzir status `draft` de sale ou só `pending_payment`/`paid`/… |
| P3 | Clawback automático vs apenas bloqueio (default = **bloqueio**) — confirmar na 1.B.4 |
| P4 | Obrigar caixa open para toda sale `paid` ou exceções (agenda online) |
| P5 | Provider(s) de webhook (MP e/ou Asaas) e segredos |
| P6 | Profundidade do shadow log |
| P7 | Janela do job reconcile de intents |
| P8 | Stock no ETL: replay movements vs opening balance |
| P9 | Duração/procedimento exato do freeze no cutover 1.B.3 (minutos vs drain) |

---

## Apêndice A — Paths-chave

| Path | Papel |
|---|---|
| `src/lib/persist.ts` | disco JSON |
| `src/lib/demo-store.ts` | CRM demo |
| `src/lib/ops-store.ts` | PDV JSON (alvo 1.B) |
| `src/lib/types-ops.ts` | contrato snapshot |
| `src/lib/data.ts` | facade agenda/CRM |
| `src/app/api/ops/route.ts` | API PDV |
| `src/app/api/appointments/route.ts` | completed→venda |
| `src/app/api/payments/route.ts` | intents (hoje sync) |
| `supabase/migrations/20260327_*` … `20261111_06_*` | schema + RLS 1.A |
| `docs/fase1a-rls-inventory.md` | inventário RLS |
| `docs/fase1a-schema-privileges.md` | privilégios schema |

## Apêndice B — Limites desta autorização documental

- Não implementa código/adapters/testes funcionais.  
- Não cria nem aplica migrations.  
- Não altera Supabase remoto / produção.  
- Não remove JSON.  
- Não faz merge/publish/deploy.  
- **Não inicia 1.B.0** até aprovação formal humana deste plano consolidado.

---

**Próximo passo:** aprovação formal humana deste documento consolidado. Somente após autorização explícita iniciar **1.B.0** (registry + OpsRepository + fail-fast).
