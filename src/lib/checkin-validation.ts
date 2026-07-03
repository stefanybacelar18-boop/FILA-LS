import { CARGO_TYPES, DEFAULT_CHECKIN_EMPRESA, DEFAULT_CHECKIN_TIPO_CARGA } from "./constants";

import type { CheckInFormData, TipoVeiculo } from "./types";



const PLACA_REGEX = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/i;

export const PLACA_MERCOSUL_HINT = "Formato Mercosul: ABC1D23 (3 letras, 1 número, 1 letra/número, 2 números)";

function normalizePlaca(value: string): string {
  return value.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

export function isValidPlaca(value: string): boolean {
  return PLACA_REGEX.test(normalizePlaca(value));
}



export function validateCheckInBody(

  body: unknown

): { ok: true; data: CheckInFormData } | { ok: false; error: string } {

  if (!body || typeof body !== "object") {

    return { ok: false, error: "Corpo da requisição inválido" };

  }



  const b = body as Record<string, unknown>;



  const minuta = typeof b.minuta === "string" ? b.minuta.trim() : "";

  const nome = typeof b.nome === "string" ? b.nome.trim() : "";

  const telefone = typeof b.telefone === "string" ? b.telefone : "";

  const transportadora = typeof b.transportadora === "string" ? b.transportadora.trim() : "";

  const empresa = typeof b.empresa === "string" ? b.empresa.trim() : "";

  const tipo_carga = typeof b.tipo_carga === "string" ? b.tipo_carga.trim() : "";

  const tipo_veiculo = b.tipo_veiculo as TipoVeiculo;

  const placa_cavalo = typeof b.placa_cavalo === "string" ? b.placa_cavalo : "";

  const placa_carreta = typeof b.placa_carreta === "string" ? b.placa_carreta : "";

  const placa_segunda_carreta =

    typeof b.placa_segunda_carreta === "string" ? b.placa_segunda_carreta : undefined;

  const retorno_racks_vazios = b.retorno_racks_vazios === true;

  const observacoes = typeof b.observacoes === "string" ? b.observacoes.trim() : undefined;

  const checkin_lat = typeof b.checkin_lat === "number" ? b.checkin_lat : null;

  const checkin_lng = typeof b.checkin_lng === "number" ? b.checkin_lng : null;

  const device_id = typeof b.device_id === "string" ? b.device_id : "";

  const user_agent = typeof b.user_agent === "string" ? b.user_agent : "";



  if (!minuta || minuta.length < 3) {

    return { ok: false, error: "Minuta inválida" };

  }

  if (!nome || nome.length < 3) {

    return { ok: false, error: "Nome inválido" };

  }

  if (telefone.replace(/\D/g, "").length < 10) {

    return { ok: false, error: "Telefone inválido" };

  }

  if (!transportadora) {

    return { ok: false, error: "Transportadora obrigatória" };

  }

  const empresaFinal = empresa || DEFAULT_CHECKIN_EMPRESA;

  const tipoCargaFinal =

    tipo_carga && CARGO_TYPES.includes(tipo_carga) ? tipo_carga : DEFAULT_CHECKIN_TIPO_CARGA;

  if (tipo_veiculo !== "convencional" && tipo_veiculo !== "bitrem") {

    return { ok: false, error: "Tipo de veículo inválido" };

  }

  if (!isValidPlaca(placa_cavalo)) {

    return { ok: false, error: "Placa do cavalo inválida" };

  }

  if (!isValidPlaca(placa_carreta)) {

    return { ok: false, error: "Placa da carreta inválida" };

  }

  if (tipo_veiculo === "bitrem") {

    if (!placa_segunda_carreta || !isValidPlaca(placa_segunda_carreta)) {

      return { ok: false, error: "Placa da segunda carreta obrigatória para bitrem" };

    }

  }

  if (!device_id) {

    return { ok: false, error: "Identificador do dispositivo obrigatório" };

  }



  return {

    ok: true,

    data: {

      minuta,

      nome,

      telefone,

      transportadora,

      empresa: empresaFinal,

      tipo_carga: tipoCargaFinal,

      tipo_veiculo,

      placa_cavalo: normalizePlaca(placa_cavalo),

      placa_carreta: normalizePlaca(placa_carreta),

      placa_segunda_carreta: placa_segunda_carreta

        ? normalizePlaca(placa_segunda_carreta)

        : undefined,

      retorno_racks_vazios,

      observacoes,

      checkin_lat: checkin_lat ?? 0,

      checkin_lng: checkin_lng ?? 0,

      device_id,

      user_agent,

    },

  };

}

