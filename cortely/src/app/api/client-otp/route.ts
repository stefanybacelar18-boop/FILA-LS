import { randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { encodeClientProof } from "@/lib/auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { onlyDigits } from "@/lib/utils";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

type OtpRow = {
  code: string;
  expires: number;
  attempts: number;
};

const globalOtp = globalThis as typeof globalThis & {
  __cortelyOtpV2?: Map<string, OtpRow>;
};

function store() {
  if (!globalOtp.__cortelyOtpV2) globalOtp.__cortelyOtpV2 = new Map();
  return globalOtp.__cortelyOtpV2;
}

function rateFail(result: { retryAfterSec: number; error: string }) {
  return NextResponse.json(
    { error: result.error, retryAfterSec: result.retryAfterSec },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSec) },
    },
  );
}

/**
 * OTP por WhatsApp Business API.
 * Sem token: recusa. Código nunca volta na resposta.
 * Limite de envio e de tentativas de verificação.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = z.string().parse(body.action);
    const ip = clientIp(req);

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

      const ipLimit = checkRateLimit(`otp-send-ip:${ip}`, {
        limit: 8,
        windowMs: 60 * 60 * 1000,
        lockMs: 60 * 60 * 1000,
      });
      if (!ipLimit.ok) return rateFail(ipLimit);

      const phoneLimit = checkRateLimit(`otp-send-phone:${digits}`, {
        limit: 3,
        windowMs: 60 * 60 * 1000,
        lockMs: 60 * 60 * 1000,
      });
      if (!phoneLimit.ok) return rateFail(phoneLimit);

      const code = String(randomInt(100000, 1000000));
      store().set(digits, {
        code,
        expires: Date.now() + 10 * 60 * 1000,
        attempts: 0,
      });

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
        .object({ phone: z.string().min(10), code: z.string().min(4).max(8) })
        .parse(body);
      const digits = onlyDigits(data.phone);

      const ipLimit = checkRateLimit(`otp-verify-ip:${ip}`, {
        limit: 30,
        windowMs: 60 * 60 * 1000,
        lockMs: 30 * 60 * 1000,
      });
      if (!ipLimit.ok) return rateFail(ipLimit);

      const row = store().get(digits);
      if (!row || row.expires < Date.now()) {
        store().delete(digits);
        return NextResponse.json(
          { error: "Código inválido ou expirado" },
          { status: 401 },
        );
      }

      if (row.attempts >= 5) {
        store().delete(digits);
        return NextResponse.json(
          {
            error: "Muitas tentativas. Solicite um novo código.",
            retryAfterSec: 900,
          },
          { status: 429 },
        );
      }

      if (row.code !== data.code) {
        row.attempts += 1;
        store().set(digits, row);
        if (row.attempts >= 5) {
          store().delete(digits);
          return NextResponse.json(
            {
              error: "Muitas tentativas. Solicite um novo código.",
              retryAfterSec: 900,
            },
            { status: 429 },
          );
        }
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
