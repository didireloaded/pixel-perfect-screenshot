import { handleWorkerAccess } from "./handler.ts";
import { assertEquals, assertMatch } from "jsr:@std/assert@1.0.14";
Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "server-only-test-key");
Deno.env.set("SUPABASE_ANON_KEY", "public-test-key");
const manager = "11111111-1111-4111-8111-111111111111";
const worker = "22222222-2222-4222-8222-222222222222";
const calls: {
  path: string;
  method: string;
  body: Record<string, unknown>;
  authorization: string | null;
}[] = [];
const originalFetch = globalThis.fetch;
function mockFetch(deny = "") {
  calls.length = 0;
  globalThis.fetch = async (input, options) => {
    const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
    const body = typeof options?.body === "string" ? JSON.parse(options.body) : {};
    calls.push({
      path,
      method: options?.method ?? "GET",
      body,
      authorization: new Headers(options?.headers).get("authorization"),
    });
    const failure = (message: string) =>
      new Response(JSON.stringify({ message, code: "42501" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    let data: unknown = {};
    if (path.endsWith("sl_worker_signup_start"))
      data = { companyId: "company", employeeNo: "SL-100001" };
    if (path === "/auth/v1/admin/users" && options?.method === "POST")
      data = { user: { id: worker, email: body.email } };
    if (path.endsWith("sl_worker_register") && deny === "register")
      return failure("Phone already registered");
    if (path.endsWith("sl_worker_register")) data = { employeeNo: "SL-100001" };
    if (path === "/auth/v1/user") {
      if (deny === "jwt") return failure("Invalid JWT");
      data = { id: manager };
    }
    if (path.endsWith("sl_worker_access_target")) {
      if (deny === "target") return failure("Manager access required");
      data = { userId: worker, employeeNo: "SL-100001" };
    }
    if (path === `/auth/v1/admin/users/${worker}`) data = { user: { id: worker } };
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}
const request = (body: unknown, token = "") =>
  new Request("https://example.com", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
Deno.test(
  "public name and phone signup creates a pending native Auth identity and returns credentials once",
  async () => {
    mockFetch();
    try {
      const response = await handleWorkerAccess(
        request({
          action: "register",
          fullName: " Worker ",
          jobTitle: "Lighting technician",
          companyCode: "ABCDEF1234567890",
          phone: "+264 (81) 123-4567",
          role: "manager",
          companyId: "forged",
        }),
      );
      assertEquals(response.status, 201);
      const data = await response.json();
      assertEquals(data.employeeNo, "SL-100001");
      assertEquals(data.accessCode.length, 8);
      for (const pattern of [/[A-Z]/, /[a-z]/, /[0-9]/, /[!@#$%]/])
        assertMatch(data.accessCode, pattern);
      const create = calls.find((c) => c.path === "/auth/v1/admin/users")!;
      assertEquals(create.body.email, "sl-100001@workers.shiftline.invalid");
      assertEquals(create.body.email_confirm, true);
      assertEquals(create.body.password, data.accessCode);
      assertEquals(create.body.phone, undefined);
      const register = calls.find((c) => c.path.endsWith("sl_worker_register"))!;
      assertEquals(register.body.p_profile, {
        fullName: "Worker",
        phone: "+264811234567",
        jobTitle: "Lighting technician",
      });
      assertEquals(register.body.p_company_id, "company");
      assertEquals(
        calls.some((c) => c.path.endsWith("/signup")),
        false,
      );
      assertEquals(response.headers.get("cache-control"), "no-store");
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);
Deno.test(
  "failed database registration cleans only the newly provisioned Auth identity",
  async () => {
    mockFetch("register");
    try {
      const response = await handleWorkerAccess(
        request({
          action: "register",
          fullName: "Worker",
          phone: "+264811234567",
          companyCode: "ABCDEF1234567890",
        }),
      );
      assertEquals(response.status, 400);
      assertEquals((await response.json()).error, "Phone already registered");
      assertEquals(
        calls.filter((c) => c.method === "DELETE").map((c) => c.path),
        [`/auth/v1/admin/users/${worker}`],
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);
Deno.test(
  "code replacement requires verified manager JWT and scoped database authorization",
  async () => {
    for (const deny of ["jwt", "target", ""]) {
      mockFetch(deny);
      try {
        const response = await handleWorkerAccess(
          request(
            { action: "reset_code", employeeId: worker, companyId: "forged" },
            "manager-token",
          ),
        );
        assertEquals(response.status, deny === "jwt" ? 401 : deny === "target" ? 403 : 200);
        const reset = calls.find(
          (c) => c.path === `/auth/v1/admin/users/${worker}` && c.method === "PUT",
        );
        assertEquals(Boolean(reset), !deny);
        if (!deny) {
          assertEquals(
            calls.find((c) => c.path.endsWith("sl_worker_access_target"))?.authorization,
            "Bearer manager-token",
          );
          assertEquals(calls.find((c) => c.path.endsWith("sl_worker_code_replaced"))?.body, {
            p_manager_user_id: manager,
            p_employee_id: worker,
          });
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  },
);
Deno.test("invalid public input never reaches provisioning", async () => {
  mockFetch();
  try {
    assertEquals(
      (await handleWorkerAccess(request({ action: "register", fullName: "Worker", phone: "081" })))
        .status,
      400,
    );
    assertEquals(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
