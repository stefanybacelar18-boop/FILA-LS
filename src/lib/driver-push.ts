import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

type DriverPushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

let configured = false;

function base64UrlToBase64(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  return normalized + "=".repeat(padLength);
}

function ensureWebPushConfigured() {
  if (configured) return true;

  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(
    "mailto:suporte@filadock.local",
    base64UrlToBase64(publicKey),
    base64UrlToBase64(privateKey)
  );
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
) {
  if (!ensureWebPushConfigured()) return;

  const admin = createAdminClient();
  const { data: subscriptions } = await admin
    .from("driver_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("driver_user_id", driverUserId);

  if (!subscriptions?.length) return;

  const jsonPayload = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (row) => {
      const subscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };

      try {
        await webpush.sendNotification(subscription, jsonPayload, {
          TTL: 60,
          urgency: "high",
        });
      } catch (error) {
        const statusCode =
          typeof error === "object" &&
          error !== null &&
          "statusCode" in error &&
          typeof (error as { statusCode?: unknown }).statusCode === "number"
            ? (error as { statusCode: number }).statusCode
            : null;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("driver_push_subscriptions").delete().eq("id", row.id);
        }
      }
    })
  );
}

