import { randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { encodeClientProof } from "@/lib/auth";
import { getShopBundle } from "@/lib/data";
import { checkRateLimit, clientIp, sensitiveIpKey } from "@/lib/rate-limit";
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
 * Exige slug de loja válida + limites apertados (IP/telefone/global).
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

      const { phone, slug } = z
        .object({
          phone: z.string().min(10).max(20),
          slug: z.string().min(1).max(80),
        })
        .parse(body);
      const digits = onlyDigits(phone);
      if (digits.length < 10 || digits.length > 13) {
        return NextResponse.json({ error: "Telefone inválido" }, { status: 400 });
      }

      const shop = await getShopBundle(slug);
      if (!shop) {
        return NextResponse.json({ error: "Barbearia não encontrada" }, { status: 404 });
      }

      if (ip === "unknown") {
        const untrusted = checkRateLimit("otp-send-untrusted", {
          limit: 2,
          windowMs: 60 * 60 * 1000,
          lockMs: 60 * 60 * 1000,
        });
        if (!untrusted.ok) return rateFail(untrusted);
      }

      const ipLimit = checkRateLimit(sensitiveIpKey("otp-send-ip", ip), {
        limit: 3,
        windowMs: 60 * 60 * 1000,
        lockMs: 60 * 60 * 1000,
      });
      if (!ipLimit.ok) return rateFail(ipLimit);

      const phoneLimit = checkRateLimit(`otp-send-phone:${digits}`, {
        limit: 2,
        windowMs: 60 * 60 * 1000,
        lockMs: 60 * 60 * 1000,
      });
      if (!phoneLimit.ok) return rateFail(phoneLimit);

      const globalLimit = checkRateLimit("otp-send-global", {
        limit: 60,
        windowMs: 60 * 60 * 1000,
        lockMs: 15 * 60 * 1000,
      });
      if (!globalLimit.ok) return rateFail(globalLimit);

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
        .object({
          phone: z.string().min(10).max(20),
          code: z.string().min(4).max(8),
          slug: z.string().min(1).max(80).optional(),
        })
        .parse(body);
      const digits = onlyDigits(data.phone);
      if (digits.length < 10 || digits.length > 13) {
        return NextResponse.json({ error: "Telefone inválido" }, { status: 400 });
      }

      if (data.slug) {
        const shop = await getShopBundle(data.slug);
        if (!shop) {
          return NextResponse.json({ error: "Barbearia não encontrada" }, { status: 404 });
        }
      }

      const ipLimit = checkRateLimit(sensitiveIpKey("otp-verify-ip", ip), {
        limit: 20,
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
