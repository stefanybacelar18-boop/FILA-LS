"""
=============================================================
  AUTOMAÇÃO VOLU RECEBIMENTO SECUNDÁRIO — LSL / SIF
  Integração: Chronus (chegada de carreta) + FrotaTMS API
=============================================================

Como usar:
  1. Coloque este script na mesma pasta que os seus arquivos Excel.
  2. Coloque o export do Chronus (chegada de carreta) na mesma pasta.
  3. Dê duplo clique em "rodar.bat" (Windows) ou execute:
       python automacao_volu_lsl.py
  4. O script atualiza o Volu e gera o relatório de trânsito automaticamente.

Requisitos:
  pip install openpyxl xlrd requests
"""

import os
import sys
import glob
import configparser
import traceback
from datetime import datetime, timedelta, date
from pathlib import Path

try:
    import openpyxl
    from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
except ImportError:
    print("ERRO: openpyxl não instalado. Execute: pip install openpyxl")
    input("Pressione Enter para fechar...")
    sys.exit(1)

try:
    import xlrd
except ImportError:
    print("ERRO: xlrd não instalado. Execute: pip install xlrd==1.2.0")
    input("Pressione Enter para fechar...")
    sys.exit(1)

try:
    import requests
    REQUESTS_OK = True
except ImportError:
    REQUESTS_OK = False

# ── Cores Excel ────────────────────────────────────────────────────────────────
COR_VERDE       = PatternFill("solid", fgColor="C6EFCE")
COR_VERDE_TEXTO = Font(color="276221", bold=True)
COR_AMARELO     = PatternFill("solid", fgColor="FFEB9C")
COR_AMARELO_TXT = Font(color="9C6500", bold=True)
COR_VERMELHO    = PatternFill("solid", fgColor="FFC7CE")
COR_VERMELHO_TXT= Font(color="9C0006", bold=True)
COR_AZUL        = PatternFill("solid", fgColor="DDEEFF")
COR_AZUL_TXT    = Font(color="003399", bold=True)
COR_HEADER      = PatternFill("solid", fgColor="2F5496")
COR_HEADER_TXT  = Font(color="FFFFFF", bold=True)
COR_HOJE        = PatternFill("solid", fgColor="E2EFDA")

BORDA = Border(
    left=Side(style="thin"), right=Side(style="thin"),
    top=Side(style="thin"),  bottom=Side(style="thin"),
)

PASTA_SCRIPT = Path(__file__).resolve().parent


# ══════════════════════════════════════════════════════════════════════════════
#  CONFIGURAÇÃO
# ══════════════════════════════════════════════════════════════════════════════

def carregar_config() -> dict:
    cfg = configparser.ConfigParser()
    cfg_path = PASTA_SCRIPT / "config.ini"
    if cfg_path.exists():
        cfg.read(cfg_path, encoding="utf-8")

    return {
        "frotatms_url":    cfg.get("frotatms", "url",      fallback="https://frota-tms.onrender.com"),
        "frotatms_email":  cfg.get("frotatms", "email",    fallback="lsl@.com"),
        "frotatms_senha":  cfg.get("frotatms", "senha",    fallback="lsl123"),
        "pasta_chronus":   cfg.get("caminhos", "chronus",  fallback=str(PASTA_SCRIPT)),
        "arquivo_volu":    cfg.get("caminhos", "volu",     fallback=""),
        "dias_transit":    int(cfg.get("regras", "dias_transito_belem", fallback="5")),
    }


# ══════════════════════════════════════════════════════════════════════════════
#  STEP 1 — ENCONTRAR ARQUIVOS
# ══════════════════════════════════════════════════════════════════════════════

EXCEL_EXTS = {".xls", ".xlsx", ".xlsm", ".xltx"}


def _so_excel(caminhos: list[str]) -> list[str]:
    """Filtra apenas arquivos Excel reais (exclui .py, .bat, etc.)."""
    return [f for f in caminhos if Path(f).suffix.lower() in EXCEL_EXTS]


def encontrar_arquivo_chronus(pasta: str) -> str:
    """Encontra o export mais recente do Chronus na pasta."""
    padroes = [
        "*chronus*.xls*", "*Chronus*.xls*",
        "*carreta*.xls*", "*Carreta*.xls*",
        "*chegada*.xls*", "*Chegada*.xls*",
        "*minuta*.xls*",  "*Minuta*.xls*",
        "*.xls", "*.xlsx",
    ]
    candidatos = []
    for p in padroes:
        candidatos.extend(glob.glob(os.path.join(pasta, p)))

    unicos = _so_excel(list(dict.fromkeys(candidatos)))
    unicos_sorted = sorted(unicos, key=os.path.getmtime, reverse=True)

    # Exclui arquivos gerados por este script
    saidas = {"RELATORIO_TRANSITO", "Volu_Recebimento_ATUALIZADO"}
    unicos_sorted = [f for f in unicos_sorted if not any(s in f for s in saidas)]

    return unicos_sorted[0] if unicos_sorted else ""


def encontrar_arquivo_volu(pasta: str) -> str:
    """Encontra o Volu Recebimento na pasta."""
    padroes = [
        "*[Vv]olu*.xlsx", "*[Vv]olu*.xlsm",
        "*[Rr]ecebimento*.xlsx",
        "*SIF*.xlsx", "*LSL*.xlsx",
    ]
    candidatos = []
    for p in padroes:
        candidatos.extend(glob.glob(os.path.join(pasta, p)))

    # Exclui arquivos gerados por este script
    candidatos = [f for f in candidatos if "ATUALIZADO" not in f]
    unicos = sorted(set(candidatos), key=os.path.getmtime, reverse=True)
    return unicos[0] if unicos else ""


# ══════════════════════════════════════════════════════════════════════════════
#  STEP 2 — LER CHRONUS (chegada de carreta)
# ══════════════════════════════════════════════════════════════════════════════

def _parse_data_chronus(val) -> date | None:
    """Converte célula do Chronus para date."""
    if not val:
        return None
    if isinstance(val, (datetime, date)):
        return val.date() if isinstance(val, datetime) else val
    s = str(val).strip()
    if not s:
        return None
    for fmt in ("%d/%m/%Y %H:%M", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s.split(".")[0], fmt).date()
        except ValueError:
            continue
    return None


def ler_chronus(caminho: str) -> list[dict]:
    """
    Lê o arquivo de chegada de carreta exportado do Chronus.
    Colunas esperadas (em qualquer ordem):
      Data Saída Belém · Data Chegada · Minuta · Qtd de moto · Status · Data Descarregamento
    """
    ext = Path(caminho).suffix.lower()
    rows = []

    if ext == ".xls":
        wb = xlrd.open_workbook(caminho)
        ws = wb.sheet_by_index(0)
        raw_headers = [str(ws.cell_value(0, c)).strip() for c in range(ws.ncols)]
        for r in range(1, ws.nrows):
            row_vals = ws.row_values(r)
            rows.append(dict(zip(raw_headers, row_vals)))
    else:
        wb = openpyxl.load_workbook(caminho, data_only=True)
        ws = wb.active
        raw_headers = None
        for row in ws.iter_rows(values_only=True):
            if raw_headers is None:
                raw_headers = [str(c).strip() if c is not None else "" for c in row]
            else:
                rows.append(dict(zip(raw_headers, row)))

    # Normaliza nomes de colunas (case/espaço insensível)
    mapa_colunas = {
        "saida_belem":   ["Data Saída Belém", "Data Saida Belem", "Saida Belem", "DT SAIDA BELEM"],
        "chegada":       ["Data Chegada", "DT CHEGADA", "Data de Chegada"],
        "minuta":        ["Minuta", "MINUTA", "Nro Minuta", "Número Minuta"],
        "qtd_motos":     ["Qtd de moto", "Qtd Motos", "QUANTIDADE MOTOS", "Qtde Moto"],
        "status":        ["Status", "STATUS", "Situação"],
        "descarregamento": ["Data Descarregamento", "DT DESCARREGAMENTO", "Data Descarga"],
    }

    def achar_col(row_dict: dict, opcoes: list[str]) -> str | None:
        for op in opcoes:
            if op in row_dict:
                return op
        # fuzzy: contém
        for op in opcoes:
            for k in row_dict:
                if op.lower().replace(" ", "") in k.lower().replace(" ", ""):
                    return k
        return None

    # Detecta mapeamento a partir da primeira linha real
    if not rows:
        return []
    mapa = {}
    for campo, opcoes in mapa_colunas.items():
        col = achar_col(rows[0], opcoes)
        mapa[campo] = col

    minutas = []
    for r in rows:
        minuta_num = str(r.get(mapa.get("minuta", ""), "")).strip().split(".")[0]
        if not minuta_num or minuta_num in ("0", "nan", "None", ""):
            continue

        qtd_raw = r.get(mapa.get("qtd_motos", ""), 0) or 0
        try:
            qtd = int(float(qtd_raw))
        except (ValueError, TypeError):
            qtd = 0

        status = str(r.get(mapa.get("status", ""), "")).strip().upper()
        saida_val = r.get(mapa.get("saida_belem", ""), "")
        chegada_val = r.get(mapa.get("chegada", ""), "")
        descarga_val = r.get(mapa.get("descarregamento", ""), "")

        saida_dt     = _parse_data_chronus(saida_val)
        chegada_dt   = _parse_data_chronus(chegada_val)
        descarga_dt  = _parse_data_chronus(descarga_val)

        minutas.append({
            "minuta":       minuta_num,
            "qtd_motos":    qtd,
            "status":       status,
            "saida_belem":  saida_dt,
            "data_chegada": chegada_dt,
            "descarregamento": descarga_dt,
        })

    return minutas


# ══════════════════════════════════════════════════════════════════════════════
#  STEP 3 — FROTATMS API (motos expedidas)
# ══════════════════════════════════════════════════════════════════════════════

def frotatms_login(url: str, email: str, senha: str) -> str | None:
    if not REQUESTS_OK:
        return None
    try:
        resp = requests.post(
            f"{url.rstrip('/')}/api/auth/login",
            json={"email": email, "password": senha},
            timeout=15,
        )
        if resp.ok:
            return resp.json().get("token")
    except Exception as e:
        print(f"  [FrotaTMS] Falha no login: {e}")
    return None


def frotatms_motos_expedidas(url: str, token: str, data_ref: date) -> tuple[int, list[dict]]:
    """
    Retorna (total_motos_expedidas, lista_de_viagens) para a data_ref.
    Soma vehicle.capacityMotos de cada viagem que partiu na data_ref.
    """
    if not REQUESTS_OK or not token:
        return 0, []

    start = datetime.combine(data_ref, datetime.min.time()).isoformat()
    end   = datetime.combine(data_ref, datetime.max.time().replace(microsecond=0)).isoformat()

    try:
        resp = requests.get(
            f"{url.rstrip('/')}/api/trips",
            params={"from": start, "to": end, "all": "true"},
            headers={"Authorization": f"Bearer {token}"},
            timeout=20,
        )
        if not resp.ok:
            print(f"  [FrotaTMS] Trips retornou {resp.status_code}")
            return 0, []

        trips = resp.json()
        viagens = []
        total = 0
        for t in trips:
            if t.get("status") in ("CANCELADO",):
                continue
            cap = int(t.get("vehicle", {}).get("capacityMotos", 0) or 0)
            total += cap
            viagens.append({
                "placa":       t.get("vehicle", {}).get("plate", "?"),
                "concessionaria": t.get("dealership", {}).get("name", "?"),
                "cidade":      t.get("dealership", {}).get("city", "?"),
                "capacidade":  cap,
                "status":      t.get("status", "?"),
                "saida":       t.get("departureAt", "")[:10],
                "previsao_ret": t.get("expectedReturn", "")[:10],
            })
        return total, viagens
    except Exception as e:
        print(f"  [FrotaTMS] Erro ao buscar viagens: {e}")
        return 0, []


# ══════════════════════════════════════════════════════════════════════════════
#  STEP 4 — PROCESSAR DADOS CHRONUS
# ══════════════════════════════════════════════════════════════════════════════

def processar_minutas(minutas: list[dict], data_ref: date, dias_transito: int) -> dict:
    descarregadas_hoje = []
    em_transito        = []
    atrasadas          = []

    for m in minutas:
        status = m["status"]

        if "DESCARREGADA" in status or "ENTREGUE" in status:
            if m["data_chegada"] == data_ref or m["descarregamento"] == data_ref:
                descarregadas_hoje.append(m)

        elif "TRANSITO" in status or "TRÂNSITO" in status or "EM TRANSITO" in status.replace("Â","A"):
            eta = None
            if m["saida_belem"]:
                eta = m["saida_belem"] + timedelta(days=dias_transito)
            m["eta"] = eta

            if eta and eta < data_ref:
                atrasadas.append(m)
            else:
                em_transito.append(m)

    # Agrupa em trânsito por ETA
    por_eta: dict[str, list] = {}
    sem_data = []
    for m in em_transito:
        if m["eta"]:
            chave = m["eta"].strftime("%d/%m/%Y")
            por_eta.setdefault(chave, []).append(m)
        else:
            sem_data.append(m)

    return {
        "descarregadas_hoje": descarregadas_hoje,
        "em_transito":        em_transito,
        "atrasadas":          atrasadas,
        "por_eta":            dict(sorted(por_eta.items(), key=lambda x: datetime.strptime(x[0], "%d/%m/%Y"))),
        "sem_data":           sem_data,
        "total_minutas_hoje": len(descarregadas_hoje),
        "total_motos_hoje":   sum(m["qtd_motos"] for m in descarregadas_hoje),
    }


# ══════════════════════════════════════════════════════════════════════════════
#  STEP 5 — ATUALIZAR VOLU RECEBIMENTO
# ══════════════════════════════════════════════════════════════════════════════

def _encontrar_linha_e_colunas(caminho_volu: str, data_ref: date) -> tuple[int | None, dict]:
    """
    Abre com data_only=True para ler valores calculados das fórmulas.
    Retorna (numero_da_linha, mapa_de_colunas).
    """
    wb = openpyxl.load_workbook(caminho_volu, data_only=True)
    ws = wb.active

    colunas: dict = {}
    linha_data: int | None = None

    # 1) Detectar linha de cabeçalho
    linha_header = None
    for row in ws.iter_rows(max_row=25):
        vals = [str(c.value or "").strip().lower() for c in row]
        if "data" in vals and any("consolidado" in v or "minuta" in v for v in vals):
            linha_header = row[0].row
            for cell in row:
                v = str(cell.value or "").strip().lower()
                col = cell.column
                if v == "data":
                    colunas["data"] = col
                elif "consolidado" in v:
                    colunas["consolidado"] = col
                elif "cabotagem" in v:
                    colunas["cabotagem"] = col
                elif "rodoviár" in v or "rodoviario" in v:
                    colunas["rodoviario"] = col
                elif "recebidas" in v or "recebida" in v:
                    colunas["recebidas"] = col
                elif "expedidas" in v or "expedida" in v:
                    colunas["expedidas"] = col
                elif "saldo" in v:
                    colunas["saldo"] = col
                elif "atraso" in v and "lsl" in v:
                    colunas["atraso_lsl"] = col
                elif "atraso" in v:
                    colunas["atraso"] = col
                elif "observa" in v:
                    colunas["obs"] = col
            break

    # 2) Encontrar linha da data_ref (ler valores calculados)
    if linha_header:
        for row in ws.iter_rows(min_row=linha_header + 1, max_row=linha_header + 60):
            v = row[0].value
            if isinstance(v, datetime) and v.date() == data_ref:
                linha_data = row[0].row
                break
            if isinstance(v, date) and v == data_ref:
                linha_data = row[0].row
                break

    wb.close()
    return linha_data, colunas


def atualizar_volu(caminho_volu: str, data_ref: date, resultado: dict,
                   motos_expedidas: int, caminho_saida: str = "") -> bool:
    """
    Lê o Volu Recebimento (preservando fórmulas), preenche a linha de data_ref e salva.
    Colunas preenchidas: Rodoviário, Qde Motos Recebidas, Qde Motos Expedidas.
    Consolidado e Saldo são fórmulas — se calculam automaticamente no Excel.
    """
    if not caminho_volu or not os.path.exists(caminho_volu):
        print(f"  [Volu] Arquivo não encontrado: {caminho_volu}")
        return False

    linha, colunas = _encontrar_linha_e_colunas(caminho_volu, data_ref)

    if not colunas:
        print("  [Volu] Não foi possível detectar as colunas automaticamente.")
        return False

    if not linha:
        print(f"  [Volu] Linha da data {data_ref.strftime('%d/%m/%Y')} não encontrada.")
        return False

    total_minutas = resultado["total_minutas_hoje"]
    total_motos   = resultado["total_motos_hoje"]

    # Abre SEM data_only para preservar as fórmulas existentes ao salvar
    wb = openpyxl.load_workbook(caminho_volu)
    ws = wb.active

    def set_cell(col_key: str, value, fill=None):
        if col_key in colunas:
            cell = ws.cell(row=linha, column=colunas[col_key])
            # Não sobrescreve fórmulas — só preenche células manuais
            if cell.data_type != "f":
                cell.value = value
                if fill:
                    cell.fill = fill
                cell.border = BORDA

    # Preenche apenas as colunas de entrada manual
    # Consolidado (col B) e Saldo (col G) são fórmulas — não tocar
    set_cell("rodoviario", total_minutas, fill=COR_HOJE)
    set_cell("recebidas",  total_motos,   fill=COR_HOJE)
    set_cell("expedidas",  motos_expedidas if motos_expedidas else None, fill=COR_HOJE)

    # Destaca a linha toda com cor suave (apenas células sem fill)
    for col in range(1, ws.max_column + 1):
        c = ws.cell(row=linha, column=col)
        try:
            if c.fill.fgColor.rgb in ("00000000", "FFFFFFFF", "FF000000"):
                c.fill = COR_HOJE
        except Exception:
            pass

    saida = caminho_saida or caminho_volu
    wb.save(saida)
    return True


# ══════════════════════════════════════════════════════════════════════════════
#  STEP 6 — GERAR RELATÓRIO DE TRÂNSITO
# ══════════════════════════════════════════════════════════════════════════════

def _header_row(ws, colunas: list[str], linha: int = 1):
    for i, titulo in enumerate(colunas, 1):
        c = ws.cell(row=linha, column=i, value=titulo)
        c.fill = COR_HEADER
        c.font = COR_HEADER_TXT
        c.border = BORDA
        c.alignment = Alignment(horizontal="center", wrap_text=True)
    ws.row_dimensions[linha].height = 30


def _auto_width(ws, minimo=10, maximo=40):
    for col in ws.columns:
        maxlen = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            try:
                if cell.value:
                    maxlen = max(maxlen, len(str(cell.value)))
            except Exception:
                pass
        ws.column_dimensions[col_letter].width = max(minimo, min(maximo, maxlen + 2))


def gerar_relatorio_transito(resultado: dict, data_ref: date, viagens_frota: list[dict],
                              caminho_saida: str):
    wb = openpyxl.Workbook()

    # ── Aba 1: Resumo ──────────────────────────────────────────────────────────
    ws_res = wb.active
    ws_res.title = "Resumo"

    ws_res["A1"] = f"RELATÓRIO DE TRÂNSITO LSL — {data_ref.strftime('%d/%m/%Y')}"
    ws_res["A1"].font = Font(size=14, bold=True, color="2F5496")
    ws_res.merge_cells("A1:D1")

    ws_res["A3"] = "Indicador"
    ws_res["B3"] = "Valor"
    ws_res["A3"].font = Font(bold=True); ws_res["B3"].font = Font(bold=True)

    kpis = [
        ("Minutas descarregadas hoje",     resultado["total_minutas_hoje"]),
        ("Motos recebidas hoje (Chronus)", resultado["total_motos_hoje"]),
        ("Minutas em trânsito",            len(resultado["em_transito"])),
        ("Minutas atrasadas",              len(resultado["atrasadas"])),
        ("Sem data de saída (Belém)",      len(resultado["sem_data"])),
    ]
    for i, (label, valor) in enumerate(kpis, 4):
        ws_res.cell(row=i, column=1, value=label).border = BORDA
        c = ws_res.cell(row=i, column=2, value=valor)
        c.border = BORDA
        c.alignment = Alignment(horizontal="right")
        if label == "Minutas atrasadas" and valor > 0:
            c.fill = COR_VERMELHO
            c.font = COR_VERMELHO_TXT

    _auto_width(ws_res)

    # ── Aba 2: Descarregadas Hoje ──────────────────────────────────────────────
    ws_desc = wb.create_sheet("Descarregadas Hoje")
    hdrs = ["Minuta", "Saída Belém", "Data Chegada", "Descarregamento", "Qtd Motos", "Status"]
    _header_row(ws_desc, hdrs)

    total_motos_linha = 0
    for i, m in enumerate(resultado["descarregadas_hoje"], 2):
        ws_desc.cell(i, 1, m["minuta"]).border = BORDA
        ws_desc.cell(i, 2, m["saida_belem"].strftime("%d/%m/%Y") if m["saida_belem"] else "—").border = BORDA
        ws_desc.cell(i, 3, m["data_chegada"].strftime("%d/%m/%Y") if m["data_chegada"] else "—").border = BORDA
        ws_desc.cell(i, 4, m["descarregamento"].strftime("%d/%m/%Y") if m["descarregamento"] else "—").border = BORDA
        c_motos = ws_desc.cell(i, 5, m["qtd_motos"])
        c_motos.border = BORDA
        c_motos.alignment = Alignment(horizontal="right")
        ws_desc.cell(i, 6, m["status"]).border = BORDA
        for col in range(1, 7):
            ws_desc.cell(i, col).fill = COR_VERDE
        total_motos_linha += m["qtd_motos"]

    # Totalizador
    tot_row = len(resultado["descarregadas_hoje"]) + 2
    ws_desc.cell(tot_row, 1, "TOTAL").font = Font(bold=True)
    c_tot = ws_desc.cell(tot_row, 5, total_motos_linha)
    c_tot.font = Font(bold=True)
    c_tot.alignment = Alignment(horizontal="right")
    c_tot.fill = PatternFill("solid", fgColor="CCCCCC")

    _auto_width(ws_desc)

    # ── Aba 3: Em Trânsito (por ETA) ──────────────────────────────────────────
    ws_tran = wb.create_sheet("Em Transito")
    hdrs_t = ["Minuta", "Saída Belém", "Previsão Chegada", "Qtd Motos", "Dias Faltando"]
    _header_row(ws_tran, hdrs_t)

    linha_t = 2
    for eta_str, minutas_eta in resultado["por_eta"].items():
        eta_dt = datetime.strptime(eta_str, "%d/%m/%Y").date()
        dias_faltando = (eta_dt - data_ref).days

        for m in minutas_eta:
            ws_tran.cell(linha_t, 1, m["minuta"]).border = BORDA
            ws_tran.cell(linha_t, 2, m["saida_belem"].strftime("%d/%m/%Y") if m["saida_belem"] else "—").border = BORDA
            ws_tran.cell(linha_t, 3, eta_str).border = BORDA
            c_m = ws_tran.cell(linha_t, 4, m["qtd_motos"])
            c_m.border = BORDA
            c_m.alignment = Alignment(horizontal="right")
            c_dias = ws_tran.cell(linha_t, 5, dias_faltando)
            c_dias.border = BORDA
            c_dias.alignment = Alignment(horizontal="center")

            if eta_dt == data_ref:
                for col in range(1, 6):
                    ws_tran.cell(linha_t, col).fill = COR_AZUL
            elif dias_faltando == 1:
                for col in range(1, 6):
                    ws_tran.cell(linha_t, col).fill = COR_AMARELO
            elif dias_faltando <= 0:
                for col in range(1, 6):
                    ws_tran.cell(linha_t, col).fill = COR_VERMELHO

            linha_t += 1

    # Sem data
    for m in resultado["sem_data"]:
        ws_tran.cell(linha_t, 1, m["minuta"]).border = BORDA
        ws_tran.cell(linha_t, 2, "—").border = BORDA
        ws_tran.cell(linha_t, 3, "Sem data de saída").border = BORDA
        c_m2 = ws_tran.cell(linha_t, 4, m["qtd_motos"])
        c_m2.border = BORDA
        c_m2.alignment = Alignment(horizontal="right")
        ws_tran.cell(linha_t, 5, "—").border = BORDA
        linha_t += 1

    _auto_width(ws_tran)

    # ── Aba 4: Atrasadas ──────────────────────────────────────────────────────
    if resultado["atrasadas"]:
        ws_atr = wb.create_sheet("ATRASADAS")
        hdrs_a = ["Minuta", "Saída Belém", "Previsão Era", "Dias de Atraso", "Qtd Motos"]
        _header_row(ws_atr, hdrs_a)

        for i, m in enumerate(resultado["atrasadas"], 2):
            eta = m.get("eta")
            dias_atraso = (data_ref - eta).days if eta else "?"
            ws_atr.cell(i, 1, m["minuta"]).border = BORDA
            ws_atr.cell(i, 2, m["saida_belem"].strftime("%d/%m/%Y") if m["saida_belem"] else "—").border = BORDA
            ws_atr.cell(i, 3, eta.strftime("%d/%m/%Y") if eta else "?").border = BORDA
            c_dias_a = ws_atr.cell(i, 4, dias_atraso)
            c_dias_a.border = BORDA
            c_dias_a.alignment = Alignment(horizontal="center")
            c_motos_a = ws_atr.cell(i, 5, m["qtd_motos"])
            c_motos_a.border = BORDA
            c_motos_a.alignment = Alignment(horizontal="right")
            for col in range(1, 6):
                ws_atr.cell(i, col).fill = COR_VERMELHO
                ws_atr.cell(i, col).font = COR_VERMELHO_TXT

        _auto_width(ws_atr)

    # ── Aba 5: FrotaTMS Viagens ────────────────────────────────────────────────
    if viagens_frota:
        ws_frota = wb.create_sheet("FrotaTMS Viagens")
        hdrs_f = ["Placa", "Concessionária", "Cidade", "Capacidade Motos", "Status", "Saída", "Previsão Retorno"]
        _header_row(ws_frota, hdrs_f)

        total_cap = 0
        for i, v in enumerate(viagens_frota, 2):
            ws_frota.cell(i, 1, v["placa"]).border = BORDA
            ws_frota.cell(i, 2, v["concessionaria"]).border = BORDA
            ws_frota.cell(i, 3, v["cidade"]).border = BORDA
            c_cap = ws_frota.cell(i, 4, v["capacidade"])
            c_cap.border = BORDA
            c_cap.alignment = Alignment(horizontal="right")
            ws_frota.cell(i, 5, v["status"]).border = BORDA
            ws_frota.cell(i, 6, v["saida"]).border = BORDA
            ws_frota.cell(i, 7, v["previsao_ret"]).border = BORDA
            total_cap += v["capacidade"]

        tot_f = len(viagens_frota) + 2
        ws_frota.cell(tot_f, 1, "TOTAL").font = Font(bold=True)
        ws_frota.cell(tot_f, 4, total_cap).font = Font(bold=True)

        _auto_width(ws_frota)

    wb.save(caminho_saida)


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════════

def separador(titulo=""):
    print("\n" + "=" * 60)
    if titulo:
        print(f"  {titulo}")
        print("=" * 60)


def main():
    separador("AUTOMAÇÃO VOLU RECEBIMENTO LSL")
    print(f"  Data de referência: {datetime.today().strftime('%d/%m/%Y')}\n")

    cfg = carregar_config()
    data_ref = date.today()

    # ── Localizar arquivos ───────────────────────────────────────────────────
    separador("LOCALIZANDO ARQUIVOS")

    pasta_chronus = cfg["pasta_chronus"] if os.path.isdir(cfg["pasta_chronus"]) else str(PASTA_SCRIPT)
    arq_chronus   = encontrar_arquivo_chronus(pasta_chronus)

    pasta_volu  = str(PASTA_SCRIPT)
    arq_volu    = cfg["arquivo_volu"] if cfg["arquivo_volu"] and os.path.exists(cfg["arquivo_volu"]) \
                  else encontrar_arquivo_volu(pasta_volu)

    if arq_chronus:
        print(f"  [Chronus]  {os.path.basename(arq_chronus)}")
    else:
        print("  [Chronus]  NENHUM ARQUIVO ENCONTRADO")
        print("  Coloque o export do Chronus na mesma pasta que este script.")

    if arq_volu:
        print(f"  [Volu]     {os.path.basename(arq_volu)}")
    else:
        print("  [Volu]     NENHUM ARQUIVO ENCONTRADO")

    # ── Ler Chronus ──────────────────────────────────────────────────────────
    separador("LENDO CHRONUS (CHEGADA DE CARRETA)")
    minutas = []
    if arq_chronus:
        try:
            minutas = ler_chronus(arq_chronus)
            print(f"  Total de minutas no arquivo: {len(minutas)}")
            descarr = sum(1 for m in minutas if "DESCARREGADA" in m["status"] or "ENTREGUE" in m["status"])
            transito = sum(1 for m in minutas if "TRANSITO" in m["status"].replace("Â","A").upper())
            print(f"  → Descarregadas: {descarr}   |   Em trânsito: {transito}")
        except Exception as e:
            print(f"  ERRO ao ler Chronus: {e}")
            traceback.print_exc()
    else:
        print("  Pulando — arquivo não encontrado.")

    # ── Processar minutas ────────────────────────────────────────────────────
    resultado = processar_minutas(minutas, data_ref, cfg["dias_transit"])
    print(f"\n  Descarregadas HOJE ({data_ref.strftime('%d/%m/%Y')}):")
    print(f"    Minutas: {resultado['total_minutas_hoje']}")
    print(f"    Motos:   {resultado['total_motos_hoje']}")
    print(f"\n  Em trânsito:  {len(resultado['em_transito'])}")
    print(f"  Atrasadas:    {len(resultado['atrasadas'])}")

    for eta_str, lista in resultado["por_eta"].items():
        eta_dt = datetime.strptime(eta_str, "%d/%m/%Y").date()
        dias = (eta_dt - data_ref).days
        label = "HOJE" if dias == 0 else (f"+{dias}d" if dias > 0 else f"{dias}d ATRASO")
        motos = sum(m["qtd_motos"] for m in lista)
        print(f"    {eta_str} ({label}): {len(lista)} minutas · {motos} motos")

    # ── FrotaTMS ─────────────────────────────────────────────────────────────
    separador("FROTATMS — MOTOS EXPEDIDAS")
    motos_expedidas = 0
    viagens_frota   = []

    if not REQUESTS_OK:
        print("  requests não instalado — integracao FrotaTMS desabilitada.")
        print("  Execute: pip install requests")
    else:
        print(f"  Conectando a {cfg['frotatms_url']} ...")
        token = frotatms_login(cfg["frotatms_url"], cfg["frotatms_email"], cfg["frotatms_senha"])
        if token:
            print("  Login OK.")
            motos_expedidas, viagens_frota = frotatms_motos_expedidas(
                cfg["frotatms_url"], token, data_ref
            )
            print(f"  Viagens registradas hoje: {len(viagens_frota)}")
            print(f"  Motos expedidas (soma capacidade): {motos_expedidas}")
        else:
            print("  Falha no login — verifique config.ini.")
            print("  Motos expedidas: 0 (preencha manualmente no Volu)")

    # ── Atualizar Volu ───────────────────────────────────────────────────────
    separador("ATUALIZANDO VOLU RECEBIMENTO")
    if arq_volu:
        saida_volu = str(PASTA_SCRIPT / f"Volu_Recebimento_ATUALIZADO_{data_ref.strftime('%d%m%Y')}.xlsx")
        ok = atualizar_volu(arq_volu, data_ref, resultado, motos_expedidas, saida_volu)
        if ok:
            print(f"  SALVO: {os.path.basename(saida_volu)}")
        else:
            print("  Não foi possível atualizar o Volu automaticamente.")
            print("  Preencha manualmente com os dados abaixo:")
            print(f"    Consolidado (minutas): {resultado['total_minutas_hoje']}")
            print(f"    Motos Recebidas:       {resultado['total_motos_hoje']}")
            print(f"    Motos Expedidas:       {motos_expedidas}")
    else:
        print("  Volu não encontrado — relatório gerado sem atualização do arquivo.")

    # ── Relatório de trânsito ─────────────────────────────────────────────────
    separador("GERANDO RELATÓRIO DE TRÂNSITO")
    saida_relatorio = str(PASTA_SCRIPT / f"RELATORIO_TRANSITO_{data_ref.strftime('%d%m%Y')}.xlsx")
    gerar_relatorio_transito(resultado, data_ref, viagens_frota, saida_relatorio)
    print(f"  SALVO: {os.path.basename(saida_relatorio)}")

    # ── Resumo final ──────────────────────────────────────────────────────────
    separador("RESUMO")
    print(f"  Data:             {data_ref.strftime('%d/%m/%Y')}")
    print(f"  Minutas hoje:     {resultado['total_minutas_hoje']}")
    print(f"  Motos recebidas:  {resultado['total_motos_hoje']}")
    print(f"  Motos expedidas:  {motos_expedidas}  {'(FrotaTMS)' if viagens_frota else '(manual)'}")
    if resultado["atrasadas"]:
        motos_atr = sum(m["qtd_motos"] for m in resultado["atrasadas"])
        print(f"\n  *** ATENCAO: {len(resultado['atrasadas'])} minutas atrasadas ({motos_atr} motos) ***")

    print("\n  Arquivos gerados:")
    if arq_volu:
        print(f"    - {os.path.basename(saida_volu)}")
    print(f"    - {os.path.basename(saida_relatorio)}")
    print("\n" + "=" * 60)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrompido pelo usuário.")
    except Exception as e:
        print(f"\nERRO INESPERADO: {e}")
        traceback.print_exc()
    finally:
        input("\nPressione Enter para fechar...")
