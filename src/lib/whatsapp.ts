import { WHATSAPP_CALL_TEMPLATE, WHATSAPP_EMPILHADOR_CALL_TEMPLATE } from "./constants";

export function normalizePhoneForWhatsApp(phone?: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 11 || digits.length === 10) return `55${digits}`;
  return digits;
}

export function getWhatsAppLink(phone?: string | null, message?: string): string | null {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return null;
  const base = `https://wa.me/${normalized}`;
  if (message) return `${base}?text=${encodeURIComponent(message)}`;
  return base;
}

export function getCallDriverWhatsAppLink(
  phone: string | null | undefined,
  minuta: string,
  doca?: string | null,
  template = WHATSAPP_CALL_TEMPLATE
): string | null {
  const message = template
    .replace("{MINUTA}", minuta || "—")
    .replace("{DOCA}", doca || "indicada");
  return getWhatsAppLink(phone, message);
}

/** Chamada pelo empilhador — mensagem sem doca */
export function getEmpilhadorCallWhatsAppLink(
  phone: string | null | undefined,
  minuta: string,
  template = WHATSAPP_EMPILHADOR_CALL_TEMPLATE
): string | null {
  const message = template.replace("{MINUTA}", minuta || "—");
  return getWhatsAppLink(phone, message);
}
