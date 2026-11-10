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

/** OTP por WhatsApp. O código nunca é devolvido na resposta HTTP. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = z.string().parse(body.action);

    if (action === "send") {
      const { phone } = z.object({ phone: z.string().min(10) }).parse(body);
      const digits = onlyDigits(phone);
      const code = String(Math.floor(100000 + Math.random() * 900000));
      store().set(digits, { code, expires: Date.now() + 10 * 60 * 1000 });
      const delivery = await sendWhatsAppMessage({
        toPhone: digits,
        message: `Seu código Cortely é ${code}. Válido por 10 minutos.`,
      });
      if (!process.env.WHATSAPP_API_TOKEN) {
        return NextResponse.json(
          {
            error:
              "WhatsApp API não configurada. Não é possível enviar OTP sem WHATSAPP_API_TOKEN.",
            whatsappUrl: delivery.url || undefined,
          },
          { status: 503 },
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
