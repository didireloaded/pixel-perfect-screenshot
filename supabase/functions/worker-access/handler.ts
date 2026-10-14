import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { normalizeWorkerProfile } from "../../../shared/worker-signup.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });
const authOptions = { persistSession: false, autoRefreshToken: false };
function randomIndex(length: number) {
  const limit = Math.floor(0x100000000 / length) * length;
  let value: number;
  do {
    value = crypto.getRandomValues(new Uint32Array(1))[0]!;
  } while (value >= limit);
  return value % length;
}
function newCode() {
  const groups = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%"];
  const alphabet = groups.join("");
  const code = groups.map((group) => group[randomIndex(group.length)]!);
  while (code.length < 8) code.push(alphabet[randomIndex(alphabet.length)]!);
  for (let i = code.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [code[i], code[j]] = [code[j]!, code[i]!];
  }
  return code.join("");
}
async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function handleWorkerAccess(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return reply({ error: "Use POST" }, 405);
  try {
    const text = await request.text();
    if (text.length > 4096) return reply({ error: "Request is too large" }, 413);
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body))
      return reply({ error: "Invalid request" }, 400);
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: authOptions,
    });
    if (body.action === "register") {
      if (typeof body.fullName !== "string" || typeof body.phone !== "string")
        return reply({ error: "Enter your name and phone number" }, 400);
      const profile = normalizeWorkerProfile({ fullName: body.fullName, phone: body.phone });
      const companyCode =
        typeof body.companyCode === "string" ? body.companyCode.trim().toUpperCase() : "";
      if (!/^[0-9A-F]{16}$/.test(companyCode))
        return reply({ error: "Enter the company registration code from your manager." }, 400);
      // The gateway supplies the client IP. A global cap also bounds signup if IP headers are absent/spoofed.
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const { data: reservation, error: limitError } = await admin.rpc("sl_worker_signup_start", {
        p_ip_hash: await hash(ip),
        p_phone_hash: await hash(profile.phone),
        p_company_code: companyCode,
      });
      if (limitError)
        return reply({ error: "Registration is unavailable. Contact your manager." }, 503);
      if (reservation.error) return reply({ error: reservation.error }, 429);
      const accessCode = newCode();
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: `${reservation.employeeNo.toLowerCase()}@workers.shiftline.invalid`,
        password: accessCode,
        email_confirm: true,
      });
      if (createError || !created.user)
        return reply({ error: "Could not create your account. Contact your manager." }, 503);
      const { error: registerError } = await admin.rpc("sl_worker_register", {
        p_user_id: created.user.id,
        p_company_id: reservation.companyId,
        p_no: reservation.employeeNo,
        p_profile: profile,
      });
      if (registerError) {
        const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
        if (cleanupError)
          console.error("Worker provisioning cleanup requires attention", cleanupError.code);
        return reply({ error: registerError.message }, 400);
      }
      return reply({ employeeNo: reservation.employeeNo, accessCode }, 201);
    }
    if (body.action === "reset_code") {
      // JWT verification is performed here; never trust caller-supplied manager/company identity.
      const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
      const { data: identity, error: identityError } = await admin.auth.getUser(token);
      if (identityError || !identity.user) return reply({ error: "Sign in as a manager" }, 401);
      if (typeof body.employeeId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.employeeId))
        return reply({ error: "Choose a worker" }, 400);
      const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
        auth: authOptions,
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: target, error: targetError } = await caller.rpc("sl_worker_access_target", {
        p_employee_id: body.employeeId,
      });
      if (targetError || !target?.userId)
        return reply({ error: "Manager access to this worker is required" }, 403);
      const accessCode = newCode();
      const { error: resetError } = await admin.auth.admin.updateUserById(target.userId, {
        password: accessCode,
        email: `${target.employeeNo.toLowerCase()}@workers.shiftline.invalid`,
        email_confirm: true,
      });
      if (resetError) return reply({ error: "Could not replace the access code" }, 503);
      const { error: auditError } = await admin.rpc("sl_worker_code_replaced", {
        p_manager_user_id: identity.user.id,
        p_employee_id: body.employeeId,
      });
      if (auditError)
        console.error("Worker code replacement audit requires attention", auditError.code);
      return reply({ employeeNo: target.employeeNo, accessCode });
    }
    return reply({ error: "Invalid action" }, 400);
  } catch (error) {
    return reply(
      {
        error:
          error instanceof SyntaxError
            ? "Invalid request"
            : error instanceof Error
              ? error.message
              : "Request failed",
      },
      400,
    );
  }
}
