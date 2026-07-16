# FrotaTMS — Roteirização e Gestão de Frota

Sistema web profissional para gerenciamento de roteirização de veículos de transporte, focado em operações logísticas de carregamento. Substitui o controle manual em papel com interface no estilo TMS/ERP (TOTVS, SAP).

## Stack

| Camada | Tecnologia |
|--------|------------|
| Front-end | React 19 + TypeScript + Vite + Tailwind CSS |
| Back-end | Node.js + Express + Socket.IO |
| Banco | SQLite (dev) via Prisma — PostgreSQL pronto via Docker |
| Auth | JWT + perfis (Admin / Operação / Consulta) |
| Relatórios | Excel (ExcelJS) e PDF (PDFKit) |
| Realtime | Socket.IO |

## Módulos

1. **Cadastro da Frota** — placa, tipo, modelo, capacidade, situação com cores
2. **Concessionárias** — cidade, região, distância, tempo médio, filtro rápido
3. **Roteiros** — criação com destaque de carga prioritária
4. **Definir Placas** — tela exclusiva com seleção e drag-and-drop
5. **Produtos Prioritários** — vencimento com cores e painel 30/15/7/hoje/vencidos
6. **Controle de Viagens** — saída, previsão automática, atraso em vermelho
7. **Retornos** — hoje / amanhã / 2 dias / atraso + botão Retornou
8. **Dashboard** — KPIs, gráficos e ranking
9. **Histórico** — por placa, concessionária, período, usuário, tipo
10. **Pesquisa Inteligente** — placa, produto, lote, motorista, roteiro, cidade
11. **Usuários e Auditoria** — perfis e log de alterações
12. **Relatórios** — PDF e Excel

## Início rápido

```bash
cd frota-tms
npm install
npm run setup          # instala deps, cria DB e seed
npm run dev            # API :4000 + Web :5173
```

Acesse http://localhost:5173

### Contas demo

| E-mail | Senha | Perfil |
|--------|-------|--------|
| admin@frotatms.com | admin123 | Administrador |
| operacao@frotatms.com | operacao123 | Operação (placas/retornos) |
| consulta@frotatms.com | consulta123 | Somente leitura |

## Cores das placas

| Cor | Significado |
|-----|-------------|
| 🟢 Verde | Disponível |
| 🟡 Amarelo | Em carregamento |
| 🔵 Azul | Retorna hoje |
| 🟠 Laranja | Retorna amanhã |
| 🔴 Vermelho | Em viagem / atraso |
| ⚫ Preto | Manutenção / bloqueado |

## Produtos prioritários

| Dias restantes | Cor |
|----------------|-----|
| > 30 | Verde |
| 15–30 | Amarelo |
| < 15 | Laranja |
| < 7 | Vermelho piscando |

## Docker (PostgreSQL + stack)

```bash
cd frota-tms
docker compose up --build
```

Para produção com PostgreSQL, altere em `api/prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

E defina `DATABASE_URL=postgresql://frota:frota@db:5432/frota_tms` no `.env`.

## Estrutura

```
frota-tms/
├── api/                 # Express + Prisma + Socket.IO
│   ├── prisma/          # schema, migrations, seed
│   └── src/
│       ├── routes/      # camadas de API
│       ├── middleware/  # JWT + RBAC
│       ├── services/    # auditoria
│       └── utils/       # cores, prazos
└── web/                 # React + Vite
    └── src/
        ├── pages/       # módulos da UI
        ├── components/  # layout + UI reutilizável
        ├── stores/      # auth + tema
        └── lib/         # api, socket, labels
```

## API (resumo)

- `POST /api/auth/login` — autenticação
- `GET/POST /api/vehicles` — frota
- `GET/POST /api/dealerships` — concessionárias
- `GET/POST /api/routes` — roteiros
- `POST /api/routes/:id/assign-plates` — definir placas
- `GET/POST /api/products` — produtos prioritários
- `GET /api/trips/returns` + `POST /api/trips/:id/return`
- `GET /api/dashboard` — métricas
- `GET /api/search?q=` — pesquisa inteligente
- `GET /api/reports/excel/:type` e `/pdf/:type`

## Expansão futura

Arquitetura em camadas preparada para integração com rastreamento GPS, mapas, BI e ERP.
