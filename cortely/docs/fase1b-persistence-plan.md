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
| D1 | **Após cutover de um domínio (ou conjunto), PostgreSQL é a fonte oficial.** Não há retorno automático PG→JSON. Rollback de aplicação **preserva** todos os dados já gravados no PG (sem apagar, truncar ou sobrescrever batches pós-cutover). Retorno excepcional a JSON exige exportação do delta + reconciliação + validação integral; a troca de fonte (registry) é **coordenada por grafo transacional**, nunca domínio a domínio. |
| D2 | **Registry por domínio:** uma única fonte oficial de **leitura e escrita** por domínio (R e W **nunca** divergem). Dual-write operacional **proibido**. Shadow logging apenas auditoria (não é segunda fonte). **Bridges JSON↔PG em fluxos financeiros: proibidas.** Ver §3.2 (abordagem oficial v1). |
| D3 | **Operações cruzadas** (venda ↔ estoque ↔ caixa ↔ pagamentos ↔ comissões; OC ↔ stock ↔ payables) só fazem **cutover de fonte oficial** quando **todas** as dependências do fluxo flippam **juntas** para `pg`. Proibida execução financeira partida JSON+PG. |
| D3a | **Prep ≠ cutover.** Subetapas podem preparar schema, backfill, adapters e testes em PG **sem** alterar a fonte oficial em produção. Enquanto `sales=json` em produção, `products`, `stock` e `cash` **permanecem** `registry=json` em produção. |
| D3b | **Fail-fast de registry:** configuração incompatível com o grafo transacional (ex.: `sales=json` + `stock=pg`) **impede boot/execução** do fluxo — não executa parcialmente. |
| D4 | Estados explícitos de venda/pagamento; pendente **nunca** conta como pago; descontos, gorjetas, **troco (recebido ≠ aplicado ≠ devolvido)**, cancelamentos e estornos modelados — ver §4.2. |
| D5 | Multi-tenant: sequência segura backfill → UNIQUE → FK composta → índices → RLS; preservar controles 1.A (FORCE RLS, helpers, grants). |
| D6 | Comissão já **paga**: política **bloquear estorno da venda** até clawback/estorno de payout (ou clawback automático em TX dedicada) — ver §4.5. Estornos/clawbacks **preservam valores originais** e são **idempotentes**. |
| D7 | Gateway: tabela `payment_intents`, webhook autenticado, idempotência, reconcile; **obrigatório antes do cutover financeiro** (ver §4.6 / §6 / 1.B.3-G). Antecipação `payment_intents=pg` só com fluxo **isolado** (sem efeitos em sales/deposits JSON). |
| D8 | **Tenant da sessão** em todo código novo desde **1.B.0**. `SHOP_ID` fixo só em legado JSON + ETL até remoção em 1.B.9. |
| D9 | **`units` adiadas** — ADR formal (§11); não bloqueia conclusão de 1.B.8. |
| D10 | DDL de comissões com constraints anti-duplicidade (incl. NULLS); FKs/validações de tenant em `commission_rules` e `staff_advances`; backfill de `barbershop_id` **antes** de NOT NULL / FKs compostas. |

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

**Grafo Gateway (parcialmente antecipável — 1.B.3-G):**
```
payment_intents (create / webhook / reconcile)
  → pode atualizar APENAS a própria intent em PG
  → NÃO cria/atualiza sales, deposits, cash, stock enquanto esses forem json
```
Ver limites exatos em §4.6 e §6 (1.B.3-G).

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
9. Falha parcial → rollback TX; gateway → intents + webhook + reconcile (D7), com isolamento pré-cutover Venda.  
10. **Prep sem mudar fonte oficial** (D3a): migrations/adapters/testes podem existir enquanto produção continua `json`.

### 3.2 Registry por domínio — abordagem oficial v1 (resolve P1 para 1.B.0)

Esta seção define a arquitetura **obrigatória** para implementar 1.B.0. Detalhes de UX operacional / migração para tabela SQL permanecem pendentes (§12), mas **não** bloqueiam o desenho.

#### 3.2.1 Fonte da configuração (v1)

| Item | Decisão v1 |
|---|---|
| Fonte | Variável de ambiente **`CORTELY_OPS_REGISTRY`** (JSON objeto) **ou** arquivo versionado `cortely/config/ops-registry.json` carregado no boot (mesmo schema). Env **sobrescreve** arquivo se ambos existirem. |
| Schema | Mapa `domain → "json" \| "pg"` para a lista fechada de domínios abaixo. Domínio omitido → default. |
| Domínios | `products`, `stock`, `cash`, `sales`, `commissions`, `packages`, `purchasing`, `payables`, `receivables`, `coupons`, `deposits`, `campaigns`, `waitlist`, `reviews`, `fiscal`, `payment_intents` |
| Mutação em runtime | **Proibida** em v1. Flip = redeploy / restart com nova config (ou troca atômica do arquivo + restart controlado). Sem API pública de flip. |
| Evolução (pendente) | Tabela `ops_domain_registry` + auditoria de flips — **P1-evol** (§12); não necessária para 1.B.0. |

#### 3.2.2 Valores padrão

| Ambiente | Default |
|---|---|
| Produção / não-demo (boot inicial 1.B.0) | **Todos** os domínios ops = `"json"` |
| Demo / testes unitários sem PG | Todos = `"json"` |
| CI/staging de prep | Podem apontar subconjuntos para `"pg"` **somente** se passarem na validação de grafos; fixtures de teste usam configs explícitas |

Não existe default implícito `pg`. Omitir chave = `"json"`.

#### 3.2.3 Validação na inicialização (fail-fast D3b)

No boot (e em todo processo worker/API que use `OpsRepository`):

1. Carregar mapa + aplicar defaults.  
2. Validar valores ∈ `{json, pg}` e domínios conhecidos.  
3. Avaliar **conjuntos transacionais** (grafos):

| Conjunto | Domínios que devem ser **homogêneos** (`all json` ou `all pg`) |
|---|---|
| **Venda** | `sales`, `products`, `stock`, `cash` (accrual de `commissions` na TX de venda exige `commissions` na mesma fonte que `sales` quando accrual estiver ativo em PG) |
| **OC** | `purchasing`, `stock`, `payables` |
| **Pacote+venda** | `packages` + conjunto Venda |
| **Depósito pós-intent** | `deposits` + (quando efeito financeiro ligado) `sales`/`cash` conforme fluxo — ver 1.B.3-G |

4. Se qualquer grafo estiver **partido** → **abortar boot** (exit ≠ 0) ou, em hot-path de request, rejeitar com erro estruturado **sem** side-effects.  
5. Logar fingerprint do registry (hash do mapa) no boot para auditoria.

#### 3.2.4 Bloqueio de configurações incompatíveis

Exemplos **rejeitados**:

| Configuração | Resultado |
|---|---|
| `sales=json` + (`stock=pg` \| `cash=pg` \| `products=pg`) | **Rejeitada** — não boot / não executa createSale |
| `sales=pg` + (`stock=json` \| `cash=json` \| `products=json`) | **Rejeitada** |
| `purchasing=pg` + (`payables=json` \| `stock=json`) | **Rejeitada** |
| `deposits=pg` + efeito que escreve `sales=json` | **Rejeitada** no fluxo (fail-fast) |
| Conjunto Venda todo `json` ou todo `pg` | OK |
| Conjunto OC coerente | OK |
| `payment_intents=pg` com sales/deposits ainda `json` | OK **somente** se efeitos de negócio em sales/deposits estiverem **desligados** (modo isolado 1.B.3-G) |

#### 3.2.5 Leitura e escrita na mesma fonte (D2)

- API do registry: `source(domain) → "json"|"pg"`.  
- `OpsRepository.read(domain, …)` e `OpsRepository.write(domain, …)` **obrigatoriamente** usam `source(domain)` — **não** há parâmetros separados de readSource/writeSource.  
- Proibido: ler PG e escrever JSON (ou o inverso) no mesmo domínio.  
- Dual-write e bridges = violação → teste de invariante falha; código não deve expor hooks para isso.

#### 3.2.6 Impedir flip parcial de conjuntos

| Mecanismo | Descrição |
|---|---|
| Validação de boot | Recusa mapa com grafo partido (§3.2.3) |
| API de cutover (interna/ops) | Aceita apenas **conjuntos nomeados** (`sale_graph`, `oc_graph`, …), não chaves isoladas; aplica todos os flips do conjunto na **mesma** carga de config |
| Checklist de go-live | Freeze → import/reconcile → publicar config com conjunto completo → restart → probe |
| Testes | Suite de invariante lista grafos legais/ilegais; CI falha se defaults de produção forem ilegais |

### 3.3 Rollback e troca de fonte (D1 + D2)

**Invariantes permanentes:**

1. Em qualquer momento, para cada domínio: **read source = write source**.  
2. Rollback de **aplicação** (revert de release / hotfix) **não** apaga, trunca nem sobrescreve dados PostgreSQL já gravados.  
3. Nenhum procedimento automático apaga batch pós-cutover (`TRUNCATE`, `DELETE` em massa do `migration_batch_id` ativo, etc.).  
4. Troca de fonte (JSON↔PG) só via **conjunto transacional** completo + validação de registry; nunca flip de um domínio do grafo sozinho.

| Situação | Ação permitida | Ação proibida |
|---|---|---|
| Bug de UI / read path | Corrigir app e redeploy; dados PG permanecem | Apagar tabelas / truncar batch para “voltar” |
| Rollback de release pós-cutover | Redeploy da versão anterior **somente se** o registry da versão anterior ainda for **coerente** com os dados (tipicamente mantém `pg` no grafo já cutover). Se a versão antiga só souber JSON, **não** apontar reads para JSON sem o procedimento excepcional abaixo | Apontar R→JSON e W→PG (ou vice-versa); dual-read “temporário” com writes mistas |
| Necessidade excepcional de servir JSON após cutover PG | Procedimento **manual e auditado**: (1) Export delta PG (`written_at > cutover_at` / batch) (2) Merge no snapshot JSON (3) Reconcile integral (tolerância 0) (4) Validação humana (5) Publicar registry do **grafo inteiro** de volta a `json` no mesmo flip (6) Dados PG **permanecem** como arquivo histórico — **sem** delete | Truncate/delete do batch; flip parcial; bridges |
| “Desfazer import” pré-cutover | Só batches **sem** tráfego pós-import e **antes** do flip de registry; senão restore de backup + preserve delta | Apagar pós-cutover automaticamente |

### 3.4 Isolamento / camadas

```
Browser → API Next.js (session + RBAC + tenant bind)
       → OpsRepository(registry + fail-fast graphs)
       → Postgres | JSON legado (uma fonte R+W por domínio)
       → payment_intents + webhook (PG; efeitos de negócio só se grafo permitir)
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

### 4.2 Estados de venda e pagamento (D4) — incluindo troco

**`sales.status`:**
- `draft` — opcional/interno (se usado; pendência P2)
- `pending_payment` — aguarda confirmação (intent); **não** baixa estoque definitivo / **não** comissiona como paid
- `paid` — total liquidado e confirmado
- `canceled` — cancelada antes de paid (sem estorno de stock se nunca paid)
- `refunded` — estornada após paid

**Três conceitos monetários distintos (obrigatório modelar):**

| Conceito | Campo(s) | Significado |
|---|---|---|
| **Valor devido / aplicado à venda** | `sales.total` | `max(0, subtotal - discount + tip)` — o que a venda deve liquidar |
| **Valor recebido do cliente** | por linha em `sale_payments.amount_tendered` (ou `tendered`); Σ tendered = dinheiro/cartão/etc. efetivamente entregue | Pode exceder `total` em pagamentos em dinheiro |
| **Valor devolvido como troco** | `sales.change_due` (≥ 0) | `change_due = max(0, Σ amount_tendered − total)` para meios que admitem troco (tipicamente `cash`) |

**Valor efetivamente aplicado por meio de pagamento (líquido à venda):**

- Em cada `sale_payments`: `amount_applied` (ou `amount`) = parcela que **abate** o `total`.  
- Invariante: **`Σ amount_applied = sales.total`** (após desconto/gorjeta).  
- Invariante: **`Σ amount_tendered = sales.total + sales.change_due`**.  
- Para cartão/PIX/etc.: em geral `amount_tendered = amount_applied` e não gera troco.  
- Para dinheiro: `amount_tendered ≥ amount_applied`; o excedente entra em `change_due`.

**Pagamentos divididos:** múltiplas linhas `sale_payments`; a soma dos `amount_applied` fecha o `total`; apenas o excedente de meios “cash-like” compõe `change_due`.

**Intent / gateway:**
- Intent: `pending` | `paid` | `failed` | `canceled` — **`pending` nunca implica receita/sale paid**  
- Efeito de negócio (criar/atualizar sale, deposit, caixa) **só** se intent `paid` **e** registry dos domínios alvo permitir fonte única (ver 1.B.3-G).

**Desconto:** `sales.discount` (+ cupom).  
**Gorjeta (`tip`):** coluna em `sales`; fora da base de comissão por padrão.  
**Sinal/parcial:** `deposits` / intent — **não** marcar sale `paid`.  
**Estorno:** TX: sale→`refunded`, stock devolve, comissões conforme D6, audit; valores originais de payments/total/change_due **preservados** (não zerar historicamente).

**Fechamento de caixa — reconciliação:**
- Esperado em dinheiro na sessão ≈ Σ (`amount_tendered` cash − troco associado) das sales `paid` da sessão + movimentos manuais.  
- Conferência por método usa **`amount_applied` por método** (receita) e, à parte, **troco pago** (saída de caixa), para não inflar receita pelo tendered bruto.  
- Critério de aceite: venda cash + split + close **sem divergência** entre Σ applied, total, change_due e contagem de caixa.

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

### 4.4 DDL proposto — comissões (D10) + FKs de tenant

```text
commission_rules (
  id UUID PK,
  barbershop_id UUID NOT NULL REFERENCES barbershops(id),
  barber_id UUID NULL,
  service_id UUID NULL,
  service_percent NUMERIC(5,2) NOT NULL,
  product_percent NUMERIC(5,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- FKs compostas / validações de tenant:
  FOREIGN KEY (barber_id, barbershop_id) REFERENCES barbers (id, barbershop_id)  -- se barbers tiver UNIQUE(id, barbershop_id); senão CHECK via trigger/EXISTS
  FOREIGN KEY (service_id, barbershop_id) REFERENCES services (id, barbershop_id) -- idem
)
-- UNIQUE NULLS NOT DISTINCT (barbershop_id, barber_id, service_id)  -- PG 15+
-- ou índice único por expressão coalesce(...)
-- CHECK: se barber_id/service_id NOT NULL, pertencem ao mesmo barbershop_id

commission_entries (
  id UUID PK,
  barbershop_id UUID NOT NULL,
  barber_id UUID NOT NULL,
  sale_id UUID NOT NULL,
  amount NUMERIC(12,2) NOT NULL,          -- valor original; NÃO zerar em reverse/clawback
  basis NUMERIC(12,2) NOT NULL,
  percent NUMERIC(5,2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','paid','reversed','clawback')),
  created_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ NULL,
  reversed_at TIMESTAMPTZ NULL,
  clawback_of UUID NULL REFERENCES commission_entries(id),  -- se clawback for nova linha
  payout_batch_id UUID NULL,
  FOREIGN KEY (sale_id, barbershop_id) REFERENCES sales (id, barbershop_id),
  FOREIGN KEY (barber_id, barbershop_id) REFERENCES barbers (id, barbershop_id)  -- ou validação equivalente
)
-- UNIQUE parcial ativo: (barbershop_id, sale_id, barber_id) WHERE status IN ('pending','paid')
-- Reverse/clawback: status muda ou nova linha; amount/basis/percent originais preservados

staff_advances (
  id UUID PK,
  barbershop_id UUID NOT NULL REFERENCES barbershops(id),
  barber_id UUID NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','deducted','canceled')),
  created_at TIMESTAMPTZ NOT NULL,
  deducted_at TIMESTAMPTZ NULL,
  FOREIGN KEY (barber_id, barbershop_id) REFERENCES barbers (id, barbershop_id)  -- ou validação equivalente
)
```

**Nota de schema:** se `barbers`/`services` ainda não tiverem `UNIQUE (id, barbershop_id)`, a migration de comissões inclui (a) adicionar a constraint composta necessária **ou** (b) trigger/`CHECK` com `EXISTS` garantindo mesmo `barbershop_id` — preferir FK composta quando viável (alinhado a D5).

RLS ENABLE+FORCE + policy tenant; REVOKE anon.  
Backfill `barbershop_id`: nullable → map/ETL → quarentena → NOT NULL → FKs.

### 4.5 Política de comissão no estorno (D6) — idempotência e preservação

| Estado da entry | Política |
|---|---|
| `pending` | Na TX de refund: marcar `reversed` (ou equivalente); **preservar** `amount`/`basis`/`percent` originais; `reversed_at` preenchido |
| `paid` | **Bloquear** refund da venda até clawback liquidado (**default**, P3); clawback = nova linha `clawback` referenciando a entry **ou** transição auditada — **sem** zerar `amount` da entry paga |
| `reversed` / `clawback` | Operação **idempotente**: reaplicar refund/clawback não duplica linhas ativas nem altera valores históricos |

Código JSON atual (zerar amount + marcar `paid`) **não** será reproduzido no PG.  
Payout e clawback usam `ops_idempotency_keys` / unique parcial para evitar double-pay e double-clawback.

### 4.6 `payment_intents` e gateway (D7) — integridade + limites 1.B.3-G

```text
payment_intents (
  id UUID PK,
  barbershop_id UUID NOT NULL REFERENCES barbershops(id),
  provider TEXT NOT NULL,
  provider_ref TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL CHECK (status IN ('pending','paid','failed','canceled')),
  purpose TEXT NOT NULL CHECK (purpose IN ('sale','deposit','appointment','other')),
  appointment_id UUID NULL,
  sale_id UUID NULL,
  deposit_id UUID NULL,
  idempotency_key TEXT NULL,
  raw_last_event JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (provider, provider_ref),
  UNIQUE (barbershop_id, idempotency_key) -- onde key NOT NULL
  -- Integridade / tenant:
  -- FK (appointment_id, barbershop_id) → appointments (id, barbershop_id) quando NOT NULL
  -- FK (sale_id, barbershop_id) → sales (id, barbershop_id) quando NOT NULL e sales=pg
  -- FK (deposit_id, barbershop_id) → deposits (id, barbershop_id) quando NOT NULL e deposits=pg
  -- CHECK: no máximo um de (sale_id, deposit_id) para purpose sale/deposit; appointment_id coerente com purpose
)
```

Fluxo genérico: create `pending` → sync só se confirmado → webhook assinado idempotente → reconcile job → efeito de negócio **só** se `status=paid` **e** registry permitir. `simulated` **nunca** `paid`.

#### Limites exatos da 1.B.3-G **antes** do cutover do grafo Venda

`payment_intents=pg` **pode** ser antecipado **somente** se o fluxo permanecer **isolado** dos domínios ainda em JSON.

| Permitido na 1.B.3-G (pré-1.B.3) | Proibido na 1.B.3-G (pré-1.B.3) |
|---|---|
| Criar intent `pending` em PG | Criar ou atualizar **vendas** em JSON (ou PG) a partir do webhook |
| Webhook autenticado atualizar status da intent (`paid`/`failed`/`canceled`) | Criar **depósitos** em JSON |
| Persistir `raw_last_event`; reconcile **do estado da intent** | Gerar efeitos financeiros parciais (caixa, stock, comissão, receivable) |
| Idempotência / replay-safe no registro da intent | Bridges intent(PG) → opsStore(JSON) |
| Consultas/admin do status da intent | Qualquer operação multi-fonte; deve **fail-fast** com **zero** side-effects fora de `payment_intents` |

**Regra:** se `sales=json` ou `deposits=json`, o handler pós-`paid` **não** dispara criação de sale/deposit; a intent fica `paid` (ou `paid_unapplied` se se introduzir substatus — pendência P10) até o cutover permitir aplicação atômica na fonte oficial.

**Obrigatório** ter 1.B.3-G concluída (webhook seguro + idempotência + reconcile de intent) **antes** do cutover do grafo Venda (1.B.3), para que no go-live os efeitos de negócio possam ligar-se com segurança.

### 4.7 Outras tabelas planejadas

purchase_orders(+items), client_packages, subscription_plans/client_subscriptions, coupons, deposits, goals, ops_idempotency_keys, ops_shop_id_map, ops_migration_rejects.

### 4.8 Migrations planejadas (repo only — **não criar/aplicar nesta autorização**)

1. `fase1b_01` — sale tenant columns + backfill + FK composta + RLS  
2. `fase1b_02` — sales/cash enrichment (tip, cancel, `amount_tendered` / `amount_applied`, change_due, counted_by_method)  
3. `fase1b_03` — commissions + advances + RLS + constraints NULLS + FKs tenant  
4. `fase1b_04` — packages/subscriptions  
5. `fase1b_05` — purchase_orders  
6. `fase1b_06` — coupons, deposits, payment_intents (+ FKs/tenant/purpose)  
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

Registry de produção inicia tudo ops em `json` (CRM/PG já existente permanece) — §3.2.2.

| Subetapa | Tipo | Escopo | Dependências | Critérios de aceite | Riscos |
|---|---|---|---|---|---|
| **1.B.0** | Prep | `OpsRepository` + registry v1 (§3.2) + **fail-fast de grafos** + tenant session; shadow log opcional; **sem** mudança UX | 1.A | Config default json; boot rejeita grafos partidos; R=W por domínio; flip só por conjunto; SHOP_ID ausente em código novo; produção continua `json` nos domínios ops | Registry mal configurado |
| **1.B.1** | **Prep (não cutover)** | Schema/backfill/adapters/testes de **products + stock_movements + inventory_counts** | 1.B.0 + mig produtos | Testes PG (CRUD/isolamento) em CI/staging; **produção: `products`/`stock` = `json`**; createSale legado inalterado (ainda JSON) | Confundir prep com cutover — **proibido** flip stock enquanto sales=json |
| **1.B.2** | **Prep (não cutover)** | Schema/adapters/testes de **cash_sessions + cash_movements** (unique open, FOR UPDATE) | 1.B.1 prep | Testes caixa em CI/staging; **produção: `cash` = `json`** | Flip cash cedo — **proibido** enquanto sales=json |
| **1.B.3-G** | Prep gateway (cutover **só** de intents, isolado) | `payment_intents` + webhook auth + idempotência + reconcile **da intent**; registry `payment_intents=pg` permitido em modo isolado | 1.B.0 + mig intents | Intent pending≠pago; webhook replay safe; simulated≠paid; **zero** create/update de sales/deposits/cash/stock a partir do webhook enquanto esses forem json; multi-fonte → fail-fast sem side-effects | Ligar efeitos cedo; bridge para JSON |
| **1.B.3** | **Cutover conjunto do grafo Venda** | Flip atômico produção: `products`+`stock`+`cash`+`sales` (+ accrual commissions na TX) → `pg`; createSale/refundSale/TX completa; tip/desconto/troco (tendered/applied/change_due)/cancel/refund; ligar aplicação de intents `paid` → sale quando aplicável | 1.B.1 prep, 1.B.2 prep, **1.B.3-G**, mig tenant FK, D4/D5 | Um único momento de flip; pós-flip createSale só PG; zero JSON+PG; Σ `amount_applied` = total; Σ tendered = total + change_due; estorno OK; RLS A×B; fail-fast ativo; pending nunca paid | Cutover parcial — **proibido**; exige freeze curto ou drain |
| **1.B.4** | Cutover payout | Comissões payout + advances + política D6 (preservar amounts; idempotência) | 1.B.3 | DDL/constraints/FKs tenant; pay idempotente; refund bloqueado se paid sem clawback; clawback não zera histórico | Clawback |
| **1.B.5** | Cutover packages | Packages / client_packages; `appointment.completed` só no backend PG do grafo já cutover | 1.B.3 | Completed não escreve JSON ops | Pacote+venda |
| **1.B.6** | **Cutover conjunto OC** | Flip conjunto `purchasing` + `payables` (com `stock` já `pg` desde 1.B.3) **no mesmo go-live**; receivePurchaseOrder TX stock+payable | 1.B.3 (stock oficial pg) + mig OC | receive OC sem fontes divididas; fail-fast se purchasing≠payables≠stock | Divergência se flip só OC |
| **1.B.7** | Cutover restante leve | Receivables, coupons, deposits (intents→deposit **só** com deposits/sales coerentes), campaigns, waitlist, reviews, fiscal draft; export CSV PG | 1.B.3, 1.B.3-G | Paridade API; deposit só intent paid + registry coerente | Deposit fantasma / bridge |
| **1.B.8** | Migração residual + harden | ETL JSON residual (ordem FK §7.4); registry global ops `pg`; JSON **read-only backup**; reconcile 0 | anteriores + D1 | Sem writes JSON prod; PG preservado; sem truncate pós-cutover | Rollback destrutivo — **proibido** |
| **1.B.9** | Limpeza | Remover SHOP_ID; ADR units (sem implementar units) | 1.B.8 | Constant ausente; multi-tenant ops real | — |

**WhatsApp:** fora desta etapa.

### Sequência de cutover (produção) — resumo

```
[Prep 1.B.0 → 1.B.1 → 1.B.2 → 1.B.3-G*]  ops grafo Venda = json
        * payment_intents podem ser pg em modo isolado (sem efeitos sales/deposits)
        ↓
[1.B.3] flip conjunto: products+stock+cash+sales(+accrual) → pg
        (+ ligar aplicação de intents → efeitos de negócio)
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
3. Registry: uma fonte R/W por domínio; **fail-fast** nos grafos D3; flip só por conjunto.  
4. Sem dual-write operacional; sem bridges.  
5. Prep **não** altera fonte oficial em produção (exceto `payment_intents` isolado na 1.B.3-G).  
6. Sem apply remoto de migrations sem autorização.  
7. Revisão humana de risco financeiro: **1.B.3-G, 1.B.3, 1.B.4, 1.B.6, 1.B.8**.  
8. Rollback de app **nunca** apaga dados PG; retorno a JSON só com export+reconcile+validação+flip de grafo (§3.3).

---

## 7. Plano de migração JSON → PostgreSQL

### 7.1 Backup

Snapshot JSON + SHA-256; `pg_dump`/PITR antes do import; `migration_batch_id`.

### 7.2 ETL

Parser `OpsSnapshot`; `ops_shop_id_map`; normalização; lotes master → documents → movements; rejeitos em `ops_migration_rejects`.

### 7.3 Dedup / validação

Unique por id; sales inconsistentes (Σ applied ≠ total, tendered ≠ total+change_due, etc.) → quarentena.

### 7.4 Import TX — ordem por dependências reais de FK

Ordem **obrigatória** (pais antes de filhos):

1. `ops_shop_id_map` / tenants já existentes (`barbershops`, `barbers`, `services`, `clients`, `appointments` conforme refs)  
2. `products`, `suppliers`  
3. `service_packages` / subscription_plans (se independentes de sales)  
4. `cash_sessions` (antes de sales que referenciam `cash_session_id`)  
5. `sales`  
6. `sale_items`, `sale_payments` (FK composta → sales)  
7. `stock_movements`, `inventory_counts` (→ products; sales se linked)  
8. `commission_rules` → `commission_entries` (→ sales, barbers)  
9. `staff_advances`  
10. `purchase_orders` (+ items) → efeitos; `payables` / `receivables`  
11. `coupons`, `deposits`, `client_packages`, `client_subscriptions`  
12. `payment_intents` (após sales/deposits/appointments que referenciar)  
13. `campaigns`, `waitlist`, `reviews`, `fiscal_documents`, `ops_audit_log`  
14. `ops_idempotency_keys` / rejects

Stock: recalcular por movements **ou** qty final + `migration_opening` (P8).

### 7.5 Reconciliação (tolerância 0)

- `#sales` / Σ `sales.total`  
- Σ `sale_payments.amount_applied` = Σ `sales.total` (paid)  
- Σ `amount_tendered` = Σ `total + change_due`  
- Caixa: receita por método via `amount_applied`; troco via `change_due` (não misturar)  
- `stock_qty`; commissions pending/paid (amounts originais)  
- cash open; intents `paid` vs deposits/sales **aplicados** (pós-cutover)

### 7.6 Rollback (D1) — alinhado a §3.3

Não apagar PG pós-cutover. Export delta + reconcile + validação integral se retorno excepcional a JSON. Registry do **grafo** inteiro troca junto; R=W; dados PG permanecem.

### 7.7 Cutover

1. **Prep concluída** (1.B.1–1.B.2–1.B.3-G) com produção ainda `json` no grafo Venda (`payment_intents` pode já ser `pg` isolado).  
2. Freeze curto ou dual-read drain **sem** dual-write.  
3. Import/reconcile delta do conjunto Venda.  
4. **Flip atômico** registry do conjunto: `products`,`stock`,`cash`,`sales` → `pg` (API de conjunto, §3.2.6).  
5. Monitor; ligar aplicação de intents → efeitos; depois cutovers 1.B.4–1.B.7; 1.B.6 flip `purchasing`+`payables`.  
6. 1.B.8: residual + JSON backup read-only.

### 7.8 Anti-duplicação

`ON CONFLICT (id)`; `imported_from_batch`; segundo import só `--force` + novo batch.  
**Proibido** apagar automaticamente batch pós-cutover.

---

## 8. Estratégia de testes

| Classe | Conteúdo |
|---|---|
| **Invariante registry** | Uma fonte R/W por domínio; suite lista grafos legais; defaults produção = json |
| **Fail-fast** | `sales=json`+`stock=pg` (e espelhos) → rejeição no boot/fluxo; zero side-effects |
| **Flip parcial** | Tentativa de setar só `stock=pg` via API de conjunto → rejeitada |
| **Prep sem cutover** | Em 1.B.1/1.B.2 com registry produção json: probes — createSale **não** escreve tabelas PG de stock/cash (contagem before/after = 0) |
| **1.B.3-G isolado** | Webhook `paid` atualiza intent; **não** cria sale/deposit JSON; replay idempotente |
| **createSale pós-1.B.3** | Todos writes (sale, items, payments, stock_movements, stock_qty, cash_session_id, commission_entries, audit) só em PG; JSON ops inalterado |
| **Troco / split** | tendered/applied/change_due; Σ applied = total; close caixa sem divergência |
| **refundSale** | Stock e status só PG; coerência qty; payments históricos preservados |
| **Caixa** | open → sale → cash_session_id em PG; close/conferência com applied vs troco |
| **Estoque** | venda produto + refund; movements PG; isolamento 3 lojas |
| **appointment.completed** | caminho pacote/venda/caixa em fonte única; sem write JSON ops após cutover |
| **receivePurchaseOrder (1.B.6)** | stock+payable mesma fonte; fail-fast se registry OC incoerente |
| FK cruzada / RLS | item A ≠ sale B; commission_rules/advances tenant |
| Concorrência | caixa unique; stock 409; refund/clawback idempotente |
| Pagamentos | pending≠paid; webhook replay; simulated≠paid |
| Comissão D6 | refund bloqueado se paid; amounts preservados em reverse/clawback |
| Migração | reconcile fixture (incl. troco); ordem FK |
| Regressão | phase0 + fase1a + build |

Ambiente: Postgres service (CI 1.A) + seeds 3 tenants. Prep testável em CI **sem** flip de produção.

---

## 9. Riscos técnicos e mitigativas

| Risco | Mitigação |
|---|---|
| Ops JSON em prod hoje | Cutover conjunto 1.B.3; alertas |
| Flip stock/cash antes de sales | **Proibido** (D3a); 1.B.1/1.B.2 = prep only |
| Bridges / dual-write / R≠W | D2 + §3.2; fail-fast D3b |
| Cutover parcial venda/stock/caixa | Aceite 1.B.3 + API de conjuntos §3.2.6 |
| OC com stock/payables divididos | Cutover conjunto 1.B.6 |
| Intent paid gerando sale/deposit cedo | Limites 1.B.3-G §4.6 |
| Intent pending como pago | D4/D7 + 1.B.3-G |
| Troco confundido com receita | D4: tendered vs applied vs change_due; reconciliação caixa |
| Comissão paid + refund / double clawback | D6 + idempotência + preservação de amount |
| SHOP_ID em código novo | D8 |
| Units scope creep | ADR §11 |
| Rollback apagando PG | §3.3 / D1 — proibido |
| Migrations remotas acidentais | Processo humano; CI não aplica |
| WhatsApp | Fora de escopo |

---

## 10. Critério de conclusão da Etapa 1.B (global)

- Registry: domínios ops obrigatórios em `pg` (exceto `units` — ADR); R=W; grafos homogêneos.  
- JSON ops não escrito em produção.  
- Isolamento ≥ 3 barbearias (SQL+API).  
- Grafo Venda e grafo OC sem fontes mistas (testes fail-fast + E2E).  
- Migração reconcile 0 (ou diffs justificados), incl. tendered/applied/change_due.  
- Gateway: intents+webhook+reconcile; pending≠paid; efeitos só com registry coerente.  
- 1.A auth/RLS intacta.  
- SHOP_ID removido (1.B.9).  
- Nenhum batch pós-cutover apagado por procedimento automático.

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
| **P1-evol** | Evoluir registry de env/arquivo (§3.2 v1) para tabela `ops_domain_registry` + auditoria de flips — **após** 1.B.0 estável; **não** bloqueia 1.B.0 |
| P2 | Introduzir status `draft` de sale ou só `pending_payment`/`paid`/… |
| P3 | Clawback automático vs apenas bloqueio (default = **bloqueio**) — confirmar na 1.B.4 |
| P4 | Obrigar caixa open para toda sale `paid` ou exceções (agenda online) |
| P5 | Provider(s) de webhook (MP e/ou Asaas) e segredos |
| P6 | Profundidade do shadow log |
| P7 | Janela do job reconcile de intents |
| P8 | Stock no ETL: replay movements vs opening balance |
| P9 | Duração/procedimento exato do freeze no cutover 1.B.3 (minutos vs drain) |
| P10 | Substatus `paid_unapplied` (ou fila de aplicação) para intents `paid` antes do cutover Venda / deposits — vs manter só `paid` + flag `applied_at` |
| P11 | Nomes finais das colunas `amount_tendered` / `amount_applied` vs reutilizar `amount` + `tendered` |
| P12 | Se `barbers`/`services` já permitem `UNIQUE (id, barbershop_id)` ou exigir migration auxiliar antes das FKs compostas de comissões |

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
| `config/ops-registry.json` (planejado) | registry v1 opcional em arquivo |

## Apêndice B — Limites desta autorização documental

- Não implementa código/adapters/testes funcionais.  
- Não cria nem aplica migrations.  
- Não altera Supabase remoto / produção.  
- Não remove JSON.  
- Não faz merge/publish/deploy.  
- **Não inicia 1.B.0** até aprovação formal humana deste plano consolidado.

---

**Próximo passo:** aprovação formal humana deste documento consolidado. Somente após autorização explícita iniciar **1.B.0** (registry v1 + OpsRepository + fail-fast).
