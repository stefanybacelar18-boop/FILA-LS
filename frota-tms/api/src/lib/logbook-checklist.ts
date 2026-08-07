/** Itens do CHECK-LIST FROTA FCDE-LSLT-018c-01 */
export const LOGBOOK_FORM_CODE = 'FCDE-LSLT-018c-01';

export const FUEL_LEVELS = ['3/4', '1/2', '1/4', 'C', 'R'] as const;
export type FuelLevel = (typeof FUEL_LEVELS)[number];

export type ChecklistStatus = 'OK' | 'NG';

export type ChecklistItemState = {
  status?: ChecklistStatus;
  qty?: number;
  note?: string;
};

export type ChecklistState = Record<string, ChecklistItemState>;

export type FuelingEntry = {
  liters?: number;
  odometerKm?: number;
  valueReais?: number;
};

export const LOGBOOK_CHECKLIST_ITEMS: {
  id: string;
  label: string;
  requiresQty?: boolean;
}[] = [
  { id: 'vazamento_agua', label: 'Vazamento de água' },
  { id: 'ar_condicionado', label: 'Ar condicionado' },
  { id: 'vazamento_oleo', label: 'Vazamento de óleo' },
  { id: 'acendedor', label: 'Acendedor de cigarros' },
  { id: 'oleo_transmissao', label: 'Óleo de transmissão' },
  { id: 'retrovisores', label: 'Retrovisores' },
  { id: 'oleo_motor', label: 'Óleo de motor' },
  { id: 'limpador', label: 'Limpador para-brisa' },
  { id: 'radiador', label: 'Radiador' },
  { id: 'sider', label: 'Sider' },
  { id: 'filtro_ar', label: 'Filtros de ar' },
  { id: 'sistema_hidraulico', label: 'Sistema hidráulico' },
  { id: 'bateria', label: 'Bateria' },
  { id: 'documentacao', label: 'Documentação' },
  { id: 'freios', label: 'Freios' },
  { id: 'cabo_hidraulico', label: 'Cabo de comando hidráulico' },
  { id: 'freio_mao', label: 'Freio de mão', requiresQty: true },
  { id: 'trava_moto', label: 'Trava de moto', requiresQty: true },
  { id: 'embreagem', label: 'Embreagem' },
  { id: 'pinos', label: 'Pinos', requiresQty: true },
  { id: 'pneus', label: 'Pneus' },
  { id: 'lanterna', label: 'Lanterna' },
  { id: 'buzina', label: 'Buzina' },
  { id: 'luz_freio', label: 'Luz de freio' },
  { id: 'farois', label: 'Faróis' },
  { id: 'luz_re', label: 'Luz de ré' },
  { id: 'ruidos_motor', label: 'Ruídos no motor' },
  { id: 'setas', label: 'Setas' },
  { id: 'painel', label: 'Painel de instrumentos / temp. óleo' },
  { id: 'parachoque', label: 'Para-choque' },
  { id: 'direcao', label: 'Direção' },
  { id: 'estofamento', label: 'Estofamento' },
  { id: 'portas', label: 'Portas' },
  { id: 'cintos', label: 'Cintos de segurança' },
  { id: 'mangueiras', label: 'Mangueiras' },
  { id: 'martelo', label: 'Martelo de madeira' },
  { id: 'limpeza', label: 'Limpeza' },
  { id: 'celular', label: 'Celular' },
  { id: 'macaco', label: 'Macaco' },
  { id: 'carrinho_carga', label: 'Carrinho de carga' },
  { id: 'estepe', label: 'Estepe' },
  { id: 'etiqueta_avaria', label: 'Etiqueta avaria', requiresQty: true },
  { id: 'chave_roda', label: 'Chave de roda' },
  { id: 'coletor', label: 'Coletor' },
  { id: 'calco', label: 'Calço', requiresQty: true },
  { id: 'checagem_carga', label: 'Checagem de carga', requiresQty: true },
  { id: 'triangulo', label: 'Triângulo' },
  { id: 'napa', label: 'Napa' },
  { id: 'extintor', label: 'Extintor' },
  { id: 'som', label: 'Som' },
  { id: 'cone', label: 'Cone' },
];

export function emptyChecklistState(): ChecklistState {
  return Object.fromEntries(LOGBOOK_CHECKLIST_ITEMS.map((i) => [i.id, {}]));
}

export function parseChecklistJson(raw: string | null | undefined): ChecklistState {
  if (!raw) return emptyChecklistState();
  try {
    const parsed = JSON.parse(raw) as ChecklistState;
    return { ...emptyChecklistState(), ...parsed };
  } catch {
    return emptyChecklistState();
  }
}

export function parseFuelingJson(raw: string | null | undefined): FuelingEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function validateChecklistComplete(state: ChecklistState): string | null {
  for (const item of LOGBOOK_CHECKLIST_ITEMS) {
    const row = state[item.id];
    if (!row?.status) return `Marque todos os itens do checklist (${item.label}).`;
    if (item.requiresQty && row?.status && (row.qty == null || Number.isNaN(row.qty))) {
      return `Informe a quantidade em: ${item.label}.`;
    }
  }
  return null;
}

export function validateSignaturePng(dataUrl: string | undefined): string | null {
  if (!dataUrl?.trim()) return 'Assinatura obrigatória.';
  if (!dataUrl.startsWith('data:image/png;base64,')) return 'Formato de assinatura inválido.';
  if (dataUrl.length < 500) return 'Assine no campo de assinatura.';
  return null;
}
