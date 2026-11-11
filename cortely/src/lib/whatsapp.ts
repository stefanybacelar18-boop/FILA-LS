import { checkRateLimit } from "@/lib/rate-limit";
import { formatBRL, onlyDigits } from "@/lib/utils";
import type { WhatsAppDeliveryMode } from "@/lib/types";
import {
  isWhatsAppApiConfigured,
  resolveWhatsAppProvider,
  sendViaConfiguredProvider,
} from "@/lib/whatsapp/providers";

type WhatsAppPayload = {
  shopName: string;
  shopPhone: string;
  clientName: string;
  barberName: string;
  serviceName: string;
  dateLabel: string;
  time: string;
  price: number;
};

export type WhatsAppSendResult = {
  ok: boolean;
  mode: WhatsAppDeliveryMode;
  url?: string;
  providerMessageId?: string;
  error?: string;
  provider?: string;
};

export function getWhatsAppDeliveryMode(): WhatsAppDeliveryMode {
  return isWhatsAppApiConfigured() ? "api" : "manual";
}

export function buildWhatsAppConfirmUrl(payload: WhatsAppPayload) {
  const phone = onlyDigits(payload.shopPhone);
  const text = [
    `Olá! Acabei de agendar pelo *Cortely*.`,
    ``,
    `Barbearia: ${payload.shopName}`,
    `Cliente: ${payload.clientName}`,
    `Barbeiro: ${payload.barberName}`,
    `Serviço: ${payload.serviceName}`,
    `Data: ${payload.dateLabel}`,
    `Horário: ${payload.time}`,
    `Valor: ${formatBRL(payload.price)}`,
    ``,
    `Pode confirmar, por favor?`,
  ].join("\n");

  return `https://wa.me/55${phone}?text=${encodeURIComponent(text)}`;
}

export function buildWhatsAppReminderUrl(clientPhone: string, message: string) {
  const phone = onlyDigits(clientPhone);
  return `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
}

export function buildClientConfirmationMessage(payload: WhatsAppPayload) {
  return [
    `Olá ${payload.clientName}! Seu horário na *${payload.shopName}* está confirmado.`,
    `Serviço: ${payload.serviceName}`,
    `Barbeiro: ${payload.barberName}`,
    `Quando: ${payload.dateLabel} às ${payload.time}`,
    `Valor: ${formatBRL(payload.price)}`,
    ``,
    `Para remarcar ou cancelar, use Meus horários no link da barbearia.`,
  ].join("\n");
}

/** Envia via adaptador Meta ou Evolution; sem provedor devolve URL manual. */
export async function sendWhatsAppMessage(input: {
  toPhone: string;
  message: string;
  fallbackShopPhone?: string;
}): Promise<WhatsAppSendResult> {
  const to = onlyDigits(input.toPhone);
  const provider = resolveWhatsAppProvider();

  if (provider === "none") {
    const phone = onlyDigits(input.fallbackShopPhone || to);
    return {
      ok: true,
      mode: "manual",
      provider: "none",
      url: `https://wa.me/55${phone}?text=${encodeURIComponent(input.message)}`,
    };
  }

  const limited = checkRateLimit(`wa-api:${to}`, {
    limit: 5,
    windowMs: 60 * 60 * 1000,
    lockMs: 60 * 60 * 1000,
  });
  if (!limited.ok) {
    return {
      ok: false,
      mode: "api",
      provider,
      error: limited.error,
    };
  }

  const globalWa = checkRateLimit("wa-api:global", {
    limit: 120,
    windowMs: 60 * 60 * 1000,
  });
  if (!globalWa.ok) {
    return {
      ok: false,
      mode: "api",
      provider,
      error: globalWa.error,
    };
  }

  const result = await sendViaConfiguredProvider({
    toDigits: to,
    message: input.message,
  });

  if (!result.ok) {
    return {
      ok: false,
      mode: "api",
      provider: result.provider,
      error: result.error,
      url: buildWhatsAppReminderUrl(to, input.message),
    };
  }

  return {
    ok: true,
    mode: "api",
    provider: result.provider,
    providerMessageId: result.providerMessageId,
  };
}

export { isWhatsAppApiConfigured, resolveWhatsAppProvider };
