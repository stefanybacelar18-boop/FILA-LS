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
| D1 | **Após cutover de um domínio (ou conjunto), PostgreSQL é a fonte oficial.** Não há retorno automático PG→JSON. Rollback de aplicação **preserva** todos os dados já gravados no PG. Retorno excepcional a JSON: (1) PG **somente leitura** no grafo → (2) exportar e reconciliar escritas pós-cutover para JSON → (3) só então virar o registry do **grafo inteiro**. **Sem janela de dual-write.** Ver §3.3 (ponto sem retorno e pagamentos já capturados). |
| D2 | **Registry versionado** (config e/ou tabela) indica a fonte oficial (`json` \| `postgres`) e o **estado** de cada domínio. R e W **nunca** divergem. Dual-write e bridges JSON↔PG em fluxos financeiros **proibidos**. Mudanças de registry são **auditadas**. Ver §3.2. |
| D3 | **Grafo de vendas** (`sales` + `products`/`stock` + `cash` + `commissions` accrual) é **uma única unidade de cutover**. Idem OC (`purchasing`+`stock`+`payables`). Proibida execução financeira partida JSON+PG. |
| D3a | **Prep ≠ cutover.** Schema/adapters/testes em PG sem alterar fonte oficial em produção. Enquanto `sales=json`, `products`/`stock`/`cash`/`commissions` (accrual) permanecem `json` em produção. |
| D3b | **Fail-fast no boot:** combinações inválidas de registry **impedem** boot/execução — zero side-effects. |
| D4 | Venda, pagamento (split permitido) e movimento de caixa são entidades **separadas**. Troco = movimento de **saída** de caixa ligado ao pagamento em dinheiro. Invariante: **`Σ pagamentos − troco = total`**. Valores em `NUMERIC(12,2)` (ou centavos inteiros, decisão P11). Estornos = **lançamentos compensatórios** — **sem** `UPDATE`/`DELETE` destrutivo do histórico. Ver §4.2. |
| D5 | Multi-tenant: FKs **compostas** com `barbershop_id` (tenant); backfill → UNIQUE → FK → índices → RLS FORCE; preservar 1.A. |
| D6 | Comissão paga: bloquear estorno da venda até clawback (default). Estornos/clawbacks = linhas compensatórias; **preservam** amounts originais; **idempotentes**; chave única anti-duplicidade. |
| D7 | Gateway: `payment_intents` com `barbershop_id NOT NULL`, RLS, FKs compostas; webhook com assinatura **antes** de qualquer escrita; tenant derivado do **intent registrado** (nunca do payload); `UNIQUE (provider, provider_event_id)`; eventos inválidos → **quarentena**. Antecipação `payment_intents=postgres` só em modo isolado (1.B.3-G). |
| D8 | Tenant da sessão desde **1.B.0**. `SHOP_ID` só em legado JSON + ETL até 1.B.9. |
| D9 | **`units` adiadas** — ADR §11. |
| D10 | Comissões: constraints anti-duplicidade (NULLS); FKs tenant em rules/entries/advances; ETL idempotente com `ops_shop_id_map` e reconciliação **por tenant**. |

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

**Acoplamento atual (relevante a D3):** `createSale` no JSON lê `currentCash()`, grava `cash_session_id`, items/payments, chama `adjustStock` e `accrueCommission`. `refundSale` devolve estoque. `appointment.completed` pode `openCash` + `createSale`. `receivePurchaseOrder` move estoque e cria payable. Esses grafos **não** admitem fonte oficial mista.

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

commission_rules/entries, staff_advances, goals, client_packages, subscription_plans/client_subscriptions, coupons, deposits, purchase_orders(+items), payment_intents, payment_webhook_events, ops_idempotency_keys, ops_shop_id_map, ops_domain_registry (+ audit); **units adiadas (ADR)**.

### 2.6 Grafos transacionais (conjuntos de cutover — D3)

**Grafo Venda — única unidade de cutover (obrigatório):**
```
createSale / refundSale / appointment.completed(venda)
  → sales + sale_items + sale_payments
  → stock (adjustStock) + products.qty
  → cash_sessions / cash_movements (incl. troco como saída)
  → commission_entries (accrual)
  → ops_audit_log (+ cupom se houver)
```
Domínios que flippam **juntos**: `sales`, `products`, `stock`, `cash`, `commissions` (accrual na TX).

**Grafo OC (cutover conjunto obrigatório):**
```
receivePurchaseOrder → purchasing (OC) + stock + payables
```
Após o grafo Venda, `stock` já é `postgres`; cutover OC flipa `purchasing`+`payables` no mesmo go-live.

**Grafo Pacote:** `sellPackageToClient` → packages + conjunto Venda.

**Grafo Gateway (antecipável isolado — 1.B.3-G):**
```
payment_intents + payment_webhook_events
  → atualiza APENAS intent/evento em PG
  → NÃO cria/atualiza sales, deposits, cash, stock enquanto json
```

Qualquer fluxo **só** executa com fonte homogênea no seu grafo; senão **fail-fast** (D3b).

---

## 3. Arquitetura PostgreSQL proposta

### 3.1 Princípios

1. PostgreSQL = fonte oficial após **cutover** do conjunto (D1).  
2. `barbershop_id` só da sessão em código novo desde 1.B.0 (D8).  
3. RLS 1.A (ENABLE+FORCE) + RBAC; service role com filtro de tenant.  
4. Transações nos grafos D3; FKs compostas `(id, barbershop_id)`.  
5. Idempotência: `ops_idempotency_keys`, uniques parciais, `provider_event_id`.  
6. Concorrência: `FOR UPDATE`, unique cash open, `UPDATE stock WHERE qty >= n`.  
7. Auditoria: `ops_audit_log` + **auditoria de mudanças do registry**.  
8. Gateway: assinatura → resolve intent → tenant do intent → escrita idempotente (D7).  
9. Prep sem flip de produção (D3a).  
10. Valores monetários: `NUMERIC(12,2)` (alternativa: centavos `BIGINT` — P11).

### 3.2 Registry — fonte oficial versionada (D2 / P1)

Arquitetura **obrigatória** para 1.B.0. O registry indica, por domínio: **fonte** (`json` \| `postgres`) e **estado**.

#### 3.2.1 Representação (config versionada + tabela)

| Camada | Papel |
|---|---|
| **Arquivo versionado** `cortely/config/ops-registry.json` e/ou env `CORTELY_OPS_REGISTRY` | Bootstrap / override de deploy; mesmo schema |
| **Tabela `ops_domain_registry`** | Fonte canônica em runtime após 1.B.0 (seed a partir do arquivo no primeiro boot) |
| **Tabela `ops_domain_registry_audit`** | Toda mudança: quem, quando, de→para, conjunto (`sale_graph`…), motivo, fingerprint |

Schema lógico por domínio:

```text
ops_domain_registry (
  domain TEXT PRIMARY KEY,           -- lista fechada abaixo
  source TEXT NOT NULL CHECK (source IN ('json','postgres')),
  state TEXT NOT NULL CHECK (state IN (
    'active_json',                   -- produção na fonte json
    'prep_pg',                       -- schema/adapters/testes; produção ainda json
    'cutover_pending',               -- freeze / export em andamento
    'active_postgres',               -- fonte oficial = postgres
    'readonly_postgres_export'       -- rollback excepcional: PG só leitura
  )),
  cutover_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NULL
)
```

**Domínios:** `products`, `stock`, `cash`, `sales`, `commissions`, `packages`, `purchasing`, `payables`, `receivables`, `coupons`, `deposits`, `campaigns`, `waitlist`, `reviews`, `fiscal`, `payment_intents`.

Env sobrescreve arquivo no boot **somente** se passar na validação de grafos; em seguida persiste/atualiza a tabela + linha de audit.

#### 3.2.2 Valores padrão

| Ambiente | Default |
|---|---|
| Produção (boot 1.B.0) | Todos `source=json`, `state=active_json` |
| Demo / unit sem PG | Todos `json` / `active_json` |
| CI/staging prep | Subconjuntos `postgres` + `prep_pg` **só** se grafos homogêneos |

Omitir domínio = `json` / `active_json`. Sem default implícito `postgres`.

#### 3.2.3 Validação no boot (fail-fast)

1. Carregar arquivo/env → merge → ler/seed `ops_domain_registry`.  
2. Validar `source`/`state`/domínios conhecidos.  
3. Avaliar **conjuntos** (todos `json` ou todos `postgres` na fonte efetiva):

| Conjunto | Domínios homogêneos obrigatórios |
|---|---|
| **`sale_graph`** | `sales`, `products`, `stock`, `cash`, `commissions` |
| **`oc_graph`** | `purchasing`, `stock`, `payables` |
| **`package_graph`** | `packages` + `sale_graph` |
| **`deposit_effect`** | `deposits` (+ `sales`/`cash` se efeito financeiro ligado) |

4. Grafo partido → **abortar boot** (exit ≠ 0). Em request: erro estruturado, **zero** side-effects.  
5. Logar fingerprint (hash do mapa) + versão do audit.

#### 3.2.4 Combinações inválidas (exemplos)

| Configuração | Resultado |
|---|---|
| `sales=json` + (`stock`\|`cash`\|`products`\|`commissions`)=`postgres` | **Rejeitada** |
| `sales=postgres` + qualquer do grafo ainda `json` | **Rejeitada** |
| `purchasing=postgres` + (`payables`\|`stock`)=`json` | **Rejeitada** |
| Flip de um domínio isolado do `sale_graph` | **Rejeitada** |
| `payment_intents=postgres` + efeitos em sales/deposits `json` | OK **só** em modo isolado 1.B.3-G (efeitos desligados) |

#### 3.2.5 R = W; sem dual-write; flip só por conjunto

- `source(domain)` único para read e write.  
- Sem `readSource`/`writeSource` separados.  
- API interna de cutover aceita **apenas** conjuntos nomeados (`sale_graph`, `oc_graph`, …); aplica todos os domínios na **mesma** transação de registry + **uma** linha de audit por flip.  
- Sem API pública de flip parcial.  
- **Sem janela de dual-write** em nenhum cutover ou rollback.

### 3.3 Rollback e ponto sem retorno (D1 + D2)

**Invariantes:** R=W; sem dual-write; sem apagar batch pós-cutover automaticamente; troca de fonte só por grafo completo.

#### 3.3.1 Procedimento excepcional PG → JSON (sem dual-write)

Ordem **obrigatória**:

1. **Congelar escritas** do grafo (maintenance / feature flag).  
2. Marcar domínios do grafo: `state=readonly_postgres_export` (PG **somente leitura**).  
3. **Exportar** delta pós-`cutover_at` (e batches ativos) do PG.  
4. **Reconciliar** no snapshot JSON (tolerância 0) + validação humana.  
5. **Só então** virar registry do grafo inteiro → `source=json`, `state=active_json` (auditada).  
6. Dados PG **permanecem** como histórico — **proibido** `TRUNCATE`/`DELETE` em massa do batch.

#### 3.3.2 Ponto sem retorno

| Momento | Significado |
|---|---|
| **Antes** do flip `sale_graph` → `postgres` | Rollback de release simples; batches de import sem tráfego pós-import podem ser descartados com procedimento controlado |
| **Após** flip `sale_graph` → `active_postgres` e existência de **qualquer** escrita operacional ou intent `paid` aplicado | **Ponto sem retorno operacional**: retorno a JSON só via §3.3.1 (export+reconcile+flip de grafo). Release rollback **não** pode apontar R→JSON sem esse procedimento |

#### 3.3.3 Pagamentos já capturados (gateway)

| Situação no rollback excepcional | Tratamento |
|---|---|
| Intent `paid` **já aplicado** a sale/deposit em PG | Incluir no export delta; reconciliar no JSON **antes** do flip; não “desfazer” captura no provedor automaticamente |
| Intent `paid` **ainda não aplicado** (`paid_unapplied` / `applied_at` NULL) | Manter em PG; após flip do grafo Venda (ou no retorno a JSON), aplicar na fonte oficial coerente — **nunca** bridge parcial |
| Intent `pending` | Continua no PG; webhooks seguem regras §4.6 (tenant do intent, assinatura, idempotência) |
| Chargeback / estorno no provedor | Lançamentos compensatórios na fonte oficial vigente; audit; sem apagar intent/eventos |

| Situação | Permitido | Proibido |
|---|---|---|
| Bug UI | Corrigir app; PG permanece | Truncar para “voltar” |
| Rollback de release pós-cutover | Redeploy **mantendo** registry `postgres` coerente | R≠W; dual-write |
| Desfazer import pré-cutover | Só batch sem tráfego pós-import e antes do flip | Apagar pós-cutover automaticamente |

### 3.4 Isolamento / camadas

```
Browser → API Next.js (session + RBAC + tenant bind)
       → OpsRepository(registry + fail-fast graphs)
       → Postgres | JSON legado (uma fonte R+W por domínio)
       → payment_intents + webhook (assinatura → intent → tenant)
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
sale_payments 1──0..1 cash_movements (troco / entrada cash)
payment_intents *──? sales | appointments | deposits
payment_intents 1──* payment_webhook_events
```

### 4.2 Venda, pagamento, caixa e troco (D4)

**Entidades separadas (obrigatório):**

| Entidade | Papel |
|---|---|
| **`sales`** | Cabeçalho: itens, `subtotal`, `discount`, `tip`, `total`, status |
| **`sale_payments`** | Meios de pagamento (split permitido): `method`, `amount` (valor **aplicado** à venda) |
| **`cash_movements`** | Movimentos de caixa da sessão: entrada (recebimento cash) e **saída (troco)** |

**`sales.status`:** `draft?` (P2) \| `pending_payment` \| `paid` \| `canceled` \| `refunded`.  
`pending_payment` **nunca** baixa estoque definitivo nem comissiona como paid.

**Troco:**
- Troco **não** é “campo solto” sem lastro: é um **`cash_movements`** de **saída** (`direction=out`, `reason=change`) ligado ao `sale_payment` em dinheiro que o originou (`sale_payment_id` NOT NULL).  
- Opcionalmente denormalizar `sales.change_due` para leitura; a fonte de verdade do efeito em caixa é o movimento.

**Invariante monetário (obrigatório):**

```
Σ sale_payments.amount − change_due = sales.total
```

Equivalente: `Σ amount_applied = total` e `change_due = Σ (tendered_cash − applied_cash)` ≥ 0.  
Cartão/PIX: em geral sem troco (`tendered = applied`). Split: vários `sale_payments`; só meios cash-like geram movimento de troco.

**Tipos numéricos:** todos os valores monetários em `NUMERIC(12,2)` **ou** centavos `BIGINT` (P11 — escolher um e padronizar). Sem `float`.

**Estornos / cancelamentos (append-only financeiro):**
- **Proibido** `UPDATE`/`DELETE` que apague ou zere histórico de payments, movements ou commission amounts.  
- Estorno = **lançamentos compensatórios** (novas linhas: sale→`refunded`, payments/movements/stock/commissions de reversão) + audit.  
- Idempotência via `ops_idempotency_keys` / unique parcial.

**Fechamento de caixa:**
- Receita por método = Σ `sale_payments.amount` das sales `paid` da sessão.  
- Dinheiro em gaveta ≈ entradas cash − saídas de troco ± movimentos manuais.  
- Aceite: cash + split + close **sem** divergência.

### 4.3 Sequência multi-tenant e FKs compostas (D5 / integridade)

Ordem **obrigatória** (preserva 1.A):

1. `ADD COLUMN barbershop_id UUID NULL` nas tabelas filhas.  
2. Backfill a partir do pai; quarentenar órfãos.  
3. Zero NULL → `SET NOT NULL`.  
4. `UNIQUE (id, barbershop_id)` no pai.  
5. `FOREIGN KEY (parent_id, barbershop_id) REFERENCES parent (id, barbershop_id)`.  
6. Índices `(barbershop_id)`, `(barbershop_id, parent_id)`.  
7. Policies tenant + EXISTS mesmo shop; ENABLE+FORCE; grants 1.A.  
8. Suite SQL A×B + asserts FK cruzada + **testes de isolamento entre tenants**.

Aplicar o mesmo padrão a: `sale_items`, `sale_payments`, `cash_movements`, `commission_*`, `staff_advances`, `payment_intents`, `payment_webhook_events`, etc.

### 4.4 DDL proposto — comissões (D10) + chave única anti-duplicidade

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
-- UNIQUE NULLS NOT DISTINCT (barbershop_id, barber_id, service_id)  -- PG 15+

commission_entries (
  id UUID PK,
  barbershop_id UUID NOT NULL,
  barber_id UUID NOT NULL,
  sale_id UUID NOT NULL,
  amount NUMERIC(12,2) NOT NULL,   -- original; NÃO zerar
  basis NUMERIC(12,2) NOT NULL,
  percent NUMERIC(5,2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','paid','reversed','clawback')),
  created_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ NULL,
  reversed_at TIMESTAMPTZ NULL,
  clawback_of UUID NULL REFERENCES commission_entries(id),
  payout_batch_id UUID NULL,
  FOREIGN KEY (sale_id, barbershop_id) REFERENCES sales (id, barbershop_id),
  FOREIGN KEY (barber_id, barbershop_id) REFERENCES barbers (id, barbershop_id)
)
-- UNIQUE parcial anti-duplicidade:
--   (barbershop_id, sale_id, barber_id) WHERE status IN ('pending','paid')
-- Reverse/clawback = nova linha ou transição de status; amounts históricos preservados

staff_advances (
  id UUID PK,
  barbershop_id UUID NOT NULL REFERENCES barbershops(id),
  barber_id UUID NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','deducted','canceled')),
  created_at TIMESTAMPTZ NOT NULL,
  deducted_at TIMESTAMPTZ NULL,
  FOREIGN KEY (barber_id, barbershop_id) REFERENCES barbers (id, barbershop_id)
)
```

Se `barbers`/`services` ainda não tiverem `UNIQUE (id, barbershop_id)`, migration auxiliar **antes** das FKs (P12).  
RLS ENABLE+FORCE; REVOKE anon.

### 4.5 Política de comissão no estorno (D6)

| Estado | Política |
|---|---|
| `pending` | Compensação: status `reversed` (ou linha compensatória); preservar `amount`/`basis`/`percent` |
| `paid` | **Bloquear** refund da venda até clawback liquidado (default P3); clawback = linha nova `clawback` — **sem** zerar amount da entry paga |
| `reversed`/`clawback` | Idempotente: reaplicar não duplica ativos nem altera histórico |

Código JSON atual (zerar amount) **não** será reproduzido. Payout/clawback via idempotency keys.

### 4.6 `payment_intents`, webhooks e quarentena (D7)

```text
payment_intents (
  id UUID PK,
  barbershop_id UUID NOT NULL REFERENCES barbershops(id),  -- tenant_id NOT NULL
  provider TEXT NOT NULL,
  provider_ref TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL CHECK (status IN ('pending','paid','failed','canceled')),
  purpose TEXT NOT NULL CHECK (purpose IN ('sale','deposit','appointment','other')),
  appointment_id UUID NULL,
  sale_id UUID NULL,
  deposit_id UUID NULL,
  applied_at TIMESTAMPTZ NULL,
  idempotency_key TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (provider, provider_ref),
  UNIQUE (barbershop_id, idempotency_key),  -- onde key NOT NULL
  FOREIGN KEY (appointment_id, barbershop_id) REFERENCES appointments (id, barbershop_id),
  FOREIGN KEY (sale_id, barbershop_id) REFERENCES sales (id, barbershop_id),       -- quando sales=postgres
  FOREIGN KEY (deposit_id, barbershop_id) REFERENCES deposits (id, barbershop_id) -- quando deposits=postgres
)
-- RLS ENABLE+FORCE por barbershop_id

payment_webhook_events (
  id UUID PK,
  barbershop_id UUID NOT NULL,              -- copiado do intent registrado; NUNCA do payload
  payment_intent_id UUID NOT NULL,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processed','duplicate','quarantined')),
  raw_payload JSONB NOT NULL,
  error_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (provider, provider_event_id),     -- idempotência de evento
  FOREIGN KEY (payment_intent_id, barbershop_id)
    REFERENCES payment_intents (id, barbershop_id)
)
-- RLS ENABLE+FORCE; eventos quarantined não disparam efeitos de negócio
```

#### Pipeline do webhook (ordem fixa)

1. **Validar assinatura** do provedor — **antes de qualquer escrita**. Falha → HTTP 4xx/401, **zero** write (ou só log externo fora do domínio ops).  
2. Extrair `provider_event_id` + referência do intent; **lookup do `payment_intents` já registrado**.  
3. **`barbershop_id` / tenant = do intent registrado** — **nunca** confiar em tenant/shop do payload.  
4. `INSERT payment_webhook_events` com `UNIQUE (provider, provider_event_id)` — replay = `duplicate`, sem reaplicar efeitos.  
5. Payload inválido, intent inexistente, tenant inconsistente, assinatura ok mas schema quebrado → `status=quarantined` + `error_reason`; **sem** efeitos financeiros.  
6. Só então atualizar status da intent; efeito de negócio (sale/deposit/caixa) **somente** se registry do grafo permitir fonte única (senão fail-fast / `paid` sem aplicar — P10).

`simulated` **nunca** `paid`.

#### Limites 1.B.3-G (pré-cutover Venda)

| Permitido | Proibido |
|---|---|
| Criar intent `pending` em PG | Criar/atualizar **vendas** ou **depósitos** em JSON |
| Webhook: assinatura → evento idempotente → status da intent | Efeitos financeiros parciais (caixa, stock, comissão) |
| Quarentena de inválidos | Bridges intent(PG) → opsStore(JSON) |
| Consulta admin do status | Qualquer multi-fonte — fail-fast, zero side-effects fora de intents/events |

### 4.7 Outras tabelas planejadas

purchase_orders(+items), client_packages, subscription_plans/client_subscriptions, coupons, deposits, goals, ops_idempotency_keys, ops_shop_id_map, ops_migration_rejects, ops_domain_registry, ops_domain_registry_audit.

### 4.8 Migrations planejadas (repo only — **não criar/aplicar nesta autorização**)

1. `fase1b_01` — sale tenant columns + FK composta + RLS  
2. `fase1b_02` — sales/cash enrichment (tip, cancel, payments/troco como movement, counted_by_method)  
3. `fase1b_03` — commissions + advances + unique parcial + FKs tenant  
4. `fase1b_04` — packages/subscriptions  
5. `fase1b_05` — purchase_orders  
6. `fase1b_06` — coupons, deposits, payment_intents, payment_webhook_events  
7. `fase1b_07` — idempotency + registry tables + audit grants  
8. `fase1b_08` — concurrency (cash open unique, stock checks)

Cada uma: ENABLE+FORCE, `relforcerowsecurity`, grants 1.A.  
Prep/CI **não** implica flip de registry em produção.

---

## 5. SHOP_ID e tenant (D8)

| Contexto | Comportamento |
|---|---|
| Código novo desde **1.B.0** | `session.barbershop_id` — **nunca** constant |
| JSON legado / seed demo | Constant `11111111-…-111` permitido |
| ETL 1.B.8 | `ops_shop_id_map(legacy_id → barbershop_id)`; órfãos → quarentena |
| Webhook | Tenant **só** do intent registrado |
| **1.B.9** | Remover constant e writes JSON ops em prod |

---

## 6. Subetapas 1.B.0–1.B.9 (versão consolidada)

**Princípio:** prep em PG sem mudar fonte oficial em produção. Cutover = flip auditado do **conjunto** D3. Sem dual-write.

| Subetapa | Tipo | Escopo | Dependências | Critérios de aceite | Riscos |
|---|---|---|---|---|---|
| **1.B.0** | Prep | `OpsRepository` + registry (§3.2) + fail-fast + audit de mudanças + tenant session | 1.A | Default json; boot rejeita grafos partidos; R=W; flip só por conjunto; audit gravada; SHOP_ID ausente em código novo | Registry mal configurado |
| **1.B.1** | Prep | products + stock_movements + inventory_counts (schema/adapters/testes) | 1.B.0 | CI/staging PG OK; **prod json**; createSale ainda JSON | Flip stock cedo |
| **1.B.2** | Prep | cash_sessions + cash_movements (unique open, FOR UPDATE, troco como saída) | 1.B.1 | Testes caixa CI; **prod cash=json** | Flip cash cedo |
| **1.B.3-G** | Gateway isolado | intents + webhook (assinatura, event_id, tenant do intent, quarentena) | 1.B.0 + mig | Assinatura antes de write; unique event; zero sales/deposits JSON; quarantine | Ligar efeitos cedo |
| **1.B.3** | **Cutover `sale_graph`** | Flip atômico: sales+products+stock+cash+commissions → postgres; createSale/refund/troco/compensatórios; ligar intents aplicados | 1.B.1–2, 1.B.3-G, D4/D5 | Um flip; Σ pagamentos − troco = total; append-only estorno; RLS A×B; isolamento 3 tenants | Cutover parcial |
| **1.B.4** | Cutover payout | Payout + advances + D6 | 1.B.3 | Unique comissões; clawback compensatório; refund bloqueado se paid | Double pay |
| **1.B.5** | Packages | packages + completed no backend PG | 1.B.3 | Sem write JSON ops | Pacote+venda |
| **1.B.6** | Cutover `oc_graph` | purchasing+payables (stock já pg) mesmo go-live | 1.B.3 | Sem fontes divididas | Flip só OC |
| **1.B.7** | Restante leve | receivables, coupons, deposits (só registry coerente), campaigns, waitlist, reviews, fiscal | 1.B.3, 1.B.3-G | Deposit só intent paid + grafo OK | Bridge |
| **1.B.8** | ETL + harden | ETL idempotente + map IDs + reconcile **por tenant**; registry ops postgres; JSON backup RO | anteriores + D1 | Reconcile 0/tenant; PG preservado | Truncate |
| **1.B.9** | Limpeza | Remover SHOP_ID; ADR units | 1.B.8 | Multi-tenant ops real | — |

**WhatsApp:** fora desta etapa.

### Sequência de cutover (produção)

```
[Prep 1.B.0 → 1.B.1 → 1.B.2 → 1.B.3-G*]  sale_graph = json
        * payment_intents podem ser postgres isolados
        ↓
[1.B.3] flip auditado sale_graph → postgres   ← ponto sem retorno operacional
        ↓
[1.B.4 → 1.B.5] payout / packages
        ↓
[1.B.6] flip oc_graph (purchasing+payables; stock já postgres)
        ↓
[1.B.7 → 1.B.8 → 1.B.9]
```

### Critérios transversais de aceite

1. Typecheck + build + security 1.A (quando CI aplicável).  
2. Nenhuma rota aceita `barbershop_id` do cliente para escopo.  
3. Registry R=W; fail-fast; flip só por conjunto; mudanças auditadas.  
4. Sem dual-write; sem bridges.  
5. Prep não altera fonte oficial (exceto intents isolados).  
6. Sem apply remoto de migrations sem autorização.  
7. Revisão humana: **1.B.3-G, 1.B.3, 1.B.4, 1.B.6, 1.B.8**.  
8. Rollback: PG RO → export/reconcile → flip grafo; pagamentos capturados tratados (§3.3).  
9. Isolamento multi-tenant testado (SQL+API, ≥ 3 lojas).

---

## 7. Plano de migração JSON → PostgreSQL

### 7.1 Backup

Snapshot JSON + SHA-256; `pg_dump`/PITR; `migration_batch_id`.

### 7.2 ETL idempotente (integridade)

- Parser `OpsSnapshot`; **`ops_shop_id_map`** (legacy → `barbershop_id`).  
- Import **por tenant** (loop/barreira por `barbershop_id`).  
- `ON CONFLICT` / `imported_from_batch`; segundo import só `--force` + novo batch.  
- Rejeitos → `ops_migration_rejects` (quarentena).  
- Reexecução do mesmo batch **não** duplica linhas (idempotente).

### 7.3 Dedup / validação

Unique por id; sales com `Σ payments − change ≠ total` → quarentena; comissões violando unique parcial → rejeito.

### 7.4 Import TX — ordem por FKs

1. `ops_shop_id_map` / tenants (`barbershops`, `barbers`, `services`, `clients`, `appointments`)  
2. `products`, `suppliers`  
3. packages / subscription_plans  
4. `cash_sessions`  
5. `sales`  
6. `sale_items`, `sale_payments`  
7. `cash_movements` (incl. troco → `sale_payment_id`)  
8. `stock_movements`, `inventory_counts`  
9. `commission_rules` → `commission_entries`  
10. `staff_advances`  
11. `purchase_orders`(+items) → `payables` / `receivables`  
12. `coupons`, `deposits`, client_packages/subscriptions  
13. `payment_intents` → `payment_webhook_events`  
14. campaigns, waitlist, reviews, fiscal, `ops_audit_log`  
15. `ops_idempotency_keys` / rejects / registry seed

Stock: replay movements **ou** opening balance (P8).

### 7.5 Reconciliação por tenant (tolerância 0)

Para **cada** `barbershop_id`:
- `#sales` / Σ `total`  
- `Σ payments.amount − Σ change = Σ total` (paid)  
- Caixa: applied por método vs movimentos (entradas − troco)  
- `stock_qty`; commissions pending/paid (unique ok)  
- intents paid vs aplicados  

### 7.6 Rollback — ver §3.3

PG RO → export delta → reconcile JSON → flip grafo; sem dual-write; sem delete de batch pós-cutover.

### 7.7 Cutover

1. Prep 1.B.1–1.B.2–1.B.3-G; `sale_graph` ainda json.  
2. Freeze (**sem** dual-write).  
3. Import/reconcile delta **por tenant**.  
4. Flip auditado `sale_graph` → postgres.  
5. Monitor; ponto sem retorno (§3.3.2); ligar aplicação de intents.  
6. Demais cutovers; 1.B.8 residual + JSON RO backup.

### 7.8 Anti-duplicação

`ON CONFLICT (id)`; `imported_from_batch`; **proibido** apagar automaticamente batch pós-cutover.

---

## 8. Estratégia de testes

| Classe | Conteúdo |
|---|---|
| **Registry** | R=W; grafos legais; defaults json; flip parcial rejeitado; **audit** de mudança |
| **Fail-fast** | `sales=json`+`stock=postgres` → boot/fluxo aborta; zero side-effects |
| **Prep sem cutover** | createSale não escreve PG stock/cash |
| **Webhook** | Assinatura inválida → zero write; tenant do intent; `UNIQUE (provider, provider_event_id)`; quarantine |
| **1.B.3-G isolado** | `paid` não cria sale/deposit JSON |
| **createSale pós-1.B.3** | Writes só PG; Σ payments − troco = total |
| **Troco** | `cash_movements` out ligado ao payment cash; split OK |
| **Estorno append-only** | Compensatórios; sem DELETE/UPDATE destrutivo; amounts preservados |
| **Comissão unique** | Não duplica (sale, barber) ativo; clawback idempotente |
| **Isolamento tenants** | 3 lojas: SQL A×B, API, FK cruzada, webhook tenant |
| **ETL** | Idempotente; map IDs; reconcile por tenant = 0 |
| **Rollback procedimental** | PG RO → export → flip; sem dual-write |
| **Concorrência** | caixa unique; stock 409 |
| **Regressão** | phase0 + fase1a + build |

Ambiente: Postgres service (CI 1.A) + seeds 3 tenants.

---

## 9. Riscos técnicos e mitigativas

| Risco | Mitigação |
|---|---|
| Ops JSON em prod | Cutover conjunto `sale_graph`; alertas |
| Flip parcial vendas/estoque/caixa/comissões | Unidade única D3; API de conjuntos; fail-fast |
| Dual-write / R≠W | D2; §3.2; §3.3 |
| Webhook sem assinatura / tenant do payload | Pipeline §4.6 |
| Replay de evento | `UNIQUE (provider, provider_event_id)` |
| Troco como receita | Troco = movimento de saída |
| Estorno destrutivo | Append-only compensatório |
| Comissão duplicada | Unique parcial |
| ETL cross-tenant | Map + reconcile por tenant |
| Rollback apagando PG | §3.3 — proibido |
| Pagamentos capturados no retorno a JSON | Export/reconcile antes do flip (§3.3.3) |
| Units / WhatsApp | Fora de escopo |

---

## 10. Critério de conclusão da Etapa 1.B (global)

- Registry versionado com fonte+estado; R=W; grafos homogêneos; mudanças auditadas.  
- JSON ops não escrito em produção.  
- Isolamento ≥ 3 barbearias (SQL+API+webhook).  
- `sale_graph` e `oc_graph` sem fontes mistas.  
- ETL idempotente; reconcile 0 **por tenant**; `Σ payments − troco = total`.  
- Gateway: assinatura, event_id único, tenant do intent, quarentena.  
- Estornos compensatórios; comissões sem duplicidade.  
- 1.A intacta; SHOP_ID removido (1.B.9).  
- Nenhum batch pós-cutover apagado automaticamente.

---

## 11. ADR — Adiamento de `units` (D9)

**Status:** Aceito.  
**Contexto:** `units` no JSON ops sem tabela/RLS; multi-tenant = `barbershops`.  
**Decisão:** Não implementar `units` na 1.B; não bloqueia 1.B.8.  
**Revisita:** pós-1.B.9 se houver requisito comercial.

---

## 12. Decisões ainda pendentes

| Pendência | Notas |
|---|---|
| P2 | Status `draft` de sale? |
| P3 | Clawback automático vs só bloqueio (default = **bloqueio**) — 1.B.4 |
| P4 | Caixa open obrigatório em toda sale `paid`? |
| P5 | Provider(s) webhook (MP/Asaas) e segredos |
| P6 | Profundidade do shadow log (fora do registry audit) |
| P7 | Janela do job reconcile de intents |
| P8 | Stock ETL: replay vs opening balance |
| P9 | Duração do freeze no cutover 1.B.3 |
| P10 | `paid_unapplied` vs `paid` + `applied_at` |
| P11 | `NUMERIC(12,2)` vs centavos `BIGINT`; nomes tendered/applied |
| P12 | `UNIQUE (id, barbershop_id)` em `barbers`/`services` antes das FKs |
| P13 | Precedência final arquivo vs tabela quando divergirem após 1.B.0 (default proposto: tabela vence após seed; env só com flag de emergência auditada) |

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
| `config/ops-registry.json` (planejado) | registry versionado (bootstrap) |

## Apêndice B — Limites desta autorização documental

- Não implementa código/adapters/testes funcionais.  
- Não cria nem aplica migrations.  
- Não altera Supabase remoto / produção.  
- Não remove JSON.  
- Não faz merge/publish/deploy.  
- **Não inicia 1.B.0** até aprovação formal humana deste plano consolidado.

---

**Próximo passo:** aprovação formal humana deste documento consolidado. Somente após autorização explícita iniciar **1.B.0** (registry versionado + OpsRepository + fail-fast + audit).
