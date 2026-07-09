import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWebPushPublicKey } from "@/lib/driver-push";

type SubscriptionBody = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  expirationTime?: number | null;
};

export async function GET() {
  return NextResponse.json({
    publicKey: getWebPushPublicKey(),
    enabled: Boolean(getWebPushPublicKey()),
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let body: SubscriptionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  const endpoint = body.endpoint?.trim();
  const p256dh = body.keys?.p256dh?.trim();
  const auth = body.keys?.auth?.trim();

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Subscription inválida" }, { status: 400 });
  }

  const admin = createAdminClient();

  await admin
    .from("driver_push_subscriptions")
    .delete()
    .eq("driver_user_id", user.id)
    .eq("endpoint", endpoint);

  const { error } = await admin.from("driver_push_subscriptions").insert({
    driver_user_id: user.id,
    endpoint,
    p256dh,
    auth,
    expiration_time: body.expirationTime ?? null,
    user_agent: request.headers.get("user-agent"),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    const hint =
      error.message.includes("driver_push_subscriptions") ||
      error.message.includes("does not exist")
        ? " Execute migracao-web-push-motorista.sql no Supabase."
        : "";
    return NextResponse.json({ error: `${error.message}${hint}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let body: { endpoint?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  const endpoint = body.endpoint?.trim();
  if (!endpoint) {
    return NextResponse.json({ error: "Endpoint obrigatório" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("driver_push_subscriptions")
    .delete()
    .eq("driver_user_id", user.id)
    .eq("endpoint", endpoint);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

