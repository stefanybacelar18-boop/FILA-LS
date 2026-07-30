import { addManausDays, getManausDateYmd, manausDayStartISO } from "./queue-day";

/** Previsão informativa: 5 dias corridos após o check-in remoto (fuso operacional). */
export const VIAGEM_PREVISAO_DIAS = 5;

export function forecastDescarregamentoFromCheckIn(date: Date = new Date()): string {
  const baseYmd = getManausDateYmd(date);
  const targetYmd = addManausDays(baseYmd, VIAGEM_PREVISAO_DIAS);
  return manausDayStartISO(targetYmd);
}
