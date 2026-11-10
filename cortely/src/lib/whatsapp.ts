import { formatBRL, onlyDigits } from "@/lib/utils";

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
