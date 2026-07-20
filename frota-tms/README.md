# FrotaTMS — Roteirização e Gestão de Frota

> **Sistema independente do FilaDock.** Todo o código vive em `frota-tms/`.  
> Não altera nem depende do app Next.js na raiz do repositório.

Sistema web para gerenciamento de roteirização de veículos (truck/carreta), focado em operações de carregamento de motos para concessionárias.

## Stack

| Camada | Tecnologia |
|--------|------------|
| Front-end | React 19 + TypeScript + Vite + Tailwind CSS |
| Back-end | Node.js + Express + Socket.IO (JWT) |
| Banco | SQLite (dev local) · **PostgreSQL (produção / Docker)** |
| Auth | JWT + perfis Admin / Operação / Consulta |
| Relatórios | Excel (ExcelJS) e PDF (PDFKit) |

## Módulos

1. **Mesa de Roteirização** (Admin) — notas/cidades → montar rotas → enviar à Operação  
2. **Meu Dia / Planejamento / Alertas** — visão do planejador e central de alertas  
3. **Frota** — placa, tipo, capacidade (motos), motorista padrão, cores de status  
4. **Concessionárias** — cidade, região, distância, tempo médio, tipo permitido  
5. **Roteiros** — multi-concessionária + prioridade manual + meta de veículos  
6. **Definir Placas** (Operação) — tela simples: rota → placas → cobertura → confirmar  
7. **Viagens / Retornos** — previsão, atraso, confirmação de retorno  
8. **Histórico / Busca / Relatórios / Exportação do dia**  
9. **Usuários e Auditoria**  

Docs: `docs/AUDITORIA-PRODUTO.md`, `docs/ESPECIFICACAO-COMPLETA.md`

## Início rápido (dev local — SQLite)

```bash
cd frota-tms
npm install
npm run setup          # deps + DB + seed
npm run dev            # API :4000 + Web :5173
```

Acesse http://localhost:5173

### Contas demo (só desenvolvimento)

| E-mail | Senha | Perfil |
|--------|-------|--------|
| a@a.com | 1 | Administrador |
| o@o.com | 1 | Operação |
| c@c.com | 1 | Consulta |

> Em produção: troque as senhas no menu do usuário (**Trocar senha**) e use `JWT_SECRET` forte.

## Produção (Docker + PostgreSQL)

```bash
cd frota-tms
cp .env.example .env   # edite POSTGRES_PASSWORD e JWT_SECRET

# Primeiro bootstrap (cria admin + frota/concessionárias):
SEED_ON_START=true FORCE_SEED=true docker compose up --build -d

# Uso contínuo (NÃO rode seed de novo):
docker compose up --build -d
```

Acesse http://localhost:4000 — a API já serve o front.

Backup:

```bash
./scripts/backup.sh
```

Guia completo: [DEPLOY-PRODUCAO.md](./DEPLOY-PRODUCAO.md)

## Cores das placas

| Cor | Significado |
|-----|-------------|
| Verde | Disponível / em prazo (2+ dias) |
| Amarelo | Em carregamento |
| Azul | Retorna hoje |
| Laranja | Retorna amanhã |
| Vermelho | Atraso |
| Preto | Manutenção / bloqueado |

## Estrutura

```
frota-tms/          ← único lugar deste sistema (isolado do FilaDock)
├── api/            Express + Prisma + Socket.IO
├── web/            React + Vite
├── Dockerfile      Imagem única (web + api + Postgres-ready)
├── docker-compose.yml
├── render.yaml     Blueprint Render (opcional)
└── scripts/backup.sh
```

## Isolamento do FilaDock

- **FilaDock** = app Next.js na raiz do repo (`src/`, `package.json` raiz, etc.)  
- **FrotaTMS** = pasta `frota-tms/` apenas  
- Deploys, seeds e Docker deste sistema **não** devem apontar para a raiz do FilaDock.
