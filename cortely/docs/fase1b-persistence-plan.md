# Etapa 1.B — Persistência Operacional em PostgreSQL  
## Planejamento técnico consolidado (somente planejamento — sem implementação)

**Referência 1.A aprovada:** commit `8ce23b1` (branch `cursor/cortely-fase1a-auth-7332`, PR #170).  
**Documento de planejamento:** PR #171 (`cursor/cortely-fase1b-plan-7332`).  
**Status:** consolidação arquitetural pós-revisão humana — **implementação ainda NÃO autorizada**.

**Base de implementação (D11 / B6):** a **1.B.0** será desenvolvida em branch criada a partir de **`8ce23b1` (1.A)**, como **PR empilhado** sobre a 1.A — **sem merge** até autorização humana explícita. Este PR #171 permanece **somente documental**.

**Fora de escopo até autorização explícita:** código funcional, adapters, testes funcionais, criação/aplicação de migrations, Supabase remoto, remoção de JSON, merge, publish, deploy, início de 1.B.0.

---

## 0. Decisões arquiteturais consolidadas (obrigatórias)

| # | Decisão |
|---|---|
| D1 | **Ponto sem retorno = flip do registry para `active_postgres` (`ops_core`).** Depois disso, PostgreSQL é a fonte oficial definitiva — **não há retorno a JSON**. Rollback de aplicação = **redeploy mantendo PG** + correção *forward*. Abortar para JSON **só** durante `cutover_pending`, **antes** do flip. Sem dual-write. Ver §3.3. |
| D2 | **Registry global** (não por tenant): tabela `ops_domain_registry` é a **fonte canônica** após o seed. Arquivo só faz **seed inicial** e, com tabela existente, é **ignorado** (não comparado). Presença de `CORTELY_OPS_REGISTRY` com tabela existente → **fail-fast**. Arquivo/env **nunca** promovem para `active_postgres`. R=W; dual-write/bridges proibidos; mudanças **auditadas**. Ver §3.2 (P13 **fechado**). |
| D3 | **`ops_core`** é a **única unidade de cutover** na 1.B.3: une o antigo sale_graph + oc_graph + package_graph (`sales`, `products`, `stock`, `cash`, `commissions`, `purchasing`, `payables`, `packages`). Proibida execução financeira partida JSON+PG. |
| D3a | **Prep ≠ cutover.** Schema/adapters/testes (incl. purchasing/payables/packages) em PG **antes** da 1.B.3, sem alterar fonte oficial em produção. |
| D3b | **Fail-fast no boot:** combinações inválidas **impedem** boot/execução — zero side-effects. |
| D4 | Venda, pagamento (split) e movimento de caixa **separados**. `sale_payments`: `tendered_amount` + `applied_amount`. Troco = `cash_movements` de saída (`kind=change`) **só** em cash. Invariantes: `Σ applied_amount = sales.total`; `change = Σ(tendered − applied)` **apenas cash**; `tendered >= applied`; troco só cash. Estornos = **nova linha** compensatória — sem `UPDATE`/`DELETE` destrutivo. Ver §4.2. **Nota 1.B.2:** o enum do DDL original chamado `reason` passou a chamar-se **`kind`**; a coluna `reason` permanece como descrição livre. |
| D5 | Multi-tenant: FKs **compostas** com `barbershop_id`; backfill → UNIQUE → FK → índices → RLS FORCE; preservar 1.A. |
| D6 | Comissão paga: bloquear estorno até clawback (default = P3). Reversão/clawback = **nova linha**; unique ativo `(barbershop_id, sale_item_id, barber_id)`; `UNIQUE (clawback_of) WHERE status='clawback'`; FK composta em `clawback_of`. **P15 (1.B.4):** reversão de `pending` = linha `reversed` + `reversal_of` + UNIQUE; payout ignora pending revertidos. **P24:** vale PG desconta só até o bruto (parcial). **P23:** ETL legado JSON→PG a decidir antes da 1.B.8. |
| D7 | Gateway: intents com `barbershop_id NOT NULL`, RLS, FKs compostas; assinatura **antes** de escrita; tenant do **intent**; `UNIQUE (provider, provider_event_id)`; intent inexistente / tenant inconsistente / schema inválido → **`payment_webhook_quarantine`** (sem tenant, sem FK, só service role). Passos 4–6 do pipeline em **uma TX**. |
| D8 | Tenant da sessão desde **1.B.0**. `SHOP_ID` só em legado JSON + ETL até 1.B.9. |
| D9 | **`units` adiadas** — ADR §11. |
| D10 | Comissões + ETL idempotente (`ops_shop_id_map`) + reconcile por tenant. Tabelas de infraestrutura ops (`ops_domain_registry*`, `ops_idempotency_keys`, `ops_shop_id_map`) = **somente service role** (`REVOKE` anon/authenticated). Idempotency: `UNIQUE (barbershop_id, scope, key)`. |
| D11 | **1.B.0** em branch a partir de `8ce23b1`, PR empilhado, **sem merge** até autorização. *(política de stack cumprida nas preps 1.B.0–1.B.3-G.)* |
| D12 | **Conta conectada por barbearia:** o dinheiro do cliente final vai **direto** para a conta/subconta da barbearia. O Cortely **nunca** recebe e repassa. Credencial global única é **proibida** para cobrança de cliente. Provedor escolhido depois (P5); 1.B.3-G só interface + FakeProvider. *(autorização humana 1.B.3-G referiu “D11”; no plano D11 já era stack — esta regra = D12.)* |

---

## 1. Diagnóstico da persistência atual

### Veredito

| Camada | Fonte atual (demo) | Fonte atual (prod / não-demo) | Meta 1.B |
|---|---|---|---|
| Agenda / CRM / catálogo / loyalty / reminders / settings / staff profiles | JSON `demo` (`demoStore`) | **PostgreSQL** via Supabase service role | Manter Postgres; alinhar IDs com ops |
| Ops PDV (caixa, vendas, estoque, financeiro, comissões, pacotes, marketing, etc.) | JSON `ops` (`opsStore`) | **ainda JSON `ops`** | Postgres oficial via cutover **`ops_core`** (registry) |
| Auth staff | HMAC + demo staff | Supabase Auth + `profiles` + `session_generation` (1.A) | Intacta |
| OTP / client proof / revoke | memória (± SQL) | memória + SQL | Endurecer; sem JSON |

**Risco crítico:** `ops-store.ts` não consulta `isDemoMode()` nem Supabase. Em “produção” com Auth, a UI ops grava `cortely-store.json`. Tabelas SQL ops + RLS 1.A existem e **não são usadas**. `SHOP_ID` fixo.

**Acoplamento (D3):** `createSale` ↔ caixa ↔ stock ↔ comissões; `receivePurchaseOrder` ↔ stock ↔ payables; pacotes ↔ `createSale`. Esses fluxos exigem cutover **conjunto** (`ops_core`).

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

### 2.2 Call sites `opsStore`

| Rota / módulo | Uso |
|---|---|
| `api/ops/route.ts` | CRUD quase total do PDV |
| `api/export/route.ts` | CSV |
| `api/appointments/route.ts` | `completed` → pacote ou `createSale` + caixa |
| `api/payments/route.ts` | `createDeposit` se intent sync `paid` |
| `api/client-lookup/route.ts` | leitura pacotes/assinaturas |
| `ops-store.ts` (Proxy) | `persistOps` a cada mutação |

Tip/troco/cancel dedicado **não** existem no JSON atual (`refundSale` sim; `cancelSale` não).

### 2.3 Já em PostgreSQL (app usa)

`barbershops`, `profiles`, `barbers`, `services`, `working_hours`, `appointments`, `clients`, `schedule_blocks`, `loyalty_*`, `reminders`, `staff_session_revocations`, `permission_audit_log`, `client_otp_challenges`, `client_proof_jtis`, `auth.users`, RPC `provision_owner_barbershop`. Facade: `data.ts`.

### 2.4 SQL existe (RLS 1.A), app não usa

`products`, `suppliers`, `cash_sessions`, `cash_movements`, `sales`, `sale_items`, `sale_payments`, `stock_movements`, `inventory_counts`, `service_packages`, `waitlist`, `payables`, `receivables`, `campaigns`, `reviews`, `ops_audit_log`, `fiscal_documents`.

### 2.5 Domínio sem tabela adequada

commission_rules/entries, staff_advances, goals, client_packages, subscription_plans/client_subscriptions, coupons, deposits, purchase_orders(+items), payment_intents, payment_webhook_events, payment_webhook_quarantine, ops_idempotency_keys, ops_shop_id_map, ops_domain_registry (+ audit); **units adiadas (ADR)**.

### 2.6 Grafo transacional unificado — `ops_core` (D3)

**Unidade única de cutover na 1.B.3** (substitui sale_graph + oc_graph + package_graph separados):

```
ops_core =
  sales + sale_items + sale_payments
  + products + stock (+ inventory_counts)
  + cash_sessions + cash_movements
  + commissions (accrual na TX de venda)
  + purchasing (purchase_orders)
  + payables
  + packages (+ client_packages no caminho completed/sellPackage)
```

Fluxos cobertos no mesmo flip:
- `createSale` / `refundSale` / `appointment.completed` (venda)
- `receivePurchaseOrder` (stock + payable)
- `sellPackageToClient` / completed via pacote

**Grafo Gateway (antecipável isolado — 1.B.3-G):**
```
payment_intents + payment_webhook_events (+ quarantine)
  → NÃO cria/atualiza sales/deposits/cash/stock enquanto json
```

Qualquer fluxo de `ops_core` só executa com fonte homogênea; senão **fail-fast**.

---

## 3. Arquitetura PostgreSQL proposta

### 3.1 Princípios

1. PostgreSQL = fonte oficial após flip `ops_core` → `active_postgres` (ponto sem retorno, D1).  
2. `barbershop_id` só da sessão desde 1.B.0 (D8).  
3. RLS 1.A + FKs compostas `(id, barbershop_id)`.  
4. Infra ops (`ops_domain_registry*`, `ops_idempotency_keys`, `ops_shop_id_map`) = **service role only**.  
5. Idempotência: `UNIQUE (barbershop_id, scope, key)` em `ops_idempotency_keys`; `provider_event_id` em webhooks.  
6. Concorrência: `FOR UPDATE`, unique cash open, `UPDATE stock WHERE qty >= n`.  
7. Auditoria de negócio + **audit de registry**.  
8. Prep sem flip (D3a); 1.B.0 a partir de `8ce23b1` empilhado (D11).  
9. Monetário: `NUMERIC(12,2)` (ou centavos — P11).

### 3.2 Registry — global, tabela canônica (D2 / P13 fechado)

**Decisão:** o registry é **global** (não por tenant). Uma única linha por domínio para todo o ambiente.

#### 3.2.1 Representação

| Camada | Papel |
|---|---|
| Arquivo `cortely/config/ops-registry.json` e/ou env `CORTELY_OPS_REGISTRY` | **Seed inicial apenas** |
| **`ops_domain_registry`** | **Fonte canônica** após existir/seed |
| **`ops_domain_registry_audit`** | Toda mudança: quem, quando, de→para, conjunto, motivo, fingerprint |

```text
ops_domain_registry (
  domain TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('json','postgres')),
  state TEXT NOT NULL CHECK (state IN (
    'active_json',
    'prep_pg',
    'cutover_pending',
    'active_postgres'
  )),
  cutover_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NULL,
  CONSTRAINT ops_registry_source_state_ck CHECK (
    (source = 'json'     AND state IN ('active_json','prep_pg','cutover_pending'))
    OR
    (source = 'postgres' AND state IN ('active_postgres','cutover_pending'))
  )
)
-- REVOKE ALL ON ops_domain_registry, ops_domain_registry_audit FROM anon, authenticated;
-- GRANT apenas service_role
```

**Domínios:** `products`, `stock`, `cash`, `sales`, `commissions`, `packages`, `purchasing`, `payables`, `receivables`, `coupons`, `deposits`, `campaigns`, `waitlist`, `reviews`, `fiscal`, `payment_intents`.

#### 3.2.2 Precedência e P13 (fechado)

| Situação | Comportamento |
|---|---|
| Tabela **não existe** ainda | Usar arquivo/env interpretado como **all-json** / `active_json` (ou o mapa do arquivo **se** for all-json válido). **Não criar** tabela nem migrations neste momento de boot “pré-1.B.0”. |
| Tabela existe (pós-`fase1b_00` + seed) | **Tabela é a única fonte.** O **arquivo de seed é IGNORADO** (não lido, **não comparado**). |
| `CORTELY_OPS_REGISTRY` presente **e** tabela existe | **Fail-fast no boot** (exit ≠ 0). Env não coexiste com tabela. |
| Arquivo/env tentam promover `active_postgres` | **Proibido** — só API de cutover auditada (conjunto `ops_core`). |
| Seed inicial | Uma vez: arquivo/env → INSERT na tabela (tudo `json`/`active_json` ou `prep_pg` onde permitido) + linha de audit `seed`. Depois do seed, arquivo deixa de ser consultado. |

**Removido:** regra “arquivo diverge da tabela → fail-fast” — com tabela existente o arquivo **não é comparado**.

#### 3.2.3 Valores padrão e transições permitidas

Default produção: todos `source=json`, `state=active_json`.

| De | Para | Quando |
|---|---|---|
| `active_json` | `prep_pg` | Início de prep (schema/adapters); `source` permanece `json` |
| `prep_pg` | `cutover_pending` | Freeze do cutover `ops_core` |
| `cutover_pending` + `source=json` | `active_json` | Abortar cutover **antes** do flip |
| `cutover_pending` | `active_postgres` (`source=postgres`) | Flip `ops_core` no go-live = **ponto sem retorno** |
| `active_postgres` | — | **Sem retorno a json.** Correção = forward + redeploy |

Não existe estado `readonly_postgres_export`.

#### 3.2.4 Validação no boot (fail-fast)

1. Se tabela existe: carregar **somente** a tabela.  
   - Se `CORTELY_OPS_REGISTRY` estiver definido → **abortar** (fail-fast).  
   - Arquivo de seed (`ops-registry.json`) → **ignorado** (não comparado).  
2. Se tabela não existe: carregar arquivo/env all-json (ou abortar se mapa ilegal). **Não criar** tabela.  
3. Validar CHECK source↔state e domínios.  
4. Avaliar conjunto **`ops_core`**: todos os domínios abaixo homogêneos (`all json` ou `all postgres`):

| Conjunto | Domínios |
|---|---|
| **`ops_core`** | `sales`, `products`, `stock`, `cash`, `commissions`, `purchasing`, `payables`, `packages` |
| **Gateway isolado** | `payment_intents=postgres` permitido com `ops_core=json` **somente** se efeitos de negócio desligados |

5. `ops_core` partido → **abortar boot**.  
6. Logar fingerprint + audit head.

#### 3.2.5 Combinações inválidas (exemplos)

| Configuração | Resultado |
|---|---|
| Qualquer subconjunto de `ops_core` misto json/postgres | **Rejeitada** |
| Flip de um domínio isolado de `ops_core` | **Rejeitada** |
| Env promovendo `active_postgres` | **Rejeitada** |
| `payment_intents=postgres` com efeitos em sales/deposits json | OK só modo isolado 1.B.3-G |

#### 3.2.6 R = W; flip só `ops_core`

- `source(domain)` único para read e write.  
- API interna de cutover: conjunto nomeado **`ops_core`** (ou `payment_intents` isolado); uma TX de registry + audit.  
- Sem dual-write.

### 3.3 Rollback e ponto sem retorno (D1)

**Regra dura:** o **ponto sem retorno = flip do registry para `active_postgres`** no conjunto `ops_core`. A partir desse instante **não há retorno a JSON**.

| Fase | Rollback permitido |
|---|---|
| Prep (`active_json` / `prep_pg`) | Redeploy; produção continua json |
| Freeze `cutover_pending` **antes** do flip | Abortar: registry volta a `active_json` (grafo inteiro); **sem** dual-write; intents **não** são aplicados em JSON |
| **Após flip → `active_postgres`** | **Ponto sem retorno.** Rollback = redeploy da app **mantendo** `source=postgres` / `active_postgres` + correção *forward*. Dados PG preservados. **Proibido** apontar registry para json; **proibido** aplicar intents em JSON |

**Pagamentos já capturados (pós flip):** permanecem em PG; reconcile/forward fix na fonte postgres; chargebacks = lançamentos compensatórios em PG. **Não** há export PG→JSON nem virada de registry após o flip.

**Sem janela de dual-write** em nenhuma fase. Estado `readonly_postgres_export` **não existe**.

### 3.4 Isolamento / camadas

```
Browser → API Next.js (session + RBAC + tenant bind)
       → OpsRepository(registry global + fail-fast ops_core)
       → Postgres | JSON legado (R=W)
       → payment_intents + webhook (assinatura → intent → tenant | quarantine)
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
sale_payments 1──0..2 cash_movements
  -- tipicamente: 0..1 entrada (cash in) + 0..1 saída (change)
payment_intents *──? sales | appointments | deposits
payment_intents 1──* payment_webhook_events
payment_webhook_quarantine  -- sem FK / sem tenant
```

### 4.2 Venda, pagamento, caixa e troco (D4 / B1)

**Entidades separadas:**

| Entidade | Papel |
|---|---|
| **`sales`** | Cabeçalho: `subtotal`, `discount`, `tip`, `total`, status |
| **`sale_payments`** | Split: `method`, **`tendered_amount`**, **`applied_amount`** |
| **`cash_movements`** | Entrada (recebimento cash) e/ou saída (**troco**) |

**Colunas de pagamento (obrigatório — substitui `amount` único):**

```text
sale_payments (
  …
  method TEXT NOT NULL,                 -- 'cash' | 'card' | 'pix' | …
  tendered_amount NUMERIC(12,2) NOT NULL CHECK (tendered_amount >= 0),
  applied_amount  NUMERIC(12,2) NOT NULL CHECK (applied_amount  >= 0),
  CHECK (tendered_amount >= applied_amount),
  CHECK (method = 'cash' OR tendered_amount = applied_amount)
  -- troco só em cash: para não-cash, tendered = applied
)
```

**Invariantes (obrigatórios):**

1. **`Σ sale_payments.applied_amount = sales.total`** (venda `paid`).  
2. **`change = Σ (tendered_amount − applied_amount)`** calculado **apenas** sobre linhas `method = 'cash'`.  
3. **`tendered_amount >= applied_amount`** em toda linha.  
4. **Troco só em cash** — meios não-cash não geram `kind='change'`.

**DDL `cash_movements`:**

```text
cash_movements (
  id UUID,
  barbershop_id UUID NOT NULL,
  cash_session_id UUID NOT NULL,
  sale_payment_id UUID NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  kind TEXT NOT NULL CHECK (kind IN ('sale_cash_in','change','manual_in','manual_out','refund_out','refund_in')),
  reason TEXT,                         -- descrição livre (UI); NÃO é o enum
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (id, barbershop_id),
  FOREIGN KEY (cash_session_id, barbershop_id)
    REFERENCES cash_sessions (id, barbershop_id) ON DELETE RESTRICT,
  FOREIGN KEY (sale_payment_id, barbershop_id)
    REFERENCES sale_payments (id, barbershop_id),
  CHECK (
    (kind IN ('sale_cash_in','manual_in','refund_in') AND direction = 'in')
    OR (kind IN ('change','manual_out','refund_out') AND direction = 'out')
  ),
  CHECK (kind NOT IN ('sale_cash_in','change') OR sale_payment_id IS NOT NULL)
)
-- RLS ENABLE+FORCE por barbershop_id; append-only (sem UPDATE/DELETE)
-- Nota 1.B.2: o nome "reason" do DDL original §4.2 virou a coluna "kind".
```

Relação §4.1: um `sale_payment` cash pode ter **até 2** movements (entrada + troco) → `sale_payments 1──0..2 cash_movements`.

**`sales.status`:** `draft?` (P2) \| `pending_payment` \| `paid` \| `canceled` \| `refunded`.  
`pending_payment` nunca baixa estoque definitivo nem comissiona como paid.

**Estornos (append-only):** **nova linha** compensatória (payments, movements, stock, commissions). **Proibido** `UPDATE`/`DELETE` que apague ou zere histórico. Idempotência via `ops_idempotency_keys`.

**Fechamento de caixa:** receita = Σ `applied_amount` por método; dinheiro ≈ entradas cash − saídas `change` ± manuais. Aceite: cash + split + close sem divergência.

### 4.3 Sequência multi-tenant e FKs compostas (D5)

1. `ADD COLUMN barbershop_id UUID NULL`.  
2. Backfill; quarentenar órfãos.  
3. `SET NOT NULL`.  
4. `UNIQUE (id, barbershop_id)` no pai.  
5. `FOREIGN KEY (parent_id, barbershop_id) REFERENCES parent (id, barbershop_id)`.  
6. Índices; policies; ENABLE+FORCE; grants 1.A.  
7. Suite A×B + isolamento multi-tenant.

### 4.4 DDL comissões (D6 / D10) — unique por sale_item + clawback

```text
commission_rules (
  id UUID PK,
  barbershop_id UUID NOT NULL REFERENCES barbershops(id),
  barber_id UUID NULL,
  service_id UUID NULL,
  service_percent NUMERIC(5,2) NOT NULL,
  product_percent NUMERIC(5,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (barber_id, barbershop_id) REFERENCES barbers (id, barbershop_id),
  FOREIGN KEY (service_id, barbershop_id) REFERENCES services (id, barbershop_id)
)
-- UNIQUE NULLS NOT DISTINCT (barbershop_id, barber_id, service_id)

commission_entries (
  id UUID,
  barbershop_id UUID NOT NULL,
  barber_id UUID NOT NULL,
  sale_id UUID NOT NULL,
  sale_item_id UUID NOT NULL,
  amount NUMERIC(12,2) NOT NULL,   -- preservado; NÃO zerar
  basis NUMERIC(12,2) NOT NULL,
  percent NUMERIC(5,2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','paid','reversed','clawback')),
  created_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ NULL,
  reversed_at TIMESTAMPTZ NULL,
  clawback_of UUID NULL,
  payout_batch_id UUID NULL,
  PRIMARY KEY (id),
  UNIQUE (id, barbershop_id),
  FOREIGN KEY (sale_id, barbershop_id) REFERENCES sales (id, barbershop_id),
  FOREIGN KEY (sale_item_id, barbershop_id) REFERENCES sale_items (id, barbershop_id),
  FOREIGN KEY (barber_id, barbershop_id) REFERENCES barbers (id, barbershop_id),
  FOREIGN KEY (clawback_of, barbershop_id)
    REFERENCES commission_entries (id, barbershop_id)
)
-- UNIQUE parcial ativo (anti-duplicidade):
--   (barbershop_id, sale_item_id, barber_id) WHERE status IN ('pending','paid')
-- UNIQUE parcial clawback:
--   (clawback_of) WHERE status = 'clawback'   -- um clawback por entry origem
-- Reversão / clawback = SEMPRE nova linha (não UPDATE destrutivo de amount)
```

`staff_advances`: FK composta `(barber_id, barbershop_id)`; RLS FORCE.  
P12: garantir `UNIQUE (id, barbershop_id)` em `barbers`/`services` antes das FKs.

### 4.5 Política de comissão no estorno (D6)

| Estado origem | Ação |
|---|---|
| `pending` | **Nova linha** `reversed` (ou marca origem + linha compensatória — preferência: **nova linha**); amounts originais intactos |
| `paid` | Bloquear refund da venda até clawback; **nova linha** `clawback` com `clawback_of` → entry paga |
| `reversed`/`clawback` | Idempotente; unique impede duplicar clawback |

### 4.6 Payment intents, events e quarantine (D7 / B3)

```text
payment_intents (
  id UUID,
  barbershop_id UUID NOT NULL REFERENCES barbershops(id),
  provider TEXT NOT NULL,
  provider_ref TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('pix','credit','debit')),
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  status TEXT NOT NULL CHECK (status IN ('pending','paid','failed','canceled')),
  -- paid/canceled TERMINAIS (nunca regridem); evento fora de ordem não regride
  purpose TEXT NOT NULL CHECK (purpose IN ('sale','deposit','appointment','other')),
  appointment_id UUID NULL,
  sale_id UUID NULL,
  deposit_id UUID NULL,                 -- SEM FK até 1.B.7 (deposits)
  paid_at TIMESTAMPTZ NULL,              -- quando status virou paid (P10)
  applied_at TIMESTAMPTZ NULL,           -- efeito de negócio; NULL na 1.B.3-G
  idempotency_key TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (id, barbershop_id),
  UNIQUE (provider, provider_ref),
  UNIQUE (barbershop_id, idempotency_key),
  CHECK (status = 'paid' OR applied_at IS NULL),
  CHECK (applied_at IS NULL OR paid_at IS NOT NULL),
  FOREIGN KEY (appointment_id, barbershop_id) REFERENCES appointments (id, barbershop_id),
  FOREIGN KEY (sale_id, barbershop_id) REFERENCES sales (id, barbershop_id)
  -- deposit_id: FK composta adiada → 1.B.7
)
-- RLS ENABLE+FORCE; authenticated SELECT próprio tenant; escrita só service_role

payment_provider_accounts (
  id UUID PK,
  barbershop_id UUID NOT NULL REFERENCES barbershops(id),
  provider TEXT NOT NULL,
  external_account_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (barbershop_id, provider)
  -- SEM credenciais/segredos nesta etapa (D12)
)

payment_webhook_events (
  id UUID PK,
  barbershop_id UUID NOT NULL,          -- do intent registrado; NUNCA do payload
  payment_intent_id UUID NOT NULL,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processed','duplicate')),
  raw_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (provider, provider_event_id),
  FOREIGN KEY (payment_intent_id, barbershop_id)
    REFERENCES payment_intents (id, barbershop_id)
)
-- RLS ENABLE+FORCE; escrita só service_role; sem acesso anon/authenticated

payment_webhook_quarantine (
  id UUID PRIMARY KEY,
  provider TEXT,
  provider_event_id TEXT,
  raw_payload JSONB NOT NULL,
  error_reason TEXT NOT NULL,          -- intent_missing | tenant_inconsistent | schema_invalid | amount_mismatch | …
  signature_valid BOOLEAN,
  attempts INT NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL,
  reprocessed_at TIMESTAMPTZ NULL,
  reprocess_result TEXT NULL,
  UNIQUE (provider, provider_event_id) WHERE provider_event_id IS NOT NULL
  -- repetição → attempts++ (P16); SEM barbershop_id; SEM FK
  -- REVOKE ALL FROM anon, authenticated; GRANT apenas service_role
)
```

**Pendência 1.B.7:** FK composta `payment_intents.deposit_id` → `deposits (id, barbershop_id)`.

#### Pipeline do webhook

1. **Validar assinatura** — antes de qualquer escrita. Falha → 4xx, zero write de domínio.  
2. Extrair `provider_event_id` + ref do intent; **lookup** de `payment_intents`.  
3. Se intent inexistente, tenant inconsistente (se houver claim) ou schema inválido → **INSERT `payment_webhook_quarantine`** (service role); **não** escrever em `payment_webhook_events` / intents; fim.  
4–6. **Uma única transação:**  
   - (4) `INSERT payment_webhook_events` (`UNIQUE (provider, provider_event_id)` → duplicate = no-op de efeito)  
   - (5) Atualizar status da intent  
   - (6) Efeito de negócio **somente** se `ops_core` (e deposits, se aplicável) homogêneo em postgres; senão só status da intent (modo isolado 1.B.3-G) — **nunca** aplicar em JSON pós ponto sem retorno  

**Reprocessamento de quarentena (manual/job service role):**  
1. Revalidar assinatura e schema.  
2. Se intent agora existe e é coerente → mover para pipeline 4–6 (TX) e marcar `reprocessed_at` + resultado.  
3. Se ainda inválido → manter em quarentena; sem efeitos.  
4. Idempotente: se `provider_event_id` já está em `payment_webhook_events`, só atualizar metadados da quarentena.

#### Limites 1.B.3-G

| Permitido | Proibido |
|---|---|
| Intent pending + webhook → status | Criar/atualizar sales/deposits em JSON |
| Quarentena sem tenant | Efeitos financeiros parciais / bridges |
| Reprocessamento service role | Aplicar intents em JSON após rollback/redeploy |

### 4.7 Outras tabelas / grants de infra

```text
ops_idempotency_keys (
  barbershop_id UUID NOT NULL,
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  response_meta JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (barbershop_id, scope, key)   -- UNIQUE por (barbershop_id, scope, key)
)
-- ops_shop_id_map, ops_domain_registry, ops_domain_registry_audit,
-- ops_idempotency_keys, payment_webhook_quarantine:
--   REVOKE ALL FROM anon, authenticated; service_role only
```

### 4.8 Migrations planejadas (repo only — **não criar/aplicar agora**)

0. **`fase1b_00`** — `ops_domain_registry` + `ops_domain_registry_audit` + grants service_role + seed all-json  
1. `fase1b_01` — products/stock/inventory (FKs compostas, CHECKs, `ops_adjust_stock` / `ops_register_inventory_count`)  
2. `fase1b_02` — sale tenant columns (`sale_items`/`sale_payments`) + payments `tendered_amount`/`applied_amount` + `cash_sessions`/`cash_movements` (`kind`/`direction`, troco CHECK) + `ops_*_cash` (EXECUTE só `service_role`)  
2g. `fase1b_03g` — gateway isolado: `payment_intents` + `payment_provider_accounts` + events/quarantine (P16) + `ops_apply_payment_webhook` (sem efeito de negócio)  
3. `fase1b_04` — commissions (unique sale_item + clawback/reversal P15) + advances/payouts/goals + `ops_accrue/reverse/clawback/pay/ranking`  
4. `fase1b_05` — packages/subscriptions (`service_package_services` substitui array `service_ids` no cutover; coluna legada mantida na prep) + `ops_sell/consume/revert/cancel` (P25–P27 documentados)  
5. `fase1b_06` — purchase_orders + payables endurecidos (`purchase_order_id`, imutabilidade) + `ops_create/receive/cancel_po` + `ops_*_payable` (P29–P31)  
6. `fase1b_07` — coupons, deposits (intents/events já em 03g; restante)  
7. `fase1b_07` — `ops_idempotency_keys`, `ops_shop_id_map`, audit grants  
8. `fase1b_08` — concurrency constraints  

Prep/CI **não** implica flip `ops_core` em produção.

---

## 5. SHOP_ID e tenant (D8)

| Contexto | Comportamento |
|---|---|
| Código novo desde 1.B.0 | `session.barbershop_id` — nunca constant |
| JSON legado / demo | Constant permitida |
| ETL | `ops_shop_id_map`; órfãos → quarentena |
| Webhook | Tenant **só** do intent; senão → `payment_webhook_quarantine` |
| 1.B.9 | Remover constant e writes JSON ops |

---

## 6. Subetapas 1.B.0–1.B.9 (reordenado — `ops_core`)

**Princípio:** toda preparação de `ops_core` (sales/stock/cash/commissions/**purchasing/payables/packages**) ocorre **antes** do cutover único na **1.B.3**. 1.B.5 e 1.B.6 são **prep**, não cutovers separados.

| Subetapa | Tipo | Escopo | Dependências | Critérios de aceite | Riscos |
|---|---|---|---|---|---|
| **1.B.0** | Prep | `OpsRepository` + registry global (§3.2) + fail-fast `ops_core` + audit; branch a partir de `8ce23b1`, PR empilhado **sem merge** (D11) | 1.A `8ce23b1` | Tabela canônica pós-seed; arquivo ignorado se tabela existe; `CORTELY_OPS_REGISTRY`+tabela → fail-fast; R=W | Registry |
| **1.B.1** | Prep | products + stock (+ inventory) | 1.B.0 + mig | CI PG; **prod json** | Flip cedo |
| **1.B.2** | Prep | cash_sessions + cash_movements (troco) | 1.B.1 | CI caixa; **prod json** | Flip cedo |
| **1.B.3-G** | Gateway isolado | intents + events + quarantine + pipeline TX 4–6 | 1.B.0 | Assinatura; event_id; quarantine; zero efeitos JSON | Efeitos cedo |
| **1.B.4** | Prep | commissions DDL/unique/clawback + advances (adapters/testes; prod json) | 1.B.0 | Unique sale_item; clawback nova linha | — |
| **1.B.5** | **Prep** (ex-cutover) | packages / client_packages schema+adapters+testes; **prod json** | 1.B.0 | Prep OK; sem flip | Confundir com cutover |
| **1.B.6** | **Prep** (ex-cutover) | purchasing (OC) + payables schema+adapters+testes; **prod json** | 1.B.1 | Prep OK; sem flip | Confundir com cutover |
| **1.B.3** | **Cutover único `ops_core`** | Flip atômico: sales+products+stock+cash+commissions+purchasing+payables+packages → postgres; createSale/refund/OC/pacote/troco; ligar intents aplicados **só em PG** | 1.B.1, 1.B.2, 1.B.3-G, 1.B.4, **1.B.5**, **1.B.6** | Um flip auditado → `active_postgres` = **ponto sem retorno**; Σ applied = total; change só cash; append-only; isolamento 3 tenants | Cutover parcial |
| **1.B.7** | Cutover leve | receivables, coupons, deposits (registry coerente), campaigns, waitlist, reviews, fiscal | 1.B.3, 1.B.3-G | Deposit só intent paid + PG | Bridge |
| **1.B.8** | ETL + harden | ETL idempotente + map + reconcile por tenant; JSON RO backup | 1.B.3+ | Reconcile 0/tenant | Truncate |
| **1.B.9** | Limpeza | Remover SHOP_ID; ADR units | 1.B.8 | Multi-tenant real | — |

**WhatsApp:** fora.

### Sequência de cutover (produção)

```
[Prep 1.B.0 → 1.B.1 → 1.B.2 → 1.B.3-G → 1.B.4 → 1.B.5 → 1.B.6]
        ops_core = json  (payment_intents pode ser postgres isolado)
        ↓
[Freeze cutover_pending — ainda sem escrita PG]
        ↓ abortável → active_json
        ↓
[1.B.3] flip auditado ops_core → active_postgres  = PONTO SEM RETORNO
        ↓
[1.B.7 → 1.B.8 → 1.B.9]
```

### Critérios transversais

1. CI/security 1.A quando aplicável.  
2. Sem `barbershop_id` do cliente.  
3. Registry global canônico; fail-fast; flip só `ops_core`.  
4. Sem dual-write/bridges.  
5. Prep não altera fonte oficial (exceto intents isolados).  
6. Sem apply remoto sem autorização.  
7. **Toda subetapa exige aprovação humana antes de iniciar e antes de concluir.** Subetapas **1.B.3-G, 1.B.3 e 1.B.8** têm **revisão reforçada** (risco financeiro / cutover / ETL).  
8. Pós flip `active_postgres`: rollback = redeploy + forward (sem retorno JSON).  
9. Isolamento ≥ 3 tenants.  
10. 1.B.0 empilhado a partir de `8ce23b1`, sem merge até autorização.

---

## 7. Plano de migração JSON → PostgreSQL

### 7.1 Backup

Snapshot JSON + SHA-256; `pg_dump`/PITR; `migration_batch_id`.

### 7.2 ETL idempotente

Parser; `ops_shop_id_map`; import por tenant; `ON CONFLICT` / batch; rejeitos em `ops_migration_rejects`.

### 7.3 Dedup / validação

Unique por id. Quarentena se:
- `Σ applied_amount ≠ sales.total`  
- `tendered_amount < applied_amount`  
- troco/`change` em método ≠ cash  
- comissão violando unique `(barbershop_id, sale_item_id, barber_id)` ativo  

### 7.4 Import TX — ordem por FKs

1. `ops_shop_id_map` / tenants  
2. products, suppliers  
3. packages / subscription_plans  
4. cash_sessions  
5. sales  
6. sale_items, sale_payments (`tendered_amount`/`applied_amount`)  
7. cash_movements (incl. `kind=change` → `sale_payment_id`)  
8. stock_movements, inventory_counts  
9. commission_rules → commission_entries (por sale_item)  
10. staff_advances  
11. purchase_orders(+items) → payables / receivables  
12. coupons, deposits, client_packages/subscriptions  
13. payment_intents → payment_webhook_events (quarantine não importa de JSON)  
14. campaigns, waitlist, reviews, fiscal, audit  
15. ops_idempotency_keys / rejects / registry já seeded em `fase1b_00`

### 7.5 Reconciliação por tenant (tolerância 0)

Para cada `barbershop_id`:
- `#sales` / Σ `total`  
- **`Σ applied_amount = Σ total`** (paid)  
- **`Σ (tendered − applied)` só cash = Σ change / movements `kind=change`**  
- Caixa: applied por método vs movements  
- stock; commissions unique ok  
- intents paid vs aplicados em PG  

### 7.6 Rollback — alinhado a §3.3

- Durante freeze (`cutover_pending`), **antes** do flip: abortar cutover → `active_json`.  
- **Depois** do flip → `active_postgres` (**ponto sem retorno**): **sem** retorno a JSON; redeploy + forward; **não** aplicar intents em JSON.  
- Sem dual-write; sem delete automático de batch pós-cutover; sem estado `readonly_postgres_export`.

### 7.7 Cutover

1. Prep 1.B.0–1.B.6 + 1.B.3-G concluídas; `ops_core=json`.  
2. Freeze `cutover_pending` (**sem** dual-write).  
3. Import/reconcile delta por tenant.  
4. Flip auditado `ops_core` → `active_postgres` = **ponto sem retorno**.  
5. 1.B.7–1.B.9.

### 7.8 Anti-duplicação

`ON CONFLICT`; `imported_from_batch`; proibido apagar batch pós-cutover automaticamente.

---

## 8. Estratégia de testes

| Classe | Conteúdo |
|---|---|
| **Registry** | Tabela canônica; arquivo ignorado se tabela existe; `CORTELY_OPS_REGISTRY`+tabela → fail-fast; sem tabela → all-json; audit; global |
| **Boot pós-cutover + arquivo all-json** | Com tabela `active_postgres`, presença do arquivo seed all-json **não** falha — arquivo ignorado; boot sobe normalmente |
| **Fail-fast ops_core** | Qualquer domínio do conjunto misto → abort |
| **Prep sem cutover** | 1.B.5/1.B.6 prep: createSale/receive OC **não** escrevem PG em prod json |
| **Webhook** | Assinatura; tenant do intent; event_id unique; quarantine sem tenant; reprocessamento; TX 4–6 atômica |
| **1.B.3-G** | paid não cria sale/deposit JSON |
| **createSale pós-ops_core** | Σ applied = total; tendered≥applied; change só cash; 0..2 movements |
| **Troco DDL** | `kind=change` exige `sale_payment_id`; direction=out |
| **Estorno** | Nova linha; sem DELETE destrutivo |
| **Comissão** | Unique (barbershop, sale_item, barber); UNIQUE clawback_of; FK composta |
| **Rollback** | Pós flip `active_postgres`: registry permanece postgres; sem apply intent→JSON |
| **Isolamento tenants** | 3 lojas SQL+API+webhook |
| **ETL** | Idempotente; reconcile por tenant |
| **Infra grants** | anon/authenticated sem acesso a registry/idempotency/map/quarantine |
| **Regressão** | phase0 + fase1a + build |

---

## 9. Riscos técnicos e mitigativas

| Risco | Mitigação |
|---|---|
| Cutover parcial | Unidade `ops_core` na 1.B.3 |
| Env com tabela existente | Fail-fast; arquivo seed ignorado pós-tabela |
| Dual-write / retorno JSON após flip | D1 / §3.3 — ponto sem retorno = `active_postgres` |
| Webhook sem intent | `payment_webhook_quarantine` |
| Troco em cartão / applied ≠ total | Invariantes B1 + testes |
| Comissão duplicada / double clawback | Unique sale_item + UNIQUE clawback_of |
| Grants excessivos em infra | Service role only |
| Merge prematuro 1.B.0 | D11: empilhado a partir de 8ce23b1, sem merge |

---

## 10. Critério de conclusão da Etapa 1.B (global)

- Registry global canônico; `ops_core` em postgres; R=W; audit.  
- JSON ops não escrito em produção.  
- Isolamento ≥ 3 tenants.  
- Σ applied = total; change só cash; estornos compensatórios (nova linha).  
- Gateway: assinatura, event_id, quarantine, TX 4–6.  
- ETL idempotente; reconcile 0/tenant.  
- 1.A intacta; SHOP_ID removido.  
- Sem retorno a JSON após flip para `active_postgres`.

---

## 11. ADR — Adiamento de `units` (D9)

**Status:** Aceito. Não implementar `units` na 1.B; não bloqueia 1.B.8. Revisita pós-1.B.9.

---

## 12. Decisões ainda pendentes

| Pendência | Notas |
|---|---|
| ~~P13~~ | **Fechado:** tabela canônica após seed; arquivo ignorado se tabela existe; `CORTELY_OPS_REGISTRY`+tabela → fail-fast; nunca promovem `active_postgres`; sem tabela → all-json sem criar nada; registry **global** |
| P2 | Status `draft` de sale? |
| P3 | **Mantido (default = bloqueio):** venda com comissão `paid` só pode ser estornada depois do clawback (nova linha). Estorno da venda = 1.B.3; nesta etapa só funções/regras. |
| P4 | Caixa open obrigatório em toda sale `paid`? |
| P5 | **Aberto:** provedor ainda não escolhido (Asaas **ou** Mercado Pago). **1.B.3-G:** só interface `PaymentProvider` + **FakeProvider** (HMAC de teste). Nenhum provedor real / credencial real / chamada externa no CI. |
| P6 | Profundidade do shadow log |
| P7 | Janela reconcile intents |
| P8 | Stock ETL: replay vs opening |
| P9 | Duração do freeze 1.B.3 |
| ~~P10~~ | **Fechado (1.B.3-G):** status `paid` + `paid_at` preenchido; `applied_at NULL` = pago e ainda **não** aplicado (efeito de negócio só na 1.B.3/1.B.7). |
| P11 | `NUMERIC(12,2)` vs centavos `BIGINT` |
| ~~P12~~ | **Fechado (1.B.4):** `UNIQUE (id, barbershop_id)` em `barbers`, `services` e `sale_items`. |
| P14 | Coupons/deposits que afetam venda: incluir em `ops_core` **ou** bloquear o uso até a 1.B.7 — **decidir antes da 1.B.3** |
| ~~P15~~ | **Fechado (1.B.4):** reversão de `pending` = nova linha `status='reversed'` com `reversal_of` → origem; `UNIQUE (reversal_of) WHERE status='reversed'`; payout ignora `pending` que tenham reversão. |
| ~~P16~~ | **Fechado (1.B.3-G):** `payment_webhook_quarantine` com `UNIQUE (provider, provider_event_id) WHERE provider_event_id IS NOT NULL` + `attempts INT` + `last_seen_at`; repetição → `attempts++` (sem nova linha). |
| P17 | `cash_movements` com `kind=sale_cash_in`: `amount = tendered_amount` do `sale_payment` cash correspondente |
| P18 | Escrita de estoque/financeiro só via service role (servidor); revogar de `authenticated` o `EXECUTE` das funções `ops_*`, o `INSERT` em `stock_movements` e o `UPDATE` de `products.stock_qty` — **decidir antes da 1.B.3**. **1.B.2 antecipa só para funções novas de caixa** (`ops_open_cash`, `ops_add_cash_movement`, `ops_cash_conference`, `ops_close_cash`): EXECUTE concedido **somente** a `service_role` (nem `anon` nem `authenticated`). |
| P19 | **ETL (1.B.8):** gerar `cash_movements` `kind='sale_cash_in'` (`amount = tendered_amount`) para cada `sale_payment` cash histórico, para que o esperado do caixa importado bata com o JSON; incluir na reconciliação por tenant. |
| P20 | **Venda (1.B.3):** a função de venda grava, na mesma TX, `sale_cash_in = tendered` e `change = tendered − applied` (se > 0); teste de contrato JSON×PG do caixa esperado com vendas em dinheiro. |
| P21 | **Adapters PG em produção:** como conectam (pooler Supabase, papel dedicado de privilégio mínimo, **nunca** superusuário; pool adequado a serverless) — **decidir antes da 1.B.3**. |
| P22 | **Remover** de `createPaymentIntent` o caminho de credencial global (`MERCADOPAGO_ACCESS_TOKEN` / `ASAAS_API_KEY`) antes de ligar um provedor real (D12) — decidir com a P5. |
| P23 | **ETL comissões legadas (antes da 1.B.8):** JSON tem comissão por venda (não por item) e zera `amount` em estornos — definir mapeamento (rateio por item ou entries legadas marcadas) sem perder histórico. |
| P24 | **Vales no PG:** vale maior que a comissão desconta só até o bruto; saldo do vale continua em aberto (dedução parcial). JSON baixa o vale inteiro (defeito conhecido) — **não muda nesta etapa**. |
| P25 | **JSON `sellPackageToClient` (defeito, não muda nesta etapa):** cria créditos **antes** da venda; se `createSale` falhar (ex.: caixa fechado), cliente fica com créditos sem pagar. Pagamento fixo em Pix. PG: `ops_sell_package` exige venda `paid` com item `package` já existente. |
| P26 | **JSON `consumePackageCredit` (defeito, não muda nesta etapa):** sem `appointment_id`, sem trava; dois consumos simultâneos podem passar do saldo. PG: `FOR UPDATE` + `client_package_consumptions` + unique parcial por agendamento. |
| P27 | **JSON `subscribeClient` (defeito, não muda nesta etapa):** cria assinatura sem cobrança. Cobrança recorrente depende da P5 — fora desta etapa. |
| P28 | **Pacote multi-unidade:** `ops_sell_package` exige `sale_items.quantity = 1` para o item `package` (`PACKAGE_QUANTITY_UNSUPPORTED`). Venda de N pacotes na mesma linha fica para depois do cutover. |
| P29 | **JSON receivable de OC (defeito, não muda):** conta a pagar do recebimento liga-se à OC só pelo texto da descrição. PG: `payables.purchase_order_id` FK + UNIQUE parcial. |
| P30 | **JSON payables (defeito, não muda):** `upsertPayable` edita conta paga; `payPayable` re-paga. PG: trigger só `open→paid` / `open→canceled`; `ops_pay_payable` 409 se já paga. |
| P31 | **Pagamento de conta × caixa:** decidir antes da 1.B.3 se pagar conta “em dinheiro” gera `cash_movements kind='manual_out'` vinculado ou só banco — **aberto**. |

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
| `config/ops-registry.json` (planejado) | seed inicial do registry |

## Apêndice B — Limites desta autorização documental

- Não implementa código/adapters/testes funcionais.  
- Não cria nem aplica migrations.  
- Não altera Supabase remoto / produção.  
- Não remove JSON.  
- Não faz merge/publish/deploy.  
- **Não inicia 1.B.0** até aprovação formal. Quando autorizada, 1.B.0 parte de **`8ce23b1`** em PR empilhado (**sem merge** automático).

---

**Próximo passo:** aprovação formal humana. Somente após autorização explícita iniciar **1.B.0** (branch desde `8ce23b1` + `fase1b_00` registry + OpsRepository + fail-fast), sem merge até novo OK humano.
