import { checkRateLimit } from "@/lib/rate-limit";
import { formatBRL, onlyDigits } from "@/lib/utils";
import type { WhatsAppDeliveryMode } from "@/lib/types";

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
};

function getApiConfig() {
  const token = process.env.WHATSAPP_API_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const baseUrl =
    process.env.WHATSAPP_API_BASE_URL ||
    "https://graph.facebook.com/v19.0";
  if (!token || !phoneId) return null;
  return { token, phoneId, baseUrl };
}

export function getWhatsAppDeliveryMode(): WhatsAppDeliveryMode {
  return getApiConfig() ? "api" : "manual";
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

/** Envia mensagem via API (Meta/Evolution) quando configurada; senão devolve URL manual. */
export async function sendWhatsAppMessage(input: {
  toPhone: string;
  message: string;
  fallbackShopPhone?: string;
}): Promise<WhatsAppSendResult> {
  const to = onlyDigits(input.toPhone);
  const api = getApiConfig();

  if (!api) {
    const phone = onlyDigits(input.fallbackShopPhone || to);
    return {
      ok: true,
      mode: "manual",
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
      error: limited.error,
    };
  }

  const globalWa = checkRateLimit("wa-api:global", {
    limit: 60,
    windowMs: 60 * 60 * 1000,
    lockMs: 15 * 60 * 1000,
  });
  if (!globalWa.ok) {
    return {
      ok: false,
      mode: "api",
      error: globalWa.error,
    };
  }

  try {
    const res = await fetch(`${api.baseUrl}/${api.phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: `55${to}`,
        type: "text",
        text: { body: input.message },
      }),
    });

    const json = (await res.json()) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string };
    };

    if (!res.ok) {
      return {
        ok: false,
        mode: "api",
        error: json.error?.message || "Falha no provedor WhatsApp",
        url: buildWhatsAppReminderUrl(to, input.message),
      };
    }

    return {
      ok: true,
      mode: "api",
      providerMessageId: json.messages?.[0]?.id,
    };
  } catch (error) {
    return {
      ok: false,
      mode: "api",
      error: error instanceof Error ? error.message : "Erro de rede WhatsApp",
      url: buildWhatsAppReminderUrl(to, input.message),
    };
  }
}
