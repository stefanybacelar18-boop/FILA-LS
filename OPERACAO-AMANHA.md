# Operação amanhã — FilaDock

Guia rápido para usar o sistema no trabalho.

> **Recomendado para teste externo (4G / qualquer rede):** siga **`TESTE-EXTERNO-AMANHA.md`** (Vercel + Supabase).  
> **Alternativa só Wi-Fi da empresa:** seções LAN abaixo.

---

## Modo externo (Vercel) — resumo

1. Vercel → deploy **Ready** na URL `https://....vercel.app`
2. Supabase → Site URL + Redirect URLs apontando para essa URL
3. Google OAuth → **Publish app** (ou test users) para motoristas
4. Admin → geofence + QR code na URL Vercel
5. Testar no celular **com 4G** (desligue Wi-Fi)

Detalhes: **`TESTE-EXTERNO-AMANHA.md`**

---

## Modo LAN (notebook na Wi-Fi) — resumo

## Antes de abrir o pátio (15 min)

### 1. Ligar o servidor no notebook

Abra PowerShell na pasta do projeto:

```powershell
cd C:\Users\Stefanie\Projects\fila-lsl
.\scripts\iniciar-producao.ps1
```

O script:
- Detecta o IP da Wi-Fi da empresa
- Atualiza `NEXT_PUBLIC_APP_URL` no `.env.local`
- Gera o build de produção
- Sobe o servidor na porta **3000**

**Deixe esse notebook ligado e conectado na Wi-Fi o dia todo.**

### 2. Supabase — URLs (se o IP mudou)

No [Supabase Dashboard](https://supabase.com/dashboard) → **Authentication** → **URL Configuration**:

| Campo | Valor |
|-------|-------|
| Site URL | `http://SEU_IP:3000` (ex.: `http://192.168.0.122:3000`) |
| Redirect URLs | `http://SEU_IP:3000/**` |

Salve. Sem isso, login Google dos motoristas pode falhar.

### 3. Admin — geofence do pátio

1. Notebook → `http://SEU_IP:3000/login`
2. Entrar como **admin@lsl.com** *(senha configurada no Supabase)*
3. Em **Administração** → **Perímetro Geográfico**
4. Ajuste latitude, longitude e raio (metros) do pátio LSL
5. Clique **Salvar Configurações**

> Sem mapa visual? Digite lat/lng manualmente (Google Maps → clique direito no pátio → copiar coordenadas).

### 4. Imprimir QR Code

No painel admin, seção **QR Code de Check-in** → imprima ou mostre na entrada do pátio.

Motoristas escaneiam → login Google → check-in.

---

## Quem acessa o quê

| Papel | Dispositivo | URL | Login |
|-------|-------------|-----|-------|
| **Motorista** | Celular | `/login/motorista` | Google (conta pessoal) |
| **Empilhador** | Celular | `/login` | empilhador@lsl.com |
| **Administrador** | Notebook | `/login` | admin@lsl.com |
| **Painel TV** | TV/monitor | `/tv` | Sem login |

**Senhas operacionais:** definidas no Supabase Auth (não versionar no git).

---

## Instalar no celular (atalho na tela inicial)

### Android (Chrome)
1. Abra a URL no Chrome
2. Menu ⋮ → **Adicionar à tela inicial** ou **Instalar app**

### iPhone (Safari)
1. Abra a URL no Safari
2. Compartilhar → **Adicionar à Tela de Início**

Motoristas: use `/login/motorista`  
Empilhador: use `/login`

---

## Fluxo do dia

```
Motorista chega → escaneia QR → Google login → Check-in (GPS no pátio)
    → Tela de sucesso → Acompanhar posição na fila

Empilhador → vê fila → chama motorista (WhatsApp) → muda status

Admin → monitora dashboard, prioridade, libera check-in bloqueado (6 dias)
```

---

## Checklist manhã

- [ ] Notebook na Wi-Fi da empresa, script `iniciar-producao.ps1` rodando
- [ ] Celular de teste abre `http://IP:3000` (mesma Wi-Fi)
- [ ] Login Google motorista funciona
- [ ] Login empilhador e admin funcionam
- [ ] Geofence salvo com coordenadas do pátio real
- [ ] QR code impresso na entrada
- [ ] TV em `/tv` (opcional)

---

## Problemas comuns

| Problema | Solução |
|----------|---------|
| Celular não abre o site | Mesma Wi-Fi? Firewall Windows bloqueando porta 3000? |
| GPS / “fora do perímetro” | Geofence errado ou GPS desligado no celular |
| Login Google falha | Atualizar Site URL e Redirect URLs no Supabase |
| IP mudou | Rodar `iniciar-producao.ps1` de novo + atualizar Supabase |
| iPhone não pede localização | Safari em HTTP pode limitar GPS — prefira Android ou deploy HTTPS |

---

## Alternativa: deploy na internet (HTTPS)

Se a Wi-Fi da empresa for instável ou precisar de HTTPS (GPS no iPhone):

1. Deploy no [Vercel](https://vercel.com) (grátis)
2. Conectar repositório GitHub do projeto
3. Variáveis de ambiente iguais ao `.env.local`
4. Atualizar Supabase Site URL para `https://seu-app.vercel.app`
5. Google OAuth: redirect continua no Supabase (não muda)

---

## Comandos úteis

```powershell
# Produção na rede (recomendado amanhã)
.\scripts\iniciar-producao.ps1

# Ou manualmente
npm run prod:lan

# Desenvolvimento / testes
npm run dev:lan
```

---

## Contas

Criadas no Supabase Auth (Authentication → Users):

| E-mail | Papel | Senha |
|--------|-------|-------|
| empilhador@lsl.com | empilhador | *(Supabase Auth)* |
| admin@lsl.com | administrador | *(Supabase Auth)* |

Motoristas **não** usam essas contas — entram com Google.

SQL de perfis: `supabase/criar-usuarios-fixos.sql`
