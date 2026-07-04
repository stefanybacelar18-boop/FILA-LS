# Manual FilaDock

**Gestão inteligente de docas · PAD SIF · LSL T. AM**

| | |
|---|---|
| **App** | FilaDock |
| **Produção** | https://fila-lsl.vercel.app |
| **Unidade** | PAD SIF — LSL T. AM |
| **Tipo** | Aplicação web responsiva (PWA) |

---

## 1. O que é o FilaDock

O FilaDock é o sistema de fila de descarga do pátio LSL. Ele conecta **motoristas**, **empilhadores** e **administradores** em um fluxo único:

1. Motorista chega ao pátio e faz **check-in** pelo celular (com validação GPS).
2. Entra automaticamente na **fila ordenada** por prioridade, vencimento de NF e horário.
3. Empilhador **chama o próximo** e comunica via WhatsApp.
4. Administração acompanha **dashboard**, importa **minutas**, configura **geofence** e exporta relatórios.

Atualizações em **tempo real** (Supabase Realtime) em todas as telas operacionais.

---

## 2. Quem usa o sistema

### Motorista

| | |
|---|---|
| **Login** | Google ou Apple em `/login/motorista` |
| **Pode** | Check-in, acompanhar posição na fila, ver fila pública |
| **Não pode** | Acessar painéis operacionais ou administração |

### Empilhador

| | |
|---|---|
| **Login** | E-mail e senha em `/login` |
| **Pode** | Ver fila, chamar motoristas, marcar ausente/finalizado, WhatsApp, resumo pessoal |
| **Não pode** | Editar doca, previsão, prioridade manual ou configurações |

### Administrador

| | |
|---|---|
| **Login** | E-mail e senha em `/login` |
| **Pode** | Tudo do empilhador + doca, previsão, prioridade, minutas, check-ins, histórico, geofence, dashboard completo |

> Papéis legados no banco (`operador`, `supervisor`) são tratados como **empilhador**.

### Contas de teste (desenvolvimento)

| E-mail | Papel |
|--------|-------|
| motorista@lsl.com | Motorista |
| empilhador@lsl.com | Empilhador |
| admin@lsl.com | Administrador |

---

## 3. Mapa de telas

### Públicas (sem login)

| Tela | Endereço | Para quê |
|------|----------|----------|
| **Início** | `/` | Escolher: Motorista, Operacional ou Acompanhar fila |
| **Fila pública** | `/fila-descarga` | Ver fila do pátio em tempo real (minuta + placa) |
| **Tracker** | `/fila/[token]` | Acompanhar posição via link do check-in (LGPD) |
| **Painel TV** | `/tv` | Monitor no pátio — próximo, chamados, docas |
| **Login motorista** | `/login/motorista` | Entrar com Google ou Apple |
| **Login operacional** | `/login` | Entrar empilhador ou admin |

### Motorista (login obrigatório)

| Tela | Endereço | Para quê |
|------|----------|----------|
| **Início** | `/motorista` | Posição na fila ou convite ao check-in |
| **Check-in** | `/checkin` | Formulário da carga (só dentro do pátio) |
| **Sucesso** | `/checkin/sucesso` | Confirmação após check-in |
| **Minha fila** | `/minha-fila` | Posição destacada com atualização ao vivo |

**Menu inferior:** Início · Check-in · Minha fila

### Empilhador

| Tela | Endereço | Para quê |
|------|----------|----------|
| **Fila do pátio** | `/empilhador` | Operação diária — chamar, ausente, finalizar |
| **Meu desempenho** | `/empilhador/dashboard` | Resumo do dia (operações encerradas por você) |

**Menu inferior:** Fila · Resumo

### Administrador

| Tela | Endereço | Para quê |
|------|----------|----------|
| **Administração** | `/admin` | Geofence, QR codes, métricas, liberar check-in |
| **Fila de descarga** | `/admin/fila` | Controle total da fila |
| **Dashboard** | `/dashboard` | Indicadores, gráficos, ranking |
| **Histórico** | `/historico` | Audit trail de mudanças de status |
| **Check-ins** | `/admin/checkins` | Registro tabular + exportação CSV |
| **Minutas** | `/admin/minutas` | Import Excel, expedição, previsões |

---

## 4. Fluxo do motorista (passo a passo)

```
Chegada ao pátio
    → Abrir app / escanear QR
    → Login Google ou Apple
    → GPS confirma localização
    → Preencher check-in
    → Entrar na fila
    → Acompanhar posição até ser chamado
```

### 4.1 Entrada

1. Acesse https://fila-lsl.vercel.app ou escaneie o **QR Code Motorista** (gerado em Administração).
2. Toque em **Motorista** na home ou vá direto para `/login/motorista`.
3. Escolha **Continuar com Google** ou **Continuar com Apple**.

### 4.2 Geofence (GPS)

O check-in só é liberado **dentro do perímetro** configurado pelo administrador.

| Situação | O que acontece |
|----------|----------------|
| Dentro do pátio | Formulário de check-in liberado |
| Fora do pátio | Pode ver a fila, mas check-in bloqueado |
| GPS desligado | Mensagem pedindo para ativar localização |
| Sem HTTPS | GPS pode falhar — use o app instalado ou Vercel |

Mensagem padrão fora do pátio: *"Você ainda não está no pátio da empresa. Aproxime-se da empresa para realizar o check-in."*

### 4.3 Check-in — campos

| Campo | Obrigatório | Observação |
|-------|-------------|------------|
| Minuta | Sim | |
| Nome completo | Sim | Pré-preenchido do perfil |
| Telefone | Sim | Mínimo 10 dígitos |
| Transportadora | Sim | |
| Tipo de veículo | Sim | Convencional ou Bitrem |
| Placa cavalo | Sim | Formato Mercosul (ex.: ABC1D23) |
| Placa carreta | Sim | Formato Mercosul |
| Placa 2ª carreta | Se Bitrem | |
| Retorno com racks vazios | Sim | Sim / Não |
| Observações | Não | |

### 4.4 Após o check-in

- **Sucesso** → tela de confirmação com resumo + link para acompanhar posição.
- **Já na fila** → redirecionado para início do motorista.
- **Cooldown (6 dias)** → mensagem de bloqueio.
- **Fora do pátio** → retorno ao início com aviso.

### 4.5 Acompanhar a fila

- **Início (`/motorista`)** — visão geral: posição, minuta, placa, status, lista do pátio.
- **Minha fila (`/minha-fila`)** — foco na sua posição com destaque visual.
- **Fila pública (`/fila-descarga`)** — sem login, só minuta e placa.
- **Tracker (`/fila/[token]`)** — link único do check-in; placa mascarada (LGPD).

---

## 5. Fluxo do empilhador (passo a passo)

```
Login → Fila do pátio → Selecionar ou "Chamar próximo"
    → WhatsApp abre automaticamente
    → Motorista ausente OU finaliza descarga
    → Resumo no fim do dia
```

### 5.1 Painel da fila

**Título:** Fila do pátio

**Abas:**
- **Aguardando** — veículos ativos + ausentes
- **Finalizadas** — encerradas hoje

**Faixa de resumo:** contadores Aguardando · Finalizadas (hoje)

**Cada card mostra:** posição, minuta, placa, motorista (1º nome), transportadora, status, badges (Prioridade, Prioridade NF, Chamado, Retorna racks), previsão.

### 5.2 Chamar motorista

| Ação | Como |
|------|------|
| **Chamar próximo** | Botão fixo inferior — pega o 1º da fila sem chamada |
| **Chamar selecionado** | Toque no card → painel inferior → WhatsApp |

Ao chamar, o sistema registra a **hora da chamada** e abre o WhatsApp com mensagem padrão (sem número de doca).

### 5.3 Ações por veículo

| Botão | Efeito |
|-------|--------|
| Chamar motorista (WhatsApp) | Registra chamada + abre WhatsApp |
| Motorista ausente | Status → Ausente (permanece no topo até voltar) |
| Finalizar operação | Status → Finalizado |
| Motorista voltou | Reativa ausente → Aguardando descarregamento |
| Reativar na fila | Reativa finalizado → Aguardando descarregamento |

### 5.4 Meu desempenho

Mostra quantas operações **você** encerrou hoje (finalizadas + ausentes), participação percentual no pátio e últimas operações.

---

## 6. Fluxo do administrador

### 6.1 Administração (`/admin`)

| Seção | Função |
|-------|--------|
| **Visão Hoje** | Ativos, finalizados, taxa conclusão, ausentes |
| **Equipe** | Contagem de perfis por papel |
| **Geofence** | Nome, latitude, longitude, raio (m) + mapa |
| **QR Codes** | Links para motorista e operacional |
| **Liberar check-in** | Encerra fila ativa e libera novo check-in (testes) |

### 6.2 Fila de descarga (`/admin/fila`)

Tudo do empilhador, **mais:**

| Recurso | Admin |
|---------|-------|
| Editar doca | ✓ |
| Editar previsão (data) | ✓ |
| Prioridade manual | ✓ |
| Retorno com racks | ✓ |
| Todos os status | ✓ |
| WhatsApp com doca | ✓ |
| Mostrar finalizados/ausentes de hoje | ✓ (checkbox) |

### 6.3 Dashboard (`/dashboard`)

Indicadores do dia (fuso **America/Sao_Paulo**):

- Na fila agora · Chamados · Finalizados · Taxa de conclusão
- Tempo médio espera · Tempo médio descarga · Ausentes
- Gráficos por status, transportadora e hora de chegada
- Atividade recente (últimas 8 minutas)

### 6.4 Check-ins (`/admin/checkins`)

- Busca por minuta, placa ou motorista
- Filtro por status
- Exportação **CSV** (até 2.000 registros)
- Colunas: chegada, finalização, minuta, placa, motorista, transportadora, status, doca, previsão

### 6.5 Minutas (`/admin/minutas`)

| Função | Descrição |
|--------|-----------|
| **Importar Excel** | Planilha Consulta Geral de Motos — agrupa por minuta, calcula vencimento NF |
| **Expedição da noite** | Quantidade de motos expedidas (capacidade diária) |
| **Recalcular fila** | Sincroniza prioridades e previsões automaticamente |
| **Lista de previsão** | Minutas com badges PRIORIDADE, HOJE, volume, vencimento |

### 6.6 Histórico (`/historico`)

Últimas 200 alterações de status com: data, minuta, placa, motorista, status anterior → novo, doca, responsável.

### 6.7 Painel TV (`/tv`)

Ideal para monitor fixo no pátio:

- Relógio em tempo real
- **Próximo motorista** — placa mascarada, minuta, prioridade, previsão
- **Chamados para doca** — placa, minuta, doca
- Atualização automática a cada ~12 segundos

---

## 7. Regras de negócio

### 7.1 Status da fila

| Status | Significado na interface |
|--------|--------------------------|
| Aguardando descarregamento | Na fila, aguardando chamada ou descarga |
| Ausente | Motorista saiu — fica no topo até voltar |
| Finalizado | Descarga encerrada |

> **"Chamado"** não é um status separado. Quando o empilhador chama, o sistema registra a **hora da chamada** (`called_at`) e exibe o badge **Chamado**.

### 7.2 Ordem da fila

1. **Ausentes** — sempre no topo (ordenados por última atualização)
2. **Ativos** — prioridade → menor vencimento NF → horário do check-in
3. **Próximo a chamar** — primeiro ativo **sem** chamada (ausentes no topo são pulados)

### 7.3 Cooldown de check-in

- **6 dias** após o último check-in do motorista
- Administrador pode **liberar check-in** manualmente para testes

### 7.4 Prioridade

| Tipo | Quem define |
|------|-------------|
| **Prioridade manual** | Administrador |
| **Prioridade NF** | Automática — vencimento da NF importada indica urgência |

### 7.5 Previsão de descarga

Calculada com base no volume de motos da minuta e na **capacidade de expedição diária**. Badge **HOJE** quando a previsão é para o dia operacional atual.

### 7.6 Dia operacional

- Fuso: **America/Sao_Paulo** (BRT)
- Contador **"finalizadas hoje"** zera na virada do dia
- Veículos **aguardando** continuam na fila após meia-noite

### 7.7 Contadores

| Contador | Significado |
|----------|-------------|
| Aguardando | Ativos + ausentes na fila viva |
| Finalizadas hoje | Encerradas no dia operacional |
| Chamados | Ativos com hora de chamada registrada |

### 7.8 WhatsApp

**Administrador (com doca):**
> PAD SIF — Motorista da minuta {MINUTA}, favor dirigir-se imediatamente para a doca {DOCA}...

**Empilhador (sem doca):**
> PAD SIF · FilaDock — Olá, motorista da minuta {MINUTA}! Você foi chamado para descarregamento no pátio...

### 7.9 Privacidade (LGPD)

- Fila pública e TV: **placa mascarada** (**** + últimos 4 caracteres)
- Tracker: sem nome completo do motorista
- API pública: sem telefone, CPF ou dados de dispositivo

---

## 8. Instalar o app (PWA)

O FilaDock pode ser instalado no celular como app:

| Plataforma | Como instalar |
|------------|---------------|
| **Android / Chrome** | Banner "Instalar app" ou menu → Instalar |
| **iPhone / Safari** | Compartilhar → Adicionar à Tela de Início |

Benefícios: abre em tela cheia, ícone na home, melhor experiência com GPS.

O banner de instalação **não aparece** dentro das telas logadas (motorista, empilhador, admin).

---

## 9. Glossário

| Termo | Significado |
|-------|-------------|
| **Minuta** | Identificador da carga/remessa |
| **Geofence** | Perímetro GPS do pátio |
| **Check-in** | Registro de entrada na fila |
| **Doca** | Local de descarga designado |
| **Previsão** | Data estimada de descarga |
| **Prioridade NF** | Urgência por vencimento de nota fiscal |
| **Tracker** | Link público de acompanhamento por token |
| **PWA** | App instalável via navegador |

---

## 10. Referência rápida por perfil

### Motorista — o que fazer?

1. Instalar o app ou abrir no navegador
2. Login Google/Apple
3. Esperar GPS confirmar pátio
4. Check-in com dados da carga
5. Acompanhar posição em **Minha fila**
6. Aguardar WhatsApp de chamada

### Empilhador — o que fazer?

1. Login e-mail/senha
2. Abrir **Fila do pátio**
3. Chamar próximo ou selecionar veículo
4. Marcar ausente ou finalizar conforme operação
5. Ver **Resumo** no fim do turno

### Administrador — o que fazer?

1. Configurar geofence e QR codes
2. Importar minutas e definir expedição
3. Monitorar dashboard e fila
4. Exportar check-ins quando necessário
5. Colocar **Painel TV** no monitor do pátio

---

## 11. Suporte técnico

| Item | Detalhe |
|------|---------|
| **Produção** | https://fila-lsl.vercel.app |
| **Repositório** | github.com/stefanybacelar18-boop/FILA-LS |
| **Deploy** | Automático via Vercel (branch `main`) |
| **Banco / Auth** | Supabase |
| **Documentação dev** | Ver `README.md` e pasta `docs/` |

---

*Manual gerado com base no código do FilaDock. Versão alinhada ao deploy em produção.*
