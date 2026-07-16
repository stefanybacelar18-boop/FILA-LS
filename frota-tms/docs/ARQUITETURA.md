# Arquitetura FrotaTMS

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

- **Vehicle** — frota com status automático
- **Dealership** — destino com tempo médio de viagem
- **Route** — roteiro de carregamento
- **RouteVehicle / Trip** — vínculo placa↔roteiro e ciclo de viagem
- **PriorityProduct** — cargas por vencimento
- **User / AuditLog / VehicleHistory** — RBAC e rastreabilidade

## Regras críticas

1. Placa só entra em viagem se `status === DISPONIVEL` e sem trip aberta.
2. Ao atribuir placa: status → `EM_VIAGEM`, registra saída e usuário.
3. Previsão de retorno = saída + `dealership.avgTravelDays`.
4. Ao retornar: status → `DISPONIVEL`, registra data/hora/usuário.
5. Produtos com ≤30 dias marcam roteiros com `hasPriority`.

## Perfis

| Perfil | Pode |
|--------|------|
| ADMIN | Tudo |
| OPERACAO | Definir placas + retornos |
| CONSULTA | Somente leitura |
