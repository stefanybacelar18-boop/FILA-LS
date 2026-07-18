# Arquitetura FrotaTMS

Documento resumido. Para handoff completo a outras IAs, use **`docs/ESPECIFICACAO-COMPLETA.md`**.

## Camadas

```
web (React)  --HTTP/JWT-->  api (Express)
     |                           |
  Socket.IO <----------------> Socket.IO
                                 |
                              Prisma ORM
                                 |
                         SQLite / PostgreSQL
```

## Domínio

- **Vehicle** — frota (status, capacidade em motos)
- **Dealership** — destino (distanceKm, avgTravelDays, allowedVehicle)
- **Route** — roteiro multi-destino (saída 06:00, prioridade manual, meta de placas)
- **RouteVehicle / Trip** — vínculo placa↔roteiro e ciclo de viagem
- **PlateUnavailability** — justificativa + previsão quando não pode carregar
- **User / AuditLog / VehicleHistory** — RBAC e rastreabilidade
- **PriorityProduct** — legado (API não montada)

## Regras críticas

1. Placa só entra em viagem se `status === DISPONIVEL` e sem trip aberta (claim atômico).
2. Saída oficial = data do roteiro às **06:00**.
3. Previsão de retorno = saída + `ceil(avgTravelDays)` do destino **mais longe**.
4. Tipo do veículo deve ser permitido em **todos** os destinos.
5. Placa crítica sem justificativa trava Confirmar em Definir Placas.
6. Retorno atrasado exige `delayReason`.
7. Ao retornar: status → `DISPONIVEL`; última trip conclui o roteiro.

## Perfis

| Perfil | Pode |
|--------|------|
| ADMIN | Tudo |
| OPERACAO | Definir placas + justificativas + retornos |
| CONSULTA | Somente leitura |
