/**
 * Adaptadores independentes Meta Cloud API × Evolution API.
 * Não misturar variáveis: Meta usa META_*; Evolution usa EVOLUTION_*.
 * Legado WHATSAPP_API_TOKEN / WHATSAPP_PHONE_NUMBER_ID = apenas Meta.
 */

export type WhatsAppProviderKind = "meta" | "evolution" | "none";

export type ProviderSendResult = {
  ok: boolean;
  provider: WhatsAppProviderKind;
  providerMessageId?: string;
  error?: string;
};

function legacyMetaToken() {
  return process.env.WHATSAPP_API_TOKEN?.trim() || "";
}

function legacyMetaPhoneId() {
  return process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "";
}

export function resolveWhatsAppProvider(): WhatsAppProviderKind {
  const preferred = (process.env.WHATSAPP_PROVIDER || "").trim().toLowerCase();
  const metaToken =
    process.env.META_WHATSAPP_TOKEN?.trim() || legacyMetaToken();
  const metaPhone =
    process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim() || legacyMetaPhoneId();
  const evolutionUrl = process.env.EVOLUTION_API_URL?.trim();
  const evolutionKey = process.env.EVOLUTION_API_KEY?.trim();
  const evolutionInstance = process.env.EVOLUTION_INSTANCE?.trim();

  if (preferred === "evolution") {
    if (evolutionUrl && evolutionKey && evolutionInstance) return "evolution";
    return "none";
  }
  if (preferred === "meta") {
    if (metaToken && metaPhone) return "meta";
    return "none";
  }
  // Auto: Evolution se completo; senão Meta; senão none.
  if (evolutionUrl && evolutionKey && evolutionInstance) return "evolution";
  if (metaToken && metaPhone) return "meta";
  return "none";
}

export function getMetaConfig() {
  const token =
    process.env.META_WHATSAPP_TOKEN?.trim() || legacyMetaToken();
  const phoneId =
    process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim() || legacyMetaPhoneId();
  const baseUrl =
    process.env.META_WHATSAPP_API_BASE_URL?.trim() ||
    process.env.WHATSAPP_API_BASE_URL?.trim() ||
    "https://graph.facebook.com/v19.0";
  if (!token || !phoneId) return null;
  return { token, phoneId, baseUrl };
}

export function getEvolutionConfig() {
  const baseUrl = process.env.EVOLUTION_API_URL?.trim();
  const apiKey = process.env.EVOLUTION_API_KEY?.trim();
  const instance = process.env.EVOLUTION_INSTANCE?.trim();
  if (!baseUrl || !apiKey || !instance) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, instance };
}

/** True quando algum provedor de API está pronto para OTP. */
export function isWhatsAppApiConfigured() {
  return resolveWhatsAppProvider() !== "none";
}

export async function sendViaMeta(input: {
  toDigits: string;
  message: string;
}): Promise<ProviderSendResult> {
  const api = getMetaConfig();
  if (!api) {
    return { ok: false, provider: "meta", error: "Meta WhatsApp não configurada" };
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
        to: `55${input.toDigits}`,
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
        provider: "meta",
        error: json.error?.message || "Falha Meta WhatsApp",
      };
    }
    return {
      ok: true,
      provider: "meta",
      providerMessageId: json.messages?.[0]?.id,
    };
  } catch (error) {
    return {
      ok: false,
      provider: "meta",
      error: error instanceof Error ? error.message : "Erro de rede Meta",
    };
  }
}

/**
 * Stub de envio Evolution — configuração separada; implementação completa
 * fica para fase Cortely Connect / Evolution (não nesta fase 0).
 */
export async function sendViaEvolution(input: {
  toDigits: string;
  message: string;
}): Promise<ProviderSendResult> {
  const api = getEvolutionConfig();
  if (!api) {
    return {
      ok: false,
      provider: "evolution",
      error: "Evolution API não configurada",
    };
  }
  try {
    const res = await fetch(
      `${api.baseUrl}/message/sendText/${encodeURIComponent(api.instance)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: api.apiKey,
        },
        body: JSON.stringify({
          number: `55${input.toDigits}`,
          text: input.message,
        }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      key?: { id?: string };
      message?: { key?: { id?: string } };
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        provider: "evolution",
        error: json.error || `Evolution HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      provider: "evolution",
      providerMessageId:
        json.key?.id || json.message?.key?.id || `evolution-${Date.now()}`,
    };
  } catch (error) {
    return {
      ok: false,
      provider: "evolution",
      error: error instanceof Error ? error.message : "Erro de rede Evolution",
    };
  }
}

export async function sendViaConfiguredProvider(input: {
  toDigits: string;
  message: string;
}): Promise<ProviderSendResult> {
  const kind = resolveWhatsAppProvider();
  if (kind === "evolution") return sendViaEvolution(input);
  if (kind === "meta") return sendViaMeta(input);
  return { ok: false, provider: "none", error: "Nenhum provedor WhatsApp configurado" };
}
