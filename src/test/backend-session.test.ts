import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createBackend } from "../../shared/backend";

const api = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: api, rpc: api.rpc }) }));
vi.mock("../../shared/supabase-config", () => ({
  readSupabaseConfig: () => ({ url: "https://test.supabase.co", key: "sb_publishable_test" }),
}));
const session = (token = "original-token") => ({ access_token: token, user: { id: token } });
beforeEach(() => {
  vi.resetAllMocks();
  api.getSession.mockResolvedValue({ data: { session: session() }, error: null });
  api.getUser.mockResolvedValue({ data: { user: { id: "original-token" } }, error: null });
  api.signOut.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllGlobals());

it("verifies a restored session with Auth instead of trusting cached user data", async () => {
  expect(await createBackend("worker").hasSession()).toBe(true);
  expect(api.getUser).toHaveBeenCalledOnce();
  expect(api.signOut).not.toHaveBeenCalled();
});

it("does not contact Auth when there are no saved credentials", async () => {
  api.getSession.mockResolvedValue({ data: { session: null }, error: null });
  expect(await createBackend("manager").hasSession()).toBe(false);
  expect(api.getUser).not.toHaveBeenCalled();
});

it.each(["user_not_found", "session_not_found", "bad_jwt"])(
  "clears cached credentials after authoritative %s rejection",
  async (code) => {
    api.getUser.mockResolvedValue({
      data: { user: null },
      error: { code, message: "Account unavailable", status: 403 },
    });
    expect(await createBackend("worker").hasSession()).toBe(false);
    expect(api.signOut).toHaveBeenCalledWith({ scope: "local" });
  },
);

it("preserves credentials during an Auth outage", async () => {
  api.getUser.mockResolvedValue({
    data: { user: null },
    error: { message: "Auth temporarily unavailable", status: 503 },
  });
  await expect(createBackend("worker").hasSession()).rejects.toThrow("temporarily unavailable");
  expect(api.signOut).not.toHaveBeenCalled();
  api.getUser.mockRejectedValue(new TypeError("Failed to fetch"));
  await expect(createBackend("worker").hasSession()).rejects.toThrow("Failed to fetch");
  expect(api.signOut).not.toHaveBeenCalled();
});

it("does not sign out a different account after an older validation request fails", async () => {
  api.getSession
    .mockResolvedValueOnce({ data: { session: session() }, error: null })
    .mockResolvedValueOnce({ data: { session: session("new-token") }, error: null });
  api.getUser.mockResolvedValue({
    data: { user: null },
    error: { code: "user_not_found", status: 403, message: "Old account deleted" },
  });
  expect(await createBackend("manager").hasSession()).toBe(false);
  expect(api.signOut).not.toHaveBeenCalled();
});

it("revokes browser push and signs out even when server subscription cleanup fails", async () => {
  const unsubscribe = vi.fn().mockResolvedValue(true);
  vi.stubGlobal("navigator", {
    serviceWorker: {
      getRegistration: vi.fn().mockResolvedValue({
        pushManager: {
          getSubscription: vi
            .fn()
            .mockResolvedValue({ endpoint: "https://push.test/device", unsubscribe }),
        },
      }),
    },
  });
  api.rpc.mockRejectedValue(new Error("Offline"));
  await createBackend("worker").signOut();
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(api.signOut).toHaveBeenCalledWith({ scope: "local" });
});
