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
| D1 | **Após cutover de um domínio, PostgreSQL é a fonte oficial.** Não há retorno automático PG→JSON. Rollback de aplicação **preserva** todos os dados já gravados no PG. Retorno excepcional a JSON exige exportação do delta + reconciliação + validação integral; **proibido** `TRUNCATE`/delete destrutivo do batch pós-cutover. |
| D2 | **Registry por domínio:** uma única fonte oficial de **leitura e escrita** por domínio. Dual-write operacional **proibido**. Shadow logging apenas auditoria (não é segunda fonte). |
| D3 | **Operações cruzadas** (venda ↔ estoque ↔ caixa ↔ pagamentos ↔ comissões) só migram quando **todas** as dependências transacionais do fluxo estiverem em PG. Proibida execução financeira partida JSON+PG. |
| D4 | Estados explícitos de venda/pagamento; pendente **nunca** conta como pago; descontos, gorjetas, troco, cancelamentos e estornos modelados. |
| D5 | Multi-tenant: sequência segura backfill → UNIQUE → FK composta → índices → RLS; preservar controles 1.A (FORCE RLS, helpers, grants). |
| D6 | Comissão já **paga**: política **bloquear estorno da venda** até clawback/estorno de payout (ou clawback automático em TX dedicada) — ver §8. |
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
| Ops PDV (caixa, vendas, estoque, financeiro, comissões, pacotes, marketing, etc.) | JSON `ops` (`opsStore`) | **ainda JSON `ops`** | Postgres oficial por domínio (registry) |
| Auth staff | HMAC + demo staff | Supabase Auth + `profiles` + `session_generation` (1.A) | Intacta |
| OTP / client proof / revoke | memória (± SQL) | memória + SQL | Endurecer; sem JSON |

**Risco crítico:** `ops-store.ts` não consulta `isDemoMode()` nem Supabase. Em “produção” com Auth, a UI ops grava `cortely-store.json` (ou `/tmp`/memória). Tabelas SQL ops + RLS 1.A existem no repo e **não são usadas** pelo app. `SHOP_ID` fixo — PDV sem multi-tenant real hoje.

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

### 2.6 Grafo crítico (operações cruzadas — D3)

```
appointment.completed → consumePackageCredit | openCash? → createSale
createSale → items + stock_movements + payments + commission_entries + audit (+ cupom)
sellPackage → client_packages + createSale
receivePurchaseOrder → stock + payable
payCommissions → entries paid + advances
refund → stock + commission policy (D6)
payments intent → (só paid confirmado) deposit / attach sale
```

Qualquer um desses fluxos **só** pode executar em PG quando **todos** os domínios tocados no fluxo estiverem com registry=`pg`.

---

## 3. Arquitetura PostgreSQL proposta

### 3.1 Princípios

1. PostgreSQL (Supabase) = fonte oficial por domínio após cutover desse domínio (D1).
2. `barbershop_id` **somente** da sessão (`getLiveSession` / `user_barbershop_id()`) em código novo desde 1.B.0 (D8).
3. RLS 1.A (ENABLE+FORCE) + RBAC backend; service role com filtro explícito de tenant.
4. Transações obrigatórias nos fluxos financeiros listados em D3.
5. Denormalizar `barbershop_id` em `sale_items`/`sale_payments` + FK composta (D5).
6. Idempotência: `ops_idempotency_keys` e/ou unique parcial por domínio.
7. Concorrência: `FOR UPDATE`, unique cash open, `UPDATE stock WHERE qty >= n`.
8. Auditoria em `ops_audit_log` em mutações financeiras/estoque.
9. Falha parcial → rollback TX; gateway externo → intents + webhook + reconcile (D7).

### 3.2 Registry por domínio (D2)

Configuração (ex.: env JSON ou mapa versionado):

```
products, stock, cash, sales, commissions, packages, purchasing,
payables, receivables, coupons, deposits, campaigns, waitlist,
reviews, fiscal, payment_intents  →  "json" | "pg"
```

Regras:
- **Read e write do mesmo domínio = mesma fonte.**
- Dual-write operacional **proibido**.
- Shadow log opcional (append-only audit file/table) **não** é lido pela aplicação.
- Adapter `OpsRepository` consulta o registry; testes falham se um método misturar fontes.
- Cutover de domínio = flip atômico registry json→pg **após** migrate+reconcile daquele domínio (ou do **conjunto** exigido por D3).

### 3.3 Rollback (D1)

| Situação | Ação permitida |
|---|---|
| Bug de UI/read | Corrigir app; dados PG permanecem |
| Necessidade excepcional de servir JSON | 1) Export delta PG (`written_at > cutover_at`) 2) Merge no snapshot JSON 3) Reconcile contagens/somas 4) Validação integral 5) Só então apontar reads legados — **sem** apagar batch PG |
| “Desfazer import” | Só batches de migração **sem** delta pós-cutover; senão restore controlado + preserve delta |

### 3.4 Isolamento / camadas

```
Browser → API Next.js (session + RBAC + tenant bind)
       → OpsRepository(registry) → Postgres | JSON legado
       → payment_intents + webhook (PG)
```

Testes: suite RLS SQL A×B (1.A) + extensão + API 3 tenants.

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
**Troco:** `change_due` auditado; linha cash ajustada para que Σ payments líquidos = total.  
**Pagamento parcial de sinal:** via `deposits` / intent — **não** marcar sale `paid`.  
**Estorno:** TX: sale→`refunded`, stock devolve, comissões conforme D6, audit.

### 4.3 Sequência multi-tenant `sale_items` / `sale_payments` (D5)

Ordem **obrigatória** (preserva 1.A):

1. `ADD COLUMN barbershop_id UUID NULL` (nullable inicialmente).
2. **Backfill:** `UPDATE sale_items si SET barbershop_id = s.barbershop_id FROM sales s WHERE s.id = si.sale_id` (idem payments); rejeitar/quarentenar órfãos.
3. Verificar `COUNT(*) FILTER (WHERE barbershop_id IS NULL) = 0`.
4. `ALTER … SET NOT NULL`.
5. `ALTER TABLE sales ADD CONSTRAINT sales_id_shop_uid UNIQUE (id, barbershop_id)` (se ainda não existir).
6. `FOREIGN KEY (sale_id, barbershop_id) REFERENCES sales (id, barbershop_id)`.
7. Índices `(barbershop_id)`, `(barbershop_id, sale_id)`.
8. Recriar/ajustar policies: `USING/WITH CHECK (barbershop_id = user_barbershop_id())` + EXISTS sale mesmo shop; manter ENABLE+FORCE; grants 1.A.
9. Suite SQL A×B em items/payments (já padrão 1.A) + asserts FK cruzada.

Impossível associar item da loja A a sale da loja B: FK composta + WITH CHECK + RLS.

### 4.4 DDL proposto — comissões (D10)

```text
commission_rules (
  id UUID PK,
  barbershop_id UUID NOT NULL REFERENCES barbershops(id),
  barber_id UUID NULL,          -- NULL = regra default da loja
  service_id UUID NULL,
  service_percent NUMERIC(5,2) NOT NULL,
  product_percent NUMERIC(5,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
-- Anti-duplicidade com NULLS:
-- UNIQUE NULLS NOT DISTINCT (barbershop_id, barber_id, service_id)  -- PG 15+
-- ou índice único por expressão coalesce(barber_id, '…'), coalesce(service_id, '…')

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
-- UNIQUE (barbershop_id, sale_id, barber_id) WHERE status IN ('pending','paid')
--   evita duplicar accrual ativo; clawback/reversed permitem nova linha

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

RLS ENABLE+FORCE + policy tenant em todas; REVOKE anon; EXECUTE helpers inalterados (1.A).

**Backfill `barbershop_id` em tabelas novas vindas do JSON:**  
1. Coluna nullable → 2. `UPDATE … SET barbershop_id = map.barbershop_id FROM ops_shop_id_map` / session shop do ETL → 3. quarentena NULL → 4. NOT NULL → 5. FKs.

### 4.5 Política de comissão no estorno (D6)

| Estado da entry na venda | Política |
|---|---|
| `pending` | Na TX de refund: `reversed` (preserva amount) |
| `paid` | **Bloquear** `refundSale` com erro acionável **ou** exigir TX prévia de **clawback** (entry `clawback` + ajuste payout) e só então refund. **Default do plano: bloquear refund se existe entry `paid` sem clawback liquidado.** |
| Já `reversed`/`clawback` | Idempotente |

Código JSON atual (zerar amount + marcar `paid`) **não** será reproduzido no PG.

### 4.6 `payment_intents` e gateway (D7)

```text
payment_intents (
  id UUID PK,
  barbershop_id UUID NOT NULL,
  provider TEXT NOT NULL,           -- mercadopago|asaas|…
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

Fluxo:
1. `create_intent` → insert `pending` + chamada provider.  
2. Sync `approved/RECEIVED` → revalidar → `paid` **somente** se confirmado. `simulated` **nunca** `paid`.  
3. Webhook autenticado (assinatura provider) → upsert idempotente por `provider_ref`.  
4. Job reconcile: `pending` antigos → consulta API provider.  
5. Efeito de negócio (deposit / attach payment / sale `paid`) **só** após `payment_intents.status = paid`.

**Obrigatório antes do cutover financeiro** (flip registry de `sales`/`cash`/`commissions` para `pg`, e antes de 1.B.8 cutover global ops financeiro). Subetapa: **1.B.3-G** (junto/antes de 1.B.3 completo) — ver §6.

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

Prioridade: risco financeiro e D3. Registry inicia tudo em `json` exceto o que já é CRM/PG.

| Subetapa | Escopo | Dependências | Critérios de aceite | Riscos |
|---|---|---|---|---|
| **1.B.0** | `OpsRepository` + **registry por domínio** + tenant session em stubs; shadow log opcional; **sem** mudança UX | 1.A | Testes do registry (uma fonte R/W); nenhum write PG ainda (ou no-op); typecheck/docs; SHOP_ID não usado em código novo | Registry mal configurado misturando fontes |
| **1.B.1** | Products + stock_movements + inventory_counts → registry `pg` | 1.B.0 + mig enrich produtos | CRUD estoque PG; isolamento ≥3 lojas; persistência pós-logout; **não** alterar createSale ainda (venda continua JSON) | Stock PG vs venda JSON — **mitigado** mantendo venda em JSON até 1.B.3 |
| **1.B.2** | Cash sessions + movements → `pg` | 1.B.1 | Unique 1 open/loja; sangria/suprimento; close atômico FOR UPDATE; isolamento | Dois caixas — unique parcial |
| **1.B.3-G** | **Gateway:** payment_intents + webhook auth + idempotência + reconcile job | 1.B.0 + mig intents | Intent pending≠pago; webhook replay safe; simulated≠paid; testes de confirmação | Webhook sem assinatura; race sync/async |
| **1.B.3** | Sales+items+payments+stock+commission accrual+audit em **uma TX**; tip/desconto/troco/cancel/refund; registry `sales`(+deps)→`pg` **junto** | 1.B.1, 1.B.2, **1.B.3-G**, mig tenant FK, D4/D5 | Flip simultâneo sales+stock+cash usados na venda; zero fluxo venda JSON+PG; Σ payments; estorno consistente; RLS A×B items/payments; **pending nunca paid** | Cutover parcial — **proibido** por aceite |
| **1.B.4** | Comissões payout + advances + política D6 | 1.B.3 + mig commissions | DDL/constraints; pay idempotente; refund bloqueado se paid sem clawback; isolamento | Clawback mal aplicado |
| **1.B.5** | Packages / client_packages; `appointment.completed` só PG | 1.B.3 | Completed não escreve JSON ops | Pacote+venda cruzados |
| **1.B.6** | Suppliers + OC + payables link | 1.B.1 | Receive OC = stock+payable TX | Divergência estoque |
| **1.B.7** | Receivables, coupons, deposits (ligados a intents), campaigns, waitlist, reviews, fiscal draft; export CSV PG | 1.B.3, 1.B.3-G | Paridade API; deposit só com intent paid | Deposit fantasma |
| **1.B.8** | Migração JSON residual → PG; cutover registry global ops; JSON **read-only backup**; reconcile 0 | todas anteriores + D1 | Export/reconcile; sem writes JSON prod; PG preservado; sem truncate pós-cutover | Perda se rollback destrutivo — **proibido** |
| **1.B.9** | Remover SHOP_ID; limpeza legado; ADR units (sem implementar units) | 1.B.8 | Constant ausente; multi-tenant ops real | — |

**WhatsApp:** fora desta etapa.

### Critérios transversais de aceite (toda subetapa)

1. Typecheck + build + suites security 1.A verdes (quando CI Cortely aplicável).  
2. Nenhuma rota aceita `barbershop_id` do cliente para escopo.  
3. Registry: uma fonte R/W por domínio tocado.  
4. Sem dual-write operacional.  
5. Sem apply remoto de migrations sem autorização.  
6. Revisão humana de risco financeiro: **1.B.2, 1.B.3-G, 1.B.3, 1.B.4, 1.B.8**.

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

Não apagar PG pós-cutover. Export delta + reconcile se retorno excepcional a JSON. Flag/registry apontam fontes; dados PG permanecem.

### 7.7 Cutover

Freeze ou drain → delta final → reconcile → registry `pg` nos domínios → monitor 48h → JSON backup only.

### 7.8 Anti-duplicação

`ON CONFLICT (id)`; `imported_from_batch`; segundo import só `--force` + novo batch.

---

## 8. Estratégia de testes

| Classe | Conteúdo |
|---|---|
| Persistência | logout/login mantém dados PG do domínio |
| Isolamento 3 lojas | SQL RLS + API |
| FK cruzada | insert item shop A em sale B falha |
| Concorrência | caixa unique; stock 409; refund idempotente |
| Pagamentos | pending≠paid; webhook replay; simulated≠paid |
| Venda TX | items+payments+stock+commission+audit atômicos |
| Comissão D6 | refund bloqueado se paid |
| Registry | tentativa de dual-source falha em teste |
| Migração | reconcile fixture |
| Regressão | phase0 + fase1a + build |

Ambiente: Postgres service (CI 1.A) + seeds 3 tenants.

---

## 9. Riscos técnicos e mitigativas

| Risco | Mitigação |
|---|---|
| Ops JSON em prod hoje | Priorizar 1.B.3 cutover conjunto; alertas |
| Cutover parcial venda/stock | D3 + aceite 1.B.3 |
| Rollback destrutivo | D1 |
| Dual-write | D2 |
| Intent pending como pago | D4/D7 + 1.B.3-G obrigatório |
| Comissão paid + refund | D6 |
| SHOP_ID em código novo | D8 + review 1.B.0 |
| Units scope creep | ADR §11 |
| Migrations remotas acidentais | Processo humano; CI não aplica |
| WhatsApp | Fora de escopo |

---

## 10. Critério de conclusão da Etapa 1.B (global)

- Registry: todos os domínios ops **obrigatórios** em `pg` (exceto `units` — ADR).  
- JSON ops não escrito em produção.  
- Isolamento ≥ 3 barbearias (SQL+API).  
- Migração reconcile 0 (ou diffs justificados).  
- Gateway: intents+webhook+reconcile em uso; pending≠paid.  
- 1.A auth/RLS intacta.  
- SHOP_ID removido (1.B.9).

---

## 11. ADR — Adiamento de `units` (D9)

**Status:** Aceito para o planejamento 1.B.  
**Contexto:** `units` existe no JSON ops sem tabela SQL/RLS; multi-tenant SaaS já é `barbershops` + `profiles.barbershop_id`.  
**Decisão:** **Não** implementar `units` na 1.B; não bloqueia 1.B.8.  
**Consequências:** multi-unidade intra-loja fica para fase posterior; documentação de produto não deve prometer units até nova ADR.  
**Revisita:** pós-1.B.9 se houver requisito comercial.

---

## 12. Decisões ainda pendentes (não bloqueiam consolidação do plano; resolver na autorização de implementação / design fino)

| Pendência | Notas |
|---|---|
| P1 | Formato exato do registry (env JSON vs tabela `ops_domain_registry`) |
| P2 | Introduzir status `draft` de sale ou só `pending_payment`/`paid`/… |
| P3 | Clawback automático vs apenas bloqueio manual (default plano = **bloqueio** até clawback) — confirmar na 1.B.4 |
| P4 | Obrigar caixa open para toda sale `paid` ou permitir exceções (agenda online) |
| P5 | Provider(s) de webhook prioritários (MP e/ou Asaas) e segredos |
| P6 | Profundidade do shadow log (arquivo vs `ops_audit_log` only) |
| P7 | Janela do job reconcile de intents (minutos/horas) |
| P8 | Estratégia stock no ETL: replay movements vs opening balance |

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

**Próximo passo:** aprovação formal humana deste documento consolidado. Somente após autorização explícita iniciar **1.B.0** (registry + OpsRepository).
