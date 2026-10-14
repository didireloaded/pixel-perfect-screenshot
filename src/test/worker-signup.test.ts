import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBackend } from "../../shared/backend";
const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
}));
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth, functions: { invoke } }) }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  invoke.mockResolvedValue({
    error: null,
    data: { employeeNo: "SL-100001", accessCode: "aB7!xy2?" },
  });
  auth.signInWithPassword.mockResolvedValue({ error: null, data: { session: {} } });
  auth.signUp.mockResolvedValue({ error: null, data: { session: null } });
});
describe("worker account boundary", () => {
  it("registers only name and normalized phone through the server, without email or a chosen password", async () => {
    const result = await createBackend("worker").registerWorker(
      {
        fullName: " Worker Name ",
        phone: "+264 (81) 123-4567",
      },
      " abcdef1234567890 ",
    );
    expect(invoke).toHaveBeenCalledWith("worker-access", {
      body: {
        action: "register",
        fullName: "Worker Name",
        phone: "+264811234567",
        companyCode: "ABCDEF1234567890",
      },
    });
    expect(result).toEqual({ employeeNo: "SL-100001", accessCode: "aB7!xy2?" });
    expect(auth.signUp).not.toHaveBeenCalled();
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it.each([
    { fullName: " ", phone: "+264811234567" },
    { fullName: "x".repeat(101), phone: "+264811234567" },
    { fullName: "Worker", phone: "" },
    { fullName: "Worker", phone: "081234567" },
  ])("rejects incomplete contact details", async (profile) => {
    await expect(
      createBackend("worker").registerWorker(profile, "ABCDEF1234567890"),
    ).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });
  it("uses native Supabase sessions for number-and-code sign in", async () => {
    expect(await createBackend("worker").signInWorker(" sl-100001 ", "aB7!xy2?")).toBe(true);
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "sl-100001@workers.shiftline.invalid",
      password: "aB7!xy2?",
    });
    await expect(
      createBackend("worker").signInWorker("other@example.com", "secret"),
    ).rejects.toThrow("employee number");
  });
  it("preserves manager email signup and sends code replacements to the authenticated server", async () => {
    const backend = createBackend("manager");
    await backend.signIn("manager@example.com", "long-password", true);
    expect(auth.signUp).toHaveBeenCalledOnce();
    await backend.replaceWorkerCode("employee-id");
    expect(invoke).toHaveBeenCalledWith("worker-access", {
      body: { action: "reset_code", employeeId: "employee-id" },
    });
    await expect(createBackend("worker").replaceWorkerCode("employee-id")).rejects.toThrow(
      "Manager access required",
    );
  });
  it("shows server failures and never accepts incomplete credentials", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { context: new Response(JSON.stringify({ error: "Too many attempts" })) },
    });
    await expect(
      createBackend("worker").registerWorker(
        { fullName: "Worker", phone: "+264811234567" },
        "ABCDEF1234567890",
      ),
    ).rejects.toThrow("Too many attempts");
    invoke.mockResolvedValue({ error: null, data: { employeeNo: "SL-100001" } });
    await expect(
      createBackend("worker").registerWorker(
        { fullName: "Worker", phone: "+264811234567" },
        "ABCDEF1234567890",
      ),
    ).rejects.toThrow("incomplete");
  });
});
