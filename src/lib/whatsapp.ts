import { WHATSAPP_CALL_TEMPLATE } from "./constants";

export function normalizePhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55")) return digits;
  if (digits.length === 11 || digits.length === 10) return `55${digits}`;
  return digits;
}

export function getWhatsAppLink(phone: string, message?: string): string {
  const normalized = normalizePhoneForWhatsApp(phone);
  const base = `https://wa.me/${normalized}`;
  if (message) return `${base}?text=${encodeURIComponent(message)}`;
  return base;
}

export function getCallDriverWhatsAppLink(
  phone: string,
  minuta: string,
  doca?: string | null,
  template = WHATSAPP_CALL_TEMPLATE
): string {
  const message = template
    .replace("{MINUTA}", minuta || "—")
    .replace("{DOCA}", doca || "indicada");
  return getWhatsAppLink(phone, message);
}
