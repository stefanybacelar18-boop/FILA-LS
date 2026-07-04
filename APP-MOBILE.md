# App mobile — FilaDock (sem barra de navegador)

O **FilaDock** funciona como **app instalável** (PWA). Aberto pelo ícone na tela inicial, **não mostra barra de endereço** — experiência igual a app de loja.

Admin continua no **navegador do notebook** (URL de produção em `NEXT_PUBLIC_APP_URL`).

---

## Android — instalar como app (recomendado)

1. Chrome → URL de produção (ex.: `https://fila-lsl.vercel.app`)
2. Banner **Instalar app** (parte inferior) **ou** menu ⋮ → **Instalar app**
3. Confirme → ícone **FilaDock** na tela inicial
4. Abra pelo ícone (tela cheia, sem URL)

### Distribuir APK (opcional, mais profissional)

Para enviar um arquivo `.apk` por WhatsApp/e-mail (só Android):

1. Acesse [PWABuilder](https://www.pwabuilder.com/)
2. Cole a URL de produção do FilaDock
3. Clique **Start** → aguarde análise
4. **Package for stores** → **Android** → **Generate**
5. Baixe o `.apk` e distribua aos motoristas

O APK abre o mesmo sistema Vercel em modo app (sem barra).

---

## iPhone — instalar como app

1. **Safari** → URL de produção
2. Botão **Compartilhar** (quadrado com seta)
3. **Adicionar à Tela de Início**
4. Nome: **FilaDock** → Adicionar
5. Abra pelo ícone na home (tela cheia)

> iPhone **não usa APK**. App Store exige conta Apple Developer (~US$ 99/ano).

---

## Motorista vs operacional

| Atalho no app | Rota |
|---------------|------|
| Motorista | `/login/motorista` (Google + check-in) |
| Empilhador / Admin | `/login` |

Atalhos também aparecem ao **pressionar e segurar** o ícone do app (Android).

---

## Admin (notebook)

Use o **navegador normal** — Chrome/Edge no PC:

`/login` na URL de produção

Não precisa instalar app no notebook.

---

## QR code na entrada

No painel admin, o QR code aponta para a URL Vercel. Motorista escaneia → instala ou faz login Google.

---

## Checklist operação

- [ ] Motoristas Android: instalar app ou APK
- [ ] Motoristas iPhone: Adicionar à Tela de Início (Safari)
- [ ] Google OAuth ativo no Supabase
- [ ] Admin: geofence + QR code na URL Vercel
