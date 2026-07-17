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

1. **Frota** — placa, tipo, capacidade (motos), motorista padrão, cores de status  
2. **Concessionárias** — cidade, região, distância, tempo médio, tipo permitido  
3. **Roteiros** — multi-concessionária + carga prioritária (manual)  
4. **Definir Placas** — tela exclusiva (Usar/Tirar + drag-and-drop)  
5. **Viagens / Retornos** — previsão, atraso, confirmação de retorno  
6. **Dashboard** — KPIs e ranking  
7. **Histórico / Busca / Relatórios**  
8. **Usuários e Auditoria** — perfis + troca de senha pelo próprio usuário  

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
| admin@frotatms.com | admin123 | Administrador |
| operacao@frotatms.com | operacao123 | Operação |
| consulta@frotatms.com | consulta123 | Consulta |

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
