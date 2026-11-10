import { NextRequest, NextResponse } from "next/server";
import { getLoyalty, getShopBundle, listLoyalty } from "@/lib/data";
import { onlyDigits } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "navalha-negra";
  const phone = req.nextUrl.searchParams.get("phone");
  const bundle = await getShopBundle(slug);

  if (!bundle) {
    return NextResponse.json({ error: "Barbearia não encontrada" }, { status: 404 });
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
}
