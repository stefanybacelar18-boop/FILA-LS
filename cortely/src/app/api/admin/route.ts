import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteService,
  getAdminCatalog,
  getDashboard,
  listLoyalty,
  listReminders,
  markReminderSent,
  setWorkingHours,
  updateShopSettings,
  upsertBarber,
  upsertService,
} from "@/lib/data";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "navalha-negra";
  const catalog = await getAdminCatalog(slug);
  if (!catalog) {
    return NextResponse.json({ error: "Barbearia não encontrada" }, { status: 404 });
  }

  const [dashboard, loyalty, reminders] = await Promise.all([
    getDashboard(catalog.shop.id),
    listLoyalty(catalog.shop.id),
    listReminders(catalog.shop.id),
  ]);

  return NextResponse.json({
    ...catalog,
    ...dashboard,
    loyalty,
    reminders,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = z.string().parse(body.action);

    switch (action) {
      case "upsert_barber": {
        const data = z
          .object({
            id: z.string().uuid().optional(),
            name: z.string().min(2),
            specialties: z.array(z.string()).default([]),
            avatar_url: z.string().nullable().optional(),
            is_active: z.boolean().optional(),
          })
          .parse(body);
        return NextResponse.json({ barber: await upsertBarber(data) });
      }
      case "upsert_service": {
        const data = z
          .object({
            id: z.string().uuid().optional(),
            name: z.string().min(2),
            description: z.string().optional(),
            duration_minutes: z.number().int().positive(),
            price: z.number().nonnegative(),
            category: z.string().optional(),
            gallery_urls: z.array(z.string()).optional(),
          })
          .parse(body);
        return NextResponse.json({ service: await upsertService(data) });
      }
      case "delete_service": {
        const { id } = z.object({ id: z.string().uuid() }).parse(body);
        await deleteService(id);
        return NextResponse.json({ ok: true });
      }
      case "set_hours": {
        const data = z
          .object({
            barber_id: z.string().uuid(),
            rows: z.array(
              z.object({
                day_of_week: z.number().int().min(0).max(6),
                start_time: z.string(),
                end_time: z.string(),
                break_start: z.string().nullable(),
                break_end: z.string().nullable(),
              }),
            ),
          })
          .parse(body);
        return NextResponse.json({
          workingHours: await setWorkingHours(data.barber_id, data.rows),
        });
      }
      case "update_settings": {
        const data = z
          .object({
            name: z.string().optional(),
            phone: z.string().optional(),
            address: z.string().nullable().optional(),
            primary_color: z.string().optional(),
            banner_url: z.string().nullable().optional(),
            logo_url: z.string().nullable().optional(),
            loyalty_threshold: z.number().int().positive().optional(),
            loyalty_reward: z.string().optional(),
            reminder_hours_before: z.number().int().positive().optional(),
          })
          .parse(body);
        return NextResponse.json({ shop: await updateShopSettings(data) });
      }
      case "mark_reminder_sent": {
        const { id } = z.object({ id: z.string().uuid() }).parse(body);
        return NextResponse.json({ reminder: await markReminderSent(id) });
      }
      default:
        return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no admin";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
