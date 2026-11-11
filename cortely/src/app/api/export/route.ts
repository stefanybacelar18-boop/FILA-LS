import { NextRequest, NextResponse } from "next/server";
import { getRequestSession, requirePermission } from "@/lib/auth";
import { opsStore } from "@/lib/ops-store";

export async function GET(req: NextRequest) {
  try {
    const session = getRequestSession(req);
    requirePermission(session, "relatorios");
    const kind = req.nextUrl.searchParams.get("kind") ?? "sales";
    const snap = opsStore.snapshot();

    let rows: string[][] = [];
    if (kind === "sales") {
      rows = [
        ["id", "data", "cliente", "total", "desconto", "status"],
        ...snap.sales.map((s) => [
          s.id,
          s.created_at,
          s.client_name ?? "",
          String(s.total),
          String(s.discount),
          s.status,
        ]),
      ];
    } else if (kind === "products") {
      rows = [
        ["id", "nome", "estoque", "min", "preco", "custo"],
        ...snap.products.map((p) => [
          p.id,
          p.name,
          String(p.stock_qty),
          String(p.min_stock),
          String(p.price),
          String(p.cost),
        ]),
      ];
    } else if (kind === "commissions") {
      rows = [
        ["id", "barbeiro", "valor", "status", "data"],
        ...snap.commissionEntries.map((c) => [
          c.id,
          c.barber_id,
          String(c.amount),
          c.status,
          c.created_at,
        ]),
      ];
    } else {
      return NextResponse.json({ error: "kind inválido" }, { status: 400 });
    }

    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cortely-${kind}.csv"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro export";
    const status = message.includes("login") || message.includes("permissão") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
