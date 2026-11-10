import { NextRequest, NextResponse } from "next/server";
import {
  listDueReminders,
  markReminderFailed,
  markReminderSent,
} from "@/lib/data";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

/** Processa lembretes vencidos. Proteja com CRON_SECRET em produção. */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization");
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
  }

  const due = await listDueReminders();
  const results = [];

  for (const reminder of due) {
    const delivery = await sendWhatsAppMessage({
      toPhone: reminder.client_phone,
      message: reminder.message,
    });

    if (delivery.ok && delivery.mode === "api") {
      await markReminderSent(reminder.id);
      results.push({ id: reminder.id, status: "sent", mode: "api" });
    } else if (delivery.ok && delivery.mode === "manual") {
      results.push({
        id: reminder.id,
        status: "pending_manual",
        mode: "manual",
        url: delivery.url,
      });
    } else {
      await markReminderFailed(reminder.id);
      results.push({
        id: reminder.id,
        status: "failed",
        error: delivery.error,
        url: delivery.url,
      });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
