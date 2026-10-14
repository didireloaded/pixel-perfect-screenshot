import { beforeEach, expect, it, vi } from "vitest";
import { createBackend } from "../../shared/backend";
const api = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  createSignedUrl: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: api.rpc, storage: { from: api.from } }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  api.from.mockReturnValue({ createSignedUrl: api.createSignedUrl, upload: api.upload });
  api.createSignedUrl.mockResolvedValue({
    error: null,
    data: { signedUrl: "https://example.supabase.co/signed-logo" },
  });
});
it("resolves private logos for refreshed and command-returned snapshots", async () => {
  const company = () => ({ id: "company", logoPath: "company/logo.png" });
  api.rpc.mockImplementation(async (name: string) => ({
    error: null,
    data:
      name === "sl_command"
        ? { snapshot: { company: company() } }
        : name === "sl_snapshot"
          ? { company: company() }
          : [],
  }));
  const backend = createBackend("manager");
  const snapshot = await backend.snapshot<{ company: { logoUrl: string } }>();
  const command = await backend.command<{ snapshot: typeof snapshot }>("save_company_profile", {
    name: "Good Living",
  });
  expect(snapshot.company.logoUrl).toBe("https://example.supabase.co/signed-logo");
  expect(command.snapshot.company.logoUrl).toBe(snapshot.company.logoUrl);
  expect(api.from).toHaveBeenCalledWith("company-logos");
  expect(api.createSignedUrl).toHaveBeenCalledWith("company/logo.png", 3600);
});
it("does not let a logo outage block work records", async () => {
  api.rpc.mockResolvedValue({
    error: null,
    data: { company: { id: "company", logoPath: "company/logo.png" } },
  });
  api.createSignedUrl.mockRejectedValue(new Error("Offline"));
  expect(await createBackend("worker").snapshot()).toEqual({
    company: { id: "company", logoPath: "company/logo.png" },
  });
});
it("rejects unsupported logos and worker uploads before storage", async () => {
  const svg = new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" });
  await expect(createBackend("manager").uploadCompanyLogo("company", svg)).rejects.toThrow(
    "PNG, JPEG or WebP",
  );
  await expect(createBackend("worker").uploadCompanyLogo("company", svg)).rejects.toThrow(
    "Manager access required",
  );
  expect(api.upload).not.toHaveBeenCalled();
});
it("requires a company code before creating a worker", async () => {
  await expect(
    createBackend("worker").registerWorker({ fullName: "Worker", phone: "+264811234567" }),
  ).rejects.toThrow("company registration code");
});
