import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStatusTimestampUpdates } from "@/lib/queue";
import { updateQueueEntryFields, writeQueueStatus } from "@/lib/queue-db";
import { parsePrevisaoInput } from "@/lib/utils";
import {
  assertStatusAllowed,
  canAccessAdmin,
  isStaffQueueRole,
} from "@/lib/role-permissions";
import {
  saveEntryPrioridade,
  mergePrioritiesIntoEntries,
  readPriorityMap,
  setEntryPriorityFallback,
  setAutoPriorityDismissed,
} from "@/lib/queue-priorities";
import {
  recalculateQueuePrevisoes,
  setPrevisaoManual,
  getMinutaMetadataByKey,
} from "@/lib/minuta-metadata-db";
import { shouldAutoPrioritize } from "@/lib/minuta-intelligence";
import { invalidateEnrichedQueueCache } from "@/lib/queue-enrich";
import { rateLimitAllow, rateLimitRetryAfterSec } from "@/lib/rate-limit";
import type { QueueEntry, QueueStatus } from "@/lib/types";
import { sendDriverPushNotification } from "@/lib/driver-push";
import {
  buildDriverCallPushBody,
  DRIVER_CALL_PUSH_TITLE,
} from "@/lib/driver-notification-copy";

type UpdateBody = {
  entryId?: string;
  status?: QueueStatus;
  doca?: string | null;
  prioridade?: boolean;
  previsao_descarregamento?: string | null;
  retorno_racks_vazios?: boolean | null;
  called_at?: string | null;
};

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile?.role || !isStaffQueueRole(profile.role)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const rateKey = `queue-update:${user.id}`;
    if (!rateLimitAllow(rateKey, 120, 60_000)) {
      return NextResponse.json(
        { error: "rate_limit", message: "Muitas alterações em sequência. Aguarde um momento." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimitRetryAfterSec(rateKey, 60_000)) },
        }
      );
    }

    let body: UpdateBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
    }

    const { entryId, status, doca, prioridade, previsao_descarregamento, retorno_racks_vazios, called_at } =
      body;
    if (!entryId) {
      return NextResponse.json({ error: "entryId obrigatório" }, { status: 400 });
    }

    if (prioridade !== undefined && !canAccessAdmin(profile.role)) {
      return NextResponse.json(
        { error: "Apenas o administrador pode definir prioridade" },
        { status: 403 }
      );
    }

    if (previsao_descarregamento !== undefined && !canAccessAdmin(profile.role)) {
      return NextResponse.json(
        { error: "Apenas o administrador pode definir previsão de descarregamento" },
        { status: 403 }
      );
    }

    if (retorno_racks_vazios !== undefined && !canAccessAdmin(profile.role)) {
      return NextResponse.json(
        { error: "Apenas o administrador pode marcar retorno com racks" },
        { status: 403 }
      );
    }

    const admin = createAdminClient();

    const { data: currentRow } = await admin
      .from("queue_entries")
      .select("*")
      .eq("id", entryId)
      .maybeSingle();

    if (!currentRow) {
      return NextResponse.json({ error: "Registro não encontrado" }, { status: 404 });
    }

    const currentStatus = currentRow.status as string;

    if (status && !assertStatusAllowed(profile.role, status, currentStatus)) {
      return NextResponse.json({ error: "Status não permitido para seu perfil" }, { status: 403 });
    }

    let savedPrioridade: boolean | undefined;

    if (prioridade !== undefined) {
      const prResult = await saveEntryPrioridade(admin, entryId, prioridade);
      if (prResult.error) {
        return NextResponse.json({ error: prResult.error }, { status: 500 });
      }
      await setEntryPriorityFallback(admin, entryId, prioridade);

      const meta = await getMinutaMetadataByKey(admin, currentRow.minuta as string);
      if (shouldAutoPrioritize(meta?.menor_vencimento)) {
        const dismissResult = await setAutoPriorityDismissed(admin, entryId, !prioridade);
        if (dismissResult.error) {
          return NextResponse.json({ error: dismissResult.error }, { status: 500 });
        }
      } else if (prioridade) {
        await setAutoPriorityDismissed(admin, entryId, false);
      }

      savedPrioridade = prResult.prioridade;
    }

    const fieldPatch: Record<string, unknown> = {};
    if (doca !== undefined) fieldPatch.doca = doca || null;
    if (previsao_descarregamento !== undefined) {
      if (previsao_descarregamento) {
        const parsed = parsePrevisaoInput(previsao_descarregamento);
        if (!parsed) {
          return NextResponse.json(
            { error: "Data de previsão inválida" },
            { status: 400 }
          );
        }
        fieldPatch.previsao_descarregamento = parsed.toISOString();
        await setPrevisaoManual(admin, entryId, true);
      } else {
        fieldPatch.previsao_descarregamento = null;
        await setPrevisaoManual(admin, entryId, false);
      }
    }
    if (retorno_racks_vazios !== undefined) {
      fieldPatch.retorno_racks_vazios = retorno_racks_vazios;
    }
    if (called_at !== undefined) {
      fieldPatch.called_at = called_at;
    }

    if (status && (status === "finalizado" || status === "ausente")) {
      fieldPatch.closed_by_user_id = user.id;
    }
    if (status === "aguardando_descarregamento") {
      fieldPatch.closed_by_user_id = null;
    }

    if (status) {
      const statusExtras = {
        ...getStatusTimestampUpdates(status),
        ...fieldPatch,
      };
      const { error } = await writeQueueStatus(admin, entryId, status, statusExtras);
      if (error) {
        return NextResponse.json({ error }, { status: 500 });
      }
    } else if (Object.keys(fieldPatch).length > 0) {
      const { error } = await updateQueueEntryFields(admin, entryId, fieldPatch);
      if (error) {
        return NextResponse.json({ error }, { status: 500 });
      }
    } else if (prioridade === undefined) {
      return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
    }

    const shouldRecalcPrevisao =
      prioridade !== undefined ||
      previsao_descarregamento !== undefined ||
      status !== undefined;

    if (shouldRecalcPrevisao) {
      await recalculateQueuePrevisoes(admin).catch(() => {});
    }

    invalidateEnrichedQueueCache();

    const { data: updated, error: fetchError } = await admin
      .from("queue_entries")
      .select("*")
      .eq("id", entryId)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const priorityMap = await readPriorityMap(admin);
    const [responseRow] = mergePrioritiesIntoEntries(
      [
        {
          ...(updated as QueueEntry),
          prioridade: savedPrioridade ?? Boolean(updated?.prioridade),
        },
      ],
      priorityMap
    );

    const shouldPushDriver =
      called_at !== undefined &&
      Boolean(updated?.called_at) &&
      Boolean(updated?.driver_user_id);

    let pushResult: { sent: number; failed: number; reason?: string } | undefined;

    if (shouldPushDriver) {
      pushResult = await sendDriverPushNotification(updated!.driver_user_id as string, {
        title: DRIVER_CALL_PUSH_TITLE,
        body: buildDriverCallPushBody({
          minuta: updated?.minuta,
          placa: updated?.placa,
          doca: updated?.doca,
        }),
        url: "/motorista",
        tag: `driver-call-${updated?.id}-${Date.now()}`,
      });
    }

    return NextResponse.json({ data: responseRow ?? updated, push: pushResult });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
