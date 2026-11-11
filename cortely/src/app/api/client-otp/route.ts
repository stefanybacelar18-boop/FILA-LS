import { createHash, randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { encodeClientProof, signingSecret } from "@/lib/auth";
import { getShopBundle } from "@/lib/data";
import { checkRateLimit, clientIp, sensitiveIpKey } from "@/lib/rate-limit";
import { createServiceClient, isDemoMode } from "@/lib/supabase/env";
import { onlyDigits } from "@/lib/utils";
import {
  isWhatsAppApiConfigured,
  sendWhatsAppMessage,
} from "@/lib/whatsapp";

type OtpRow = {
  codeHash: string;
  expires: number;
  attempts: number;
  shopId: string;
  consumed: boolean;
};

const globalOtp = globalThis as typeof globalThis & {
  __cortelyOtpV3?: Map<string, OtpRow>;
};

function store() {
  if (!globalOtp.__cortelyOtpV3) globalOtp.__cortelyOtpV3 = new Map();
  return globalOtp.__cortelyOtpV3;
}

function otpKey(shopId: string, phone: string) {
  return `${shopId}:${phone}`;
}

function hashCode(code: string, shopId: string, phone: string) {
  return createHash("sha256")
    .update(`${shopId}:${phone}:${code}:${signingSecret()}`)
    .digest("hex");
}

async function persistOtpChallenge(row: {
  shopId: string;
  phone: string;
  codeHash: string;
  expires: number;
}) {
  if (isDemoMode()) return;
  try {
    const supabase = createServiceClient();
    // Invalida desafios abertos anteriores do mesmo telefone/loja
    await supabase
      .from("client_otp_challenges")
      .update({ consumed_at: new Date().toISOString() })
      .eq("barbershop_id", row.shopId)
      .eq("phone", row.phone)
      .is("consumed_at", null);
    await supabase.from("client_otp_challenges").insert({
      barbershop_id: row.shopId,
      phone: row.phone,
      code_hash: row.codeHash,
      attempts: 0,
      expires_at: new Date(row.expires).toISOString(),
    });
  } catch {
    /* memória do processo permanece como fallback na mesma instância */
  }
}

async function loadDurableOtp(
  shopId: string,
  phone: string,
): Promise<OtpRow | null> {
  if (isDemoMode()) return null;
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("client_otp_challenges")
      .select("code_hash, attempts, expires_at, consumed_at")
      .eq("barbershop_id", shopId)
      .eq("phone", phone)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return {
      codeHash: data.code_hash,
      expires: new Date(data.expires_at).getTime(),
      attempts: data.attempts,
      shopId,
      consumed: Boolean(data.consumed_at),
    };
  } catch {
    return null;
  }
}

async function bumpDurableOtpAttempts(shopId: string, phone: string, attempts: number) {
  if (isDemoMode()) return;
  try {
    const supabase = createServiceClient();
    await supabase
      .from("client_otp_challenges")
      .update({ attempts })
      .eq("barbershop_id", shopId)
      .eq("phone", phone)
      .is("consumed_at", null);
  } catch {
    /* ignore */
  }
}

async function consumeDurableOtp(shopId: string, phone: string) {
  if (isDemoMode()) return;
  try {
    const supabase = createServiceClient();
    await supabase
      .from("client_otp_challenges")
      .update({ consumed_at: new Date().toISOString() })
      .eq("barbershop_id", shopId)
      .eq("phone", phone)
      .is("consumed_at", null);
  } catch {
    /* ignore */
  }
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

/** Resposta uniforme — evita enumeração de telefones/lojas. */
function genericSendOk() {
  return NextResponse.json({
    ok: true,
    message: "Se o número for válido, o código será enviado em breve.",
  });
}

/**
 * OTP por WhatsApp (Meta ou Evolution via adaptadores).
 * Sem provedor configurado: recusa autenticação privada (sem demo_access).
 * Código nunca volta na resposta. Hash at-rest, uso único, tentativas limitadas.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = z.string().parse(body.action);
    const ip = clientIp(req);

    // demo_access removido — não existe atalho público.
    if (action === "demo_access") {
      return NextResponse.json(
        { error: "Atalho de acesso demo foi removido. Use OTP WhatsApp." },
        { status: 410 },
      );
    }

    if (action === "send") {
      if (!isWhatsAppApiConfigured()) {
        return NextResponse.json(
          {
            error:
              "OTP do cliente exige provedor WhatsApp (Meta ou Evolution) configurado.",
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
        // Mesma mensagem genérica
        return genericSendOk();
      }

      const shop = await getShopBundle(slug);
      if (!shop) {
        // Não revela se a loja existe
        return genericSendOk();
      }

      if (ip === "unknown") {
        return NextResponse.json(
          { error: "Não foi possível validar a origem do pedido" },
          { status: 403 },
        );
      }

      const ipLimit = checkRateLimit(sensitiveIpKey("otp-send-ip", ip), {
        limit: 3,
        windowMs: 60 * 60 * 1000,
        lockMs: 60 * 60 * 1000,
      });
      if (!ipLimit.ok) return rateFail(ipLimit);

      const phoneLimit = checkRateLimit(
        `otp-send-phone:${shop.shop.id}:${digits}`,
        {
          limit: 3,
          windowMs: 60 * 60 * 1000,
          lockMs: 60 * 60 * 1000,
        },
      );
      if (!phoneLimit.ok) return rateFail(phoneLimit);

      const shopLimit = checkRateLimit(`otp-send-shop:${shop.shop.id}`, {
        limit: 40,
        windowMs: 60 * 60 * 1000,
        lockMs: 60 * 60 * 1000,
      });
      if (!shopLimit.ok) return rateFail(shopLimit);

      const code = String(randomInt(100000, 1000000));
      const expires = Date.now() + 10 * 60 * 1000;
      const codeHash = hashCode(code, shop.shop.id, digits);
      store().set(otpKey(shop.shop.id, digits), {
        codeHash,
        expires,
        attempts: 0,
        shopId: shop.shop.id,
        consumed: false,
      });
      await persistOtpChallenge({
        shopId: shop.shop.id,
        phone: digits,
        codeHash,
        expires,
      });

      const delivery = await sendWhatsAppMessage({
        toPhone: digits,
        message: `Seu código Cortely é ${code}. Válido por 10 minutos. Não compartilhe.`,
      });

      if (!delivery.ok || delivery.mode !== "api" || !delivery.providerMessageId) {
        store().delete(otpKey(shop.shop.id, digits));
        await consumeDurableOtp(shop.shop.id, digits);
        // Não vaza detalhe do provedor ao cliente
        return NextResponse.json(
          { error: "Não foi possível enviar o código agora. Tente mais tarde." },
          { status: 502 },
        );
      }

      return genericSendOk();
    }

    if (action === "verify") {
      const data = z
        .object({
          phone: z.string().min(10).max(20),
          code: z.string().min(4).max(8),
          slug: z.string().min(1).max(80),
        })
        .parse(body);
      const digits = onlyDigits(data.phone);
      if (digits.length < 10 || digits.length > 13) {
        return NextResponse.json(
          { error: "Código inválido ou expirado" },
          { status: 401 },
        );
      }

      const shop = await getShopBundle(data.slug);
      if (!shop) {
        return NextResponse.json(
          { error: "Código inválido ou expirado" },
          { status: 401 },
        );
      }

      const ipLimit = checkRateLimit(sensitiveIpKey("otp-verify-ip", ip), {
        limit: 20,
        windowMs: 60 * 60 * 1000,
        lockMs: 30 * 60 * 1000,
      });
      if (!ipLimit.ok) return rateFail(ipLimit);

      const key = otpKey(shop.shop.id, digits);
      let row = store().get(key) ?? null;
      if (!row) {
        row = await loadDurableOtp(shop.shop.id, digits);
        if (row) store().set(key, row);
      }
      if (!row || row.consumed || row.expires < Date.now()) {
        store().delete(key);
        await consumeDurableOtp(shop.shop.id, digits);
        return NextResponse.json(
          { error: "Código inválido ou expirado" },
          { status: 401 },
        );
      }

      if (row.attempts >= 5) {
        store().delete(key);
        await consumeDurableOtp(shop.shop.id, digits);
        return NextResponse.json(
          {
            error: "Muitas tentativas. Solicite um novo código.",
            retryAfterSec: 900,
          },
          { status: 429 },
        );
      }

      const expected = hashCode(data.code, shop.shop.id, digits);
      if (expected !== row.codeHash) {
        row.attempts += 1;
        store().set(key, row);
        await bumpDurableOtpAttempts(shop.shop.id, digits, row.attempts);
        if (row.attempts >= 5) {
          store().delete(key);
          await consumeDurableOtp(shop.shop.id, digits);
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

      // Uso único
      row.consumed = true;
      store().delete(key);
      await consumeDurableOtp(shop.shop.id, digits);

      return NextResponse.json({
        ok: true,
        token: encodeClientProof(digits, shop.shop.id),
        expires_in_sec: 30 * 60,
      });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro OTP";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
