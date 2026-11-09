# Automação Volu Recebimento Secundário — LSL / SIF

Automatiza o preenchimento diário do **Volu Recebimento** cruzando:

| Fonte | O que fornece |
|-------|--------------|
| **Chronus** (export .xls) | Minutas descarregadas hoje · Em trânsito · Previsão chegada |
| **FrotaTMS API** | Motos expedidas (viagens registradas no dia) |

---

## Uso rápido (Windows)

### 1ª vez — instalar dependências
```
Duplo clique em:  instalar.bat
```

### Todo dia
1. Coloque o export do Chronus na **mesma pasta** que `rodar.bat`
2. Coloque o **Volu Recebimento** do mês na mesma pasta
3. Duplo clique em:
```
rodar.bat
```

O script gera dois arquivos na mesma pasta:
- `Volu_Recebimento_ATUALIZADO_DDMMAAAA.xlsx` — Volu com a linha de hoje preenchida
- `RELATORIO_TRANSITO_DDMMAAAA.xlsx` — Relatório completo de trânsito

---

## O que é preenchido automaticamente

| Campo no Volu | Fonte |
|---------------|-------|
| Consolidado (minutas) | Chronus — minutas com status DESCARREGADA hoje |
| Qde Motos Recebidas | Chronus — soma das motos das minutas descarregadas |
| Qde Motos Expedidas | FrotaTMS API — soma capacidade das viagens do dia |
| Saldo | Calculado: saldo anterior + recebidas − expedidas |

---

## Relatório de Trânsito (abas do Excel gerado)

| Aba | Conteúdo |
|-----|----------|
| **Resumo** | KPIs do dia |
| **Descarregadas Hoje** | Minutas que chegaram hoje (verde) |
| **Em Transito** | Todas em trânsito ordenadas por ETA (azul=hoje, amarelo=amanhã, vermelho=atrasado) |
| **ATRASADAS** | Minutas com ETA vencida e ainda em trânsito (vermelho) |
| **FrotaTMS Viagens** | Viagens registradas no FrotaTMS com placa, destino e capacidade |

---

## Configuração (`config.ini`)

```ini
[frotatms]
url   = https://frota-tms.onrender.com
email = lsl@.com
senha = lsl123

[caminhos]
; Deixe vazio para usar a pasta do script
chronus =
volu    =

[regras]
dias_transito_belem = 5
```

### Troca de senha FrotaTMS
Edite `config.ini` com as credenciais corretas.

### Pasta diferente para os arquivos
Preencha `chronus` e `volu` com os caminhos completos, ex:
```ini
chronus = C:\Users\SeuNome\Downloads
volu    = C:\Controles\Volu_Recebimento_NOVEMBRO.xlsx
```

---

## Previsão de chegada

```
Previsão Chegada = Data Saída Belém + 5 dias
```

Ajuste o número de dias em `config.ini → dias_transito_belem`.

---

## Instalação manual (sem bat)

```bash
pip install openpyxl "xlrd==1.2.0" requests
python automacao_volu_lsl.py
```

---

## Dúvidas

- **FrotaTMS não conecta** → verifique URL e credenciais no `config.ini`
- **Arquivo Chronus não encontrado** → renomeie para conter "carreta", "chegada" ou "minuta"
- **Volu não encontrado** → renomeie para conter "Volu" ou "Recebimento"
