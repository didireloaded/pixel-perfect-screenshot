import { createClient } from "npm:@supabase/supabase-js@2.117.3";
// @deno-types="npm:@types/web-push@3.6.4"
import webpush from "npm:web-push@3.6.7";
type Delivery = {
  id: string;
  lease: string;
  active: boolean;
  endpoint: string;
  p256dh: string;
  auth: string;
  notificationId: string;
  title: string;
  app: string;
};

const backend = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const keys = webpush.generateVAPIDKeys();
    const { data: config, error } = await backend.rpc("sl_push_configuration", {
      public_key: keys.publicKey,
      private_key: keys.privateKey,
    });
    if (error) throw error;
    const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (
      bearer.length !== config.shiftline_push_dispatch.length ||
      [...bearer].reduce(
        (difference, value, index) =>
          difference | (value.charCodeAt(0) ^ config.shiftline_push_dispatch.charCodeAt(index)),
        0,
      ) !== 0
    ) {
      return new Response("Unauthorized", { status: 401 });
    }
    webpush.setVapidDetails(
      "https://shiftline-workforce.didireloaded.chatgpt.site",
      config.shiftline_vapid_public,
      config.shiftline_vapid_private,
    );
    const { data: deliveries, error: batchError } = await backend.rpc("sl_push_batch");
    if (batchError) throw batchError;
    for (let offset = 0; offset < deliveries.length; offset += 5) {
      await Promise.all(
        deliveries.slice(offset, offset + 5).map(async (item: Delivery) => {
          let outcome = "failed";
          if (item.active) {
            try {
              await webpush.sendNotification(
                { endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } },
                JSON.stringify({
                  title: item.title,
                  body: "Open Shiftline to view the update.",
                  id: item.notificationId,
                  url:
                    item.app === "manager"
                      ? "/manager?tab=Notifications"
                      : "/?notification=" + item.notificationId,
                }),
                { TTL: 3600, timeout: 8000 },
              );
              outcome = "sent";
            } catch (cause) {
              const status = (cause as { statusCode?: number }).statusCode;
              outcome =
                status === 404 || status === 410
                  ? "gone"
                  : status === 429 || !status || status >= 500
                    ? "retry"
                    : "failed";
            }
          }
          const { error: resultError } = await backend.rpc("sl_push_result", {
            delivery: item.id,
            token: item.lease,
            outcome,
          });
          if (resultError) throw resultError;
        }),
      );
    }
    return Response.json({ processed: deliveries.length });
  } catch {
    return Response.json({ error: "Notification dispatch failed" }, { status: 500 });
  }
});
