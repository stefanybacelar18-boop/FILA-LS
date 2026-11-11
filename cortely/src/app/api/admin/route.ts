import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getLiveSession,
  requirePermission,
  roleCan,
} from "@/lib/auth";
import {
  createScheduleBlock,
  deleteScheduleBlock,
  deleteService,
  getAdminCatalog,
  getDashboard,
  getScheduleBlock,
  listClients,
  listLoyalty,
  listReminders,
  listScheduleBlocks,
  deleteStaff,
  listStaff,
  markReminderSent,
  setWorkingHours,
  updateClient,
  updateShopSettings,
  upsertBarber,
  upsertService,
  upsertStaff,
} from "@/lib/data";

export async function GET(req: NextRequest) {
  try {
    const session = await getLiveSession(req);
    requirePermission(session, "agenda");

    const slug = req.nextUrl.searchParams.get("slug") ?? "navalha-negra";
    const catalog = await getAdminCatalog(slug);
    if (!catalog) {
      return NextResponse.json({ error: "Barbearia não encontrada" }, { status: 404 });
    }
    if (catalog.shop.id !== session!.barbershop_id) {
      return NextResponse.json(
        { error: "Sem acesso a esta barbearia" },
        { status: 403 },
      );
    }

    const q = req.nextUrl.searchParams.get("q") ?? undefined;

    const [dashboard, loyalty, reminders, clients, blocks, staff] =
      await Promise.all([
        getDashboard(catalog.shop.id, session),
        roleCan(session!.role, "fidelidade")
          ? listLoyalty(catalog.shop.id)
          : Promise.resolve([]),
        roleCan(session!.role, "lembretes")
          ? listReminders(catalog.shop.id)
          : Promise.resolve([]),
        roleCan(session!.role, "clientes")
          ? listClients(catalog.shop.id, q)
          : Promise.resolve([]),
        listScheduleBlocks({ barbershopId: catalog.shop.id }),
        roleCan(session!.role, "usuarios")
          ? listStaff(catalog.shop.id)
          : Promise.resolve([]),
      ]);

    return NextResponse.json({
      ...catalog,
      ...dashboard,
      loyalty,
      reminders,
      clients,
      scheduleBlocks: blocks,
      staff,
      session,
      permissions: {
        agenda: roleCan(session!.role, "agenda"),
        servicos: roleCan(session!.role, "servicos"),
        equipe: roleCan(session!.role, "equipe"),
        horarios: roleCan(session!.role, "horarios"),
        bloqueios: roleCan(session!.role, "bloqueios"),
        clientes: roleCan(session!.role, "clientes"),
        lembretes: roleCan(session!.role, "lembretes"),
        fidelidade: roleCan(session!.role, "fidelidade"),
        config: roleCan(session!.role, "config"),
        usuarios: roleCan(session!.role, "usuarios"),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no admin";
    const status = message.includes("login") || message.includes("permissão") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getLiveSession(req);
    requirePermission(session, "agenda");
    const body = await req.json();
    const action = z.string().parse(body.action);
    const slug = req.nextUrl.searchParams.get("slug") ?? "navalha-negra";
    const catalog = await getAdminCatalog(slug);
    if (!catalog) {
      return NextResponse.json({ error: "Barbearia não encontrada" }, { status: 404 });
    }
    if (catalog.shop.id !== session!.barbershop_id) {
      return NextResponse.json(
        { error: "Sem acesso a esta barbearia" },
        { status: 403 },
      );
    }

    switch (action) {
      case "upsert_barber": {
        requirePermission(session, "equipe");
        const data = z
          .object({
            id: z.string().uuid().optional(),
            name: z.string().min(2),
            specialties: z.array(z.string()).default([]),
            avatar_url: z.string().nullable().optional(),
            is_active: z.boolean().optional(),
          })
          .parse(body);
        return NextResponse.json({
          barber: await upsertBarber({
            ...data,
            barbershop_id: session!.barbershop_id,
          }),
        });
      }
      case "upsert_service": {
        requirePermission(session, "servicos");
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
        return NextResponse.json({
          service: await upsertService({
            ...data,
            barbershop_id: session!.barbershop_id,
          }),
        });
      }
      case "delete_service": {
        requirePermission(session, "servicos");
        const { id } = z.object({ id: z.string().uuid() }).parse(body);
        await deleteService(id, session!.barbershop_id);
        return NextResponse.json({ ok: true });
      }
      case "set_hours": {
        requirePermission(session, "horarios");
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
          workingHours: await setWorkingHours(
            data.barber_id,
            data.rows,
            session!.barbershop_id,
          ),
        });
      }
      case "update_settings": {
        requirePermission(session, "config");
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
            cancel_hours_before: z.number().int().nonnegative().optional(),
            booking_link_enabled: z.boolean().optional(),
            booking_slot_minutes: z.number().int().positive().max(120).optional(),
            booking_show_prices: z.boolean().optional(),
            booking_group_by_category: z.boolean().optional(),
            booking_barber_ids: z.array(z.string().uuid()).optional(),
            holidays: z
              .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
              .optional(),
          })
          .parse(body);
        return NextResponse.json({
          shop: await updateShopSettings({
            ...data,
            id: session!.barbershop_id,
          }),
        });
      }
      case "upsert_staff": {
        requirePermission(session, "usuarios");
        const data = z
          .object({
            id: z.string().uuid().optional(),
            email: z.string().email(),
            full_name: z.string().min(2),
            role: z.enum(["owner", "reception", "barber"]),
            barber_id: z.string().uuid().nullable().optional(),
          })
          .parse(body);
        // Staff não escolhe tenant; barbershop_id só da sessão.
        // Não permitir auto-alteração de papel.
        if (data.id && data.id === session!.id && data.role !== session!.role) {
          return NextResponse.json(
            { error: "Não é possível alterar o próprio papel" },
            { status: 403 },
          );
        }
        if (data.role === "owner" && session!.role !== "owner") {
          return NextResponse.json(
            { error: "Somente owner pode atribuir papel owner" },
            { status: 403 },
          );
        }
        const staff = await upsertStaff({
          ...data,
          barbershop_id: session!.barbershop_id,
          actorId: session!.id,
        });
        const { auditPermissionChange } = await import("@/lib/session-revoke");
        auditPermissionChange({
          actorId: session!.id,
          barbershopId: session!.barbershop_id,
          action: data.id ? "staff.update" : "staff.invite",
          detail: `${staff.email} · ${staff.role}`,
        });
        return NextResponse.json({ staff });
      }
      case "delete_staff": {
        requirePermission(session, "usuarios");
        const { id } = z.object({ id: z.string().uuid() }).parse(body);
        if (id === session!.id) {
          return NextResponse.json(
            { error: "Não é possível remover o próprio usuário" },
            { status: 400 },
          );
        }
        await deleteStaff(id, session!.barbershop_id, session!.id);
        return NextResponse.json({ ok: true, sessions_revoked: true });
      }
      case "mark_reminder_sent": {
        requirePermission(session, "lembretes");
        const { id } = z.object({ id: z.string().uuid() }).parse(body);
        return NextResponse.json({
          reminder: await markReminderSent(id, session!.barbershop_id),
        });
      }
      case "update_client": {
        requirePermission(session, "manage_clients");
        const data = z
          .object({
            id: z.string().uuid(),
            notes: z.string().nullable().optional(),
            email: z.string().nullable().optional(),
            preferred_barber_id: z.string().uuid().nullable().optional(),
            birth_date: z.string().nullable().optional(),
            full_name: z.string().optional(),
          })
          .parse(body);
        return NextResponse.json({
          client: await updateClient({
            ...data,
            barbershop_id: session!.barbershop_id,
          }),
        });
      }
      case "create_block": {
        requirePermission(session, "manage_blocks");
        const data = z
          .object({
            barber_id: z.string().uuid(),
            block_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            start_time: z.string().regex(/^\d{2}:\d{2}$/),
            end_time: z.string().regex(/^\d{2}:\d{2}$/),
            reason: z.string().nullable().optional(),
          })
          .parse(body);

        if (session!.role === "barber" && session!.barber_id !== data.barber_id) {
          return NextResponse.json(
            { error: "Barbeiro só pode bloquear a própria agenda" },
            { status: 403 },
          );
        }

        const block = await createScheduleBlock({
          barbershop_id: catalog.shop.id,
          barber_id: data.barber_id,
          block_date: data.block_date,
          start_time: data.start_time,
          end_time: data.end_time,
          reason: data.reason ?? null,
          created_by_role: session!.role,
        });
        return NextResponse.json({ block });
      }
      case "delete_block": {
        requirePermission(session, "manage_blocks");
        const { id } = z.object({ id: z.string().uuid() }).parse(body);
        const block = await getScheduleBlock(id);
        if (!block || block.barbershop_id !== session!.barbershop_id) {
          return NextResponse.json({ error: "Bloqueio não encontrado" }, { status: 404 });
        }
        if (session!.role === "barber" && session!.barber_id) {
          if (block.barber_id !== session!.barber_id) {
            return NextResponse.json(
              { error: "Barbeiro só pode remover o próprio bloqueio" },
              { status: 403 },
            );
          }
        }
        await deleteScheduleBlock(id, session!.barbershop_id);
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no admin";
    const status = message.includes("login") || message.includes("permissão") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
