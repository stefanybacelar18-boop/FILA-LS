import { NextRequest, NextResponse } from "next/server";
import {
  listDueReminders,
  markReminderFailed,
  markReminderSent,
} from "@/lib/data";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

/** Processa lembretes vencidos. Exige CRON_SECRET. */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET não configurado" },
      { status: 503 },
    );
  }
  const header = req.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const due = await listDueReminders();
  const results = [];

  for (const reminder of due) {
    const delivery = await sendWhatsAppMessage({
      toPhone: reminder.client_phone,
      message: reminder.message,
    });

    if (delivery.ok && delivery.mode === "api") {
      await markReminderSent(reminder.id, reminder.barbershop_id);
      results.push({ id: reminder.id, status: "sent", mode: "api" });
    } else if (delivery.ok && delivery.mode === "manual") {
      // Não devolve wa.me com PII — só sinaliza pendência manual
      results.push({
        id: reminder.id,
        status: "pending_manual",
        mode: "manual",
      });
    } else {
      await markReminderFailed(reminder.id, reminder.barbershop_id);
      results.push({
        id: reminder.id,
        status: "failed",
        error: delivery.error || "Falha no envio",
      });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
