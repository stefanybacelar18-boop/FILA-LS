import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

type DriverPushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

let configured = false;

function ensureWebPushConfigured() {
  if (configured) return true;

  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails("mailto:suporte@filadock.local", publicKey, privateKey);
  configured = true;
  return true;
}

export function getWebPushPublicKey(): string | null {
  const key = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY?.trim();
  return key || null;
}

export async function sendDriverPushNotification(
  driverUserId: string,
  payload: DriverPushPayload
): Promise<{ sent: number; failed: number; reason?: string }> {
  if (!ensureWebPushConfigured()) {
    return { sent: 0, failed: 0, reason: "push_not_configured" };
  }

  const admin = createAdminClient();
  const { data: subscriptions, error } = await admin
    .from("driver_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("driver_user_id", driverUserId);

  if (error) {
    return { sent: 0, failed: 0, reason: error.message };
  }

  if (!subscriptions?.length) {
    return { sent: 0, failed: 0, reason: "no_subscriptions" };
  }

  const jsonPayload = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (row) => {
      const subscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };

      try {
        await webpush.sendNotification(subscription, jsonPayload, {
          TTL: 300,
          urgency: "high",
        });
        sent += 1;
      } catch (pushError) {
        failed += 1;
        const statusCode =
          typeof pushError === "object" &&
          pushError !== null &&
          "statusCode" in pushError &&
          typeof (pushError as { statusCode?: unknown }).statusCode === "number"
            ? (pushError as { statusCode: number }).statusCode
            : null;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("driver_push_subscriptions").delete().eq("id", row.id);
        }
      }
    })
  );

  return {
    sent,
    failed,
    reason: sent === 0 ? "push_delivery_failed" : undefined,
  };
}
