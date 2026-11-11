import { NextRequest, NextResponse } from "next/server";
import {
  getRequestSession,
  parseClientProof,
  requirePermission,
} from "@/lib/auth";
import { getLoyalty, getShopBundle, listLoyalty } from "@/lib/data";
import { onlyDigits } from "@/lib/utils";

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug") ?? "navalha-negra";
    const phone = req.nextUrl.searchParams.get("phone");
    // Token só no header — nunca na query (evita vazamento em logs/Referer).
    const proof = req.headers.get("x-cortely-client");
    const bundle = await getShopBundle(slug);

    if (!bundle) {
      return NextResponse.json(
        { error: "Barbearia não encontrada" },
        { status: 404 },
      );
    }

    // Cliente autenticado por OTP: só a própria conta
    if (phone && proof) {
      const digits = onlyDigits(phone);
      if (!parseClientProof(proof, digits, bundle.shop.id)) {
        return NextResponse.json(
          { error: "Verifique o WhatsApp com OTP" },
          { status: 401 },
        );
      }
      const account = await getLoyalty(bundle.shop.id, digits);
      return NextResponse.json({
        account,
        threshold: bundle.shop.loyalty_threshold,
        reward: bundle.shop.loyalty_reward,
      });
    }

    // Staff: lista ou consulta autenticada
    const session = getRequestSession(req);
    requirePermission(session, "fidelidade");
    if (bundle.shop.id !== session!.barbershop_id) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    if (phone) {
      const account = await getLoyalty(bundle.shop.id, onlyDigits(phone));
      return NextResponse.json({
        account,
        threshold: bundle.shop.loyalty_threshold,
        reward: bundle.shop.loyalty_reward,
      });
    }

    const accounts = await listLoyalty(bundle.shop.id);
    return NextResponse.json({
      accounts,
      threshold: bundle.shop.loyalty_threshold,
      reward: bundle.shop.loyalty_reward,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro";
    const status =
      message.includes("login") || message.includes("permissão") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
