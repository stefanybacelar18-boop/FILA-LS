# FilaDock

Plataforma web responsiva para **gestão inteligente de docas** — controle de filas, check-in e operação logística em tempo real.

## Tecnologias

- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS 4**
- **Supabase** (banco, auth, realtime)
- **Google Maps API** (configuração do geofence)

## Funcionalidades

| Módulo | Descrição |
|--------|-----------|
| Check-in (QR Code) | Motorista acessa via QR, validação GPS automática |
| Geofence | Check-in permitido apenas dentro do perímetro configurável |
| Acompanhamento | Tela pública em tempo real com posição na fila |
| Operador | Gerencia fila, status, doca, previsão e WhatsApp |
| Painel TV | Exibe próximo motorista, placa e doca |
| Dashboard | Métricas diárias e ranking de transportadoras |
| Histórico | Registro completo de movimentações |
| Admin | Configura geofence e gera QR Code |

## Perfis

- **Motorista** — check-in e acompanhamento (sem login)
- **Operador** — gerencia fila
- **Supervisor** — dashboard e relatórios
- **Administrador** — configurações do sistema

## Setup

### 1. Clonar e instalar

```bash
cd Projects/fila-lsl
npm install
cp .env.example .env.local
```

### 2. Configurar Supabase

1. Crie um projeto em [supabase.com](https://supabase.com)
2. Execute o SQL em `supabase/schema.sql` no SQL Editor
3. Copie URL e anon key para `.env.local`
4. Em **Authentication > Users**, crie usuários para operadores
5. Atualize o role no metadata ou na tabela `profiles`

### 3. Configurar Google Maps (opcional)

1. Ative a Maps JavaScript API no Google Cloud Console
2. Adicione a API key em `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

### 4. Executar

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000)

## Identidade visual / PWA

Gerar ícones a partir do SVG oficial:

```bash
npm run generate:icons
```

Assets oficiais em `public/brand/`:

| Arquivo | Uso |
|---------|-----|
| `logo-symbol.svg` | Símbolo FD (master 512px) |
| `logo-full.svg` / `logo-full.png` | Logo completa ícone + texto |
| `logo-mark.svg` | Ícone 64px — cabeçalho, login, cards |
| `icons/icon-*.png` | PWA, favicon, iOS/Android |

## Deploy na Vercel (acesso externo / HTTPS)

Guia completo: **`TESTE-EXTERNO-AMANHA.md`**

1. Repositório: `stefanybacelar18-boop/FILA-LS` branch `main`
2. [Vercel](https://vercel.com) → projeto **FilaDock** → Settings → Git conectado
3. Variáveis de ambiente (Production + Preview + Development):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL` (URL `.vercel.app` após 1º deploy)
4. Supabase → Authentication → URL Configuration → Site URL e Redirect URLs com a URL Vercel
5. Google OAuth: redirect continua `https://xctzcizqoussthitrihm.supabase.co/auth/v1/callback`

Verificação local: `.\scripts\verificar-deploy.ps1`

## Rotas

| Rota | Acesso |
|------|--------|
| `/` | Público |
| `/checkin` | Motorista (QR Code) |
| `/fila/[token]` | Acompanhamento público |
| `/login` | Staff |
| `/operador` | Operador+ |
| `/dashboard` | Supervisor+ |
| `/historico` | Operador+ |
| `/tv` | Público (painel TV) |
| `/admin` | Administrador |

## Status da fila

`Aguardando` → `Chamado` → `Em deslocamento` → `Em descarga` → `Finalizado`

Também: `Ausente`, `Cancelado`

## Licença

Projeto privado — PAD SIF / LSL.
