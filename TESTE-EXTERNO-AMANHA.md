# Teste externo amanhã — FilaDock (internet / HTTPS)

Guia para operar **fora da Wi-Fi da empresa** (4G, qualquer rede).  
Tempo para ativar hoje à noite: **~10 minutos** na Vercel + **~3 minutos** no Supabase.

---

## O que já está pronto (feito no código)

- [x] Código no GitHub: `stefanybacelar18-boop/FILA-LS` branch `main`
- [x] Build de produção OK (`npm run build`)
- [x] OAuth usa o host do navegador (funciona na URL `.vercel.app`)
- [x] Fallback automático de URL na Vercel se `NEXT_PUBLIC_APP_URL` atrasar

---

## PARTE 1 — Vercel (obrigatório, ~10 min)

### 1.1 Conectar GitHub

1. [vercel.com/dashboard](https://vercel.com/dashboard) → projeto **FilaDock**
2. **Settings** → **Git**
3. **Connected Git Repository** deve ser `stefanybacelar18-boop/FILA-LS`
4. **Production Branch:** `main`

Se não estiver conectado: **Connect Git Repository** → GitHub → **FILA-LS**  
(Não aparece? **Adjust GitHub App Permissions** → marque o repo **FILA-LS**.)

### 1.2 Variáveis de ambiente

**Settings** → **Environment Variables** → adicione **as 4** (marque Production + Preview + Development):

| Nome | Onde copiar |
|------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | [Supabase → Settings → API](https://supabase.com/dashboard/project/xctzcizqoussthitrihm/settings/api) → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Mesma tela → **Publishable** key (`sb_publishable_...`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Mesma tela → **Secret** key (`sb_secret_...`) — **Sensitive** |
| `NEXT_PUBLIC_APP_URL` | Depois do 1º deploy: `https://fila-lsl.vercel.app` (ou a URL que a Vercel mostrar) |

> Pode deixar `NEXT_PUBLIC_APP_URL` em branco no 1º deploy; ajuste depois com a URL real e faça Redeploy.

Opcional (mapa no admin):

| Nome | Valor |
|------|-------|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Cloud → Maps JavaScript API |

**Nunca** ative em produção: `NEXT_PUBLIC_SKIP_GEOFENCE` ou `NEXT_PUBLIC_SKIP_CHECKIN_LIMITS`.

### 1.3 Primeiro deploy

**Deployments** → aguarde aparecer um build após o push, **ou**:

```powershell
cd C:\Users\Stefanie\Projects\fila-lsl
git pull origin main
```

Se não aparecer deploy: **Deployments** → botão **Create Deployment** (se existir) ou reconecte o Git (passo 1.1).

Quando ficar **Ready** (verde): clique **Visit** e copie a URL (ex.: `https://fila-lsl.vercel.app`).

### 1.4 Ajuste final da URL

1. **Settings** → **Environment Variables** → edite `NEXT_PUBLIC_APP_URL` com a URL copiada
2. **Deployments** → **⋯** → **Redeploy**

---

## PARTE 2 — Supabase (~3 min)

Abra: [URL Configuration](https://supabase.com/dashboard/project/xctzcizqoussthitrihm/auth/url-configuration)

Substitua `SUA-URL` pela URL da Vercel (ex.: `https://fila-lsl.vercel.app`):

| Campo | Valor |
|-------|-------|
| **Site URL** | `https://SUA-URL.vercel.app` |
| **Redirect URLs** | `https://SUA-URL.vercel.app/**` |

Mantenha também (se usar LAN no notebook):

```
http://192.168.0.122:3000/**
http://localhost:3000/**
```

**Save.**

---

## PARTE 3 — Google OAuth (motoristas de qualquer lugar)

1. [Google Cloud Console](https://console.cloud.google.com/) → **OAuth consent screen**
2. Se status = **Testing** → motoristas **fora da lista de teste não entram**
3. Para amanhã com qualquer motorista: **Publish app** (ou adicione cada e-mail em **Test users**)

Redirect no Google (não muda):

```
https://xctzcizqoussthitrihm.supabase.co/auth/v1/callback
```

Supabase → [Providers → Google](https://supabase.com/dashboard/project/xctzcizqoussthitrihm/auth/providers?provider=Google) → **Enable** + Client ID/Secret salvos.

---

## PARTE 4 — Banco (se ainda não rodou)

Supabase → **SQL Editor** → execute **nesta ordem**:

1. `supabase/migracao-minuta-inteligente.sql`
2. `supabase/migracao-seguranca-performance.sql`
3. `supabase/criar-usuarios-fixos.sql`

---

## Amanhã — teste com celular em 4G (fora da Wi-Fi)

| # | Teste | URL | Esperado |
|---|-------|-----|----------|
| 1 | Home pública | `https://SUA-URL.vercel.app/` | Página inicial carrega |
| 2 | Painel TV | `/tv` | Fila em tempo real |
| 3 | Admin | `/login` → `admin@lsl.com` / `Admin@2024` | Painel admin |
| 4 | Empilhador | `/login` → `empilhador@lsl.com` / `Empilhador@2024` | Fila operacional |
| 5 | Motorista | `/login/motorista` → Google | Login e redirecionamento |
| 6 | Geofence | Admin → salvar lat/lng do pátio | Mapa ou coordenadas manuais |
| 7 | QR Code | Admin → QR Codes | Aponta para URL Vercel |
| 8 | Check-in | Motorista logado + GPS no pátio | Check-in aceito |

### Contas fixas

| E-mail | Senha | Papel |
|--------|-------|-------|
| admin@lsl.com | Admin@2024 | administrador |
| empilhador@lsl.com | Empilhador@2024 | empilhador |

Motoristas: **Google OAuth** (não usam @lsl.com).

---

## Problemas comuns

| Sintoma | Solução |
|---------|---------|
| Vercel: "No Production Deployment" | Settings → Git conectado + branch `main` + Redeploy |
| Site abre em branco / erro 500 | Deployments → ver log; conferir 4 env vars |
| Login Google falha | Supabase Site URL + Redirect URLs com URL Vercel |
| "Unsupported provider" | Ativar Google no Supabase Providers |
| Motorista não entra no Google | Publicar OAuth app ou adicionar e-mail em Test users |
| Check-in "fora do perímetro" | GPS ligado + geofence correto no admin |
| iPhone GPS estranho | HTTPS na Vercel resolve — use URL `.vercel.app`, não IP LAN |

---

## Plano B (só Wi-Fi da empresa)

Se a Vercel falhar de última hora:

```powershell
cd C:\Users\Stefanie\Projects\fila-lsl
.\scripts\iniciar-producao.ps1
```

URL: `http://SEU_IP:3000` (só mesma rede Wi-Fi).

---

## Links rápidos

- GitHub: https://github.com/stefanybacelar18-boop/FILA-LS
- Vercel: https://vercel.com/dashboard
- Supabase projeto: https://supabase.com/dashboard/project/xctzcizqoussthitrihm
- Supabase URL config: https://supabase.com/dashboard/project/xctzcizqoussthitrihm/auth/url-configuration
