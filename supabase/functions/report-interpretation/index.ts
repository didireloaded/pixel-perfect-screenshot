import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { interpretReport, model } from "./interpret.mjs";

const backend = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!bearer) return new Response("Unauthorized", { status: 401 });
    const { data: token, error } = await backend.rpc("sl_report_ai_dispatch_key");
    if (error || typeof token !== "string" || !token) throw new Error("Dispatcher unavailable");
    if (
      bearer.length !== token.length ||
      [...bearer].reduce((diff, c, i) => diff | (c.charCodeAt(0) ^ token.charCodeAt(i)), 0)
    ) {
      return new Response("Unauthorized", { status: 401 });
    }
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return new Response("Report processing unavailable", { status: 503 });
    const { data: jobs, error: batchError } = await backend.rpc("sl_report_ai_batch");
    if (batchError) throw new Error("Queue unavailable");
    let completed = 0;
    for (const job of jobs ?? []) {
      let suggestion = null;
      try {
        suggestion = await interpretReport(job.report, key);
      } catch {
        // Provider responses and evidence must never enter logs. Durable queue retries failures.
      }
      const { data: accepted, error: resultError } = await backend.rpc("sl_report_ai_result", {
        p_incident: job.id,
        p_lease: job.lease,
        p_suggestion: suggestion,
        p_model: model,
      });
      if (resultError) throw new Error("Could not save report interpretation");
      if (accepted && suggestion) completed++;
    }
    return Response.json({ processed: jobs?.length ?? 0, completed });
  } catch {
    return new Response("Report processing temporarily unavailable", { status: 503 });
  }
});
