import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { encodeClientProof } from "@/lib/auth";
import { onlyDigits } from "@/lib/utils";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

const globalOtp = globalThis as typeof globalThis & {
  __cortelyOtp?: Map<string, { code: string; expires: number }>;
};

function store() {
  if (!globalOtp.__cortelyOtp) globalOtp.__cortelyOtp = new Map();
  return globalOtp.__cortelyOtp;
}

/**
 * OTP por WhatsApp Business API.
 * Sem token configurado: recusa o envio e nunca devolve o código nem wa.me com o código.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = z.string().parse(body.action);

    if (action === "send") {
      if (!process.env.WHATSAPP_API_TOKEN?.trim()) {
        return NextResponse.json(
          {
            error:
              "OTP do cliente fica disponível após configurar a WhatsApp Business API.",
          },
          { status: 503 },
        );
      }

      const { phone } = z.object({ phone: z.string().min(10) }).parse(body);
      const digits = onlyDigits(phone);
      const code = String(Math.floor(100000 + Math.random() * 900000));
      store().set(digits, { code, expires: Date.now() + 10 * 60 * 1000 });

      const delivery = await sendWhatsAppMessage({
        toPhone: digits,
        message: `Seu código Cortely é ${code}. Válido por 10 minutos.`,
      });

      if (!delivery.ok || delivery.mode !== "api" || !delivery.providerMessageId) {
        store().delete(digits);
        return NextResponse.json(
          {
            error:
              delivery.error ||
              "Não foi possível enviar o OTP pela WhatsApp API.",
          },
          { status: 502 },
        );
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "verify") {
      const data = z
        .object({ phone: z.string().min(10), code: z.string().min(4) })
        .parse(body);
      const digits = onlyDigits(data.phone);
      const row = store().get(digits);
      if (!row || row.expires < Date.now() || row.code !== data.code) {
        return NextResponse.json(
          { error: "Código inválido ou expirado" },
          { status: 401 },
        );
      }
      store().delete(digits);
      return NextResponse.json({
        ok: true,
        token: encodeClientProof(digits),
      });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro OTP";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
