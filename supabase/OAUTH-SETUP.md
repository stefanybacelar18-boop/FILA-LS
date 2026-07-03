# Login Google — Configuração obrigatória (Supabase)

O erro **"Unsupported provider: provider is not enabled"** significa que o **Google ainda não foi ativado** no projeto Supabase. Isso se configura no painel, não no código do app.

## Passo 1 — Ativar Google no Supabase

1. Abra: [Providers → Google](https://supabase.com/dashboard/project/xctzcizqoussthitrihm/auth/providers?provider=Google)
2. Ative **Enable Sign in with Google**
3. Deixe aberto — você vai colar Client ID e Secret no passo 2

## Passo 2 — Credenciais no Google Cloud

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**
2. **Create Credentials** → **OAuth client ID** → tipo **Web application**
3. **Authorized redirect URIs** (copie exatamente):

```
https://xctzcizqoussthitrihm.supabase.co/auth/v1/callback
```

4. Copie **Client ID** e **Client Secret** para o Supabase (passo 1) e salve

## 3. URLs de redirect do app (obrigatório)

1. Abra: [URL Configuration](https://supabase.com/dashboard/project/xctzcizqoussthitrihm/auth/url-configuration)
2. **Site URL:** `http://192.168.0.122:3000` (teste celular) ou `http://localhost:3000` (PC)
3. **Redirect URLs** — adicione:

```
http://192.168.0.122:3000/auth/callback
http://192.168.0.122:3000/**
http://localhost:3000/auth/callback
http://localhost:3000/**
```

4. No `.env.local`: `NEXT_PUBLIC_APP_URL=http://192.168.0.122:3000`

### Produção Vercel (HTTPS — teste externo)

1. Abra: [URL Configuration](https://supabase.com/dashboard/project/xctzcizqoussthitrihm/auth/url-configuration)
2. **Site URL:** `https://fila-lsl.vercel.app` (substitua pela sua URL Vercel)
3. **Redirect URLs** — adicione (mantendo as LAN se precisar):

```
https://fila-lsl.vercel.app/**
https://fila-lsl.vercel.app/auth/callback
```

4. Na Vercel: `NEXT_PUBLIC_APP_URL` = mesma URL

Guia completo: `TESTE-EXTERNO-AMANHA.md`

**Nunca acesse o app por `http://0.0.0.0:3000`** — o navegador não conecta. Use sempre a URL Vercel, `192.168.0.122` ou `localhost`.

## Passo 4 — Testar

1. Aguarde ~1 minuto após salvar
2. Acesse `/login/motorista` → **Continuar com Google**

---

## Erro: "Unable to exchange external code"

O Google abriu, mas o **Supabase não validou** as credenciais. Corrija nesta ordem:

### A) Google Cloud → Credentials → seu cliente OAuth Web

**Authorized redirect URIs** — só esta URL (copie exato):

```
https://xctzcizqoussthitrihm.supabase.co/auth/v1/callback
```

### B) Google Cloud → OAuth consent screen

- Se status for **Testing**: em **Test users**, adicione o e-mail Google do motorista (ex.: `stefanybacelar.18@gmail.com`)
- Ou publique o app (**Publish app**) para qualquer conta Google

### C) Supabase → Providers → Google

1. **Reset secret** no Google Cloud se necessário
2. Cole **Client ID** e **Client Secret** novos no Supabase
3. **Save**

### D) Teste de novo

Use sempre `http://192.168.0.122:3000/login/motorista` (nunca `0.0.0.0`).

## Apple (opcional)

[Providers → Apple](https://supabase.com/dashboard/project/xctzcizqoussthitrihm/auth/providers?provider=Apple) — requer conta Apple Developer.

## Fluxo do motorista

```
/login/motorista → Google → /auth/callback → /checkin → /checkin/sucesso → /minha-fila
```
