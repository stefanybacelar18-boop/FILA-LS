# Auditoria FrotaTMS — Produto, UX e Arquitetura

Data: Jul/2026  
Escopo: melhorias incrementais (sem mudar stack, sem remover funções, sem reescrever).

---

## ✔ Problemas encontrados

### Fluxo / processo
1. **Não existe “mesa de papel”** — Admin cria roteiro por formulário + checkboxes de concessionárias; não agrupa cidades/notas.
2. **Sem handoff explícito** — criar roteiro já vira `AGUARDANDO_PLACAS` (não há “Enviar para Operação”).
3. **Admin pode definir placas** — contradiz o processo real (“Admin nunca escolhe placas”).
4. **Sem conceito de notas fiscais / cidades pendentes** no banco.
5. **Operação vê tela densa** — seleção de roteiro + DnD + indisponíveis + motorista na mesma página.
6. **Dashboard misturado** — KPIs, gráficos, ranking e alertas na mesma tela (ruído para o planejador).
7. **Menus demais** — 11 itens; dificulta uso por pessoas 50+.
8. **Deep-link ausente** — Dashboard → Definir Placas não pré-seleciona o roteiro.
9. **`RASCUNHO` existe mas quase não é usado** no fluxo de criação.
10. **Exportação operacional simples** (rota + placas + prioridade) não existe como atalho do dia.

### UX
- Fontes/botões médios; contraste ok, mas densidade alta.
- Labels: “Meta”, “Qtd. placas previstas”, “Cobertura” misturados.
- RouteForm: lista longa de checkboxes (~72 concessionárias).
- AssignPlates: muitos passos mentais para a terceirizada.

### Técnico (não bloqueantes)
- Sem migrations formais (`db push`).
- Fuso 06:00 sem `America/Bahia` explícito.
- Products montados no schema mas fora da API.
- Sem testes E2E do fluxo placas.

---

## ✔ Melhorias sugeridas (preservando essência)

| # | Melhoria | Impacto | Esforço |
|---|----------|---------|---------|
| P0 | **Mesa de Roteirização** (3 colunas) | Alto — espelha o papel | Médio |
| P0 | **Enviar para Operação** (RASCUNHO → AGUARDANDO_PLACAS) | Alto — handoff claro | Baixo |
| P0 | **Tela Operação simplificada** + cobertura antes de confirmar | Alto — menos erros | Médio |
| P0 | **Nav por papel** (Admin planeja / Ops executa) | Alto — clareza | Baixo |
| P1 | **Central de Alertas** + **Meu Dia** | Médio-Alto | Médio |
| P1 | **Central de Planejamento** (dashboard Admin) | Médio | Médio |
| P1 | Exportação simples do planejamento do dia | Médio | Baixo |
| P1 | UX: botões/fontes maiores, menos itens no menu | Médio | Baixo |
| P2 | Stub importação Excel (arquitetura pronta) | Médio (futuro) | Baixo |
| P2 | Deep-link `?routeId=` em Definir Placas | Baixo-Médio | Baixo |

---

## ✔ Ordem de implementação

1. Schema: `PlanningCity` + campos de handoff no `Route`
2. API `/planning/*` + `POST /routes/:id/send-to-operation`
3. Mesa de Roteirização (Admin)
4. Operação simplificada + cobertura pré-confirmação
5. Meu Dia + Central de Alertas + Dashboard planejamento
6. Export + stub import
7. Nav/UX alto contraste / fontes maiores
8. Docs + seed de cidades pendentes de exemplo

---

## ✔ O que NÃO muda

- Stack (React/Vite/Express/Prisma/JWT/Socket)
- Capacidade em motos
- Saída 06:00 e farthest para retorno
- Justificativa de indisponibilidade e atraso
- Claim atômico de placas
- Isolamento do FilaDock
- Telas existentes permanecem acessíveis (Roteiros, Frota, etc.) — reorganizadas no menu
