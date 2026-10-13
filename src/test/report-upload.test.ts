import { File as NodeFile } from "node:buffer";
import { beforeEach, expect, it, vi } from "vitest";
import { createBackend } from "../../shared/backend";
const api = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn(), createSignedUrl: vi.fn() }));
vi.mock("../../shared/supabase-config", () => ({
  readSupabaseConfig: () => ({ url: "https://test.supabase.co", key: "sb_publishable_test_only" }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: api.rpc,
    storage: { from: () => ({ upload: api.upload, createSignedUrl: api.createSignedUrl }) },
  }),
}));
const file = (contents: string, name = "report.txt") =>
  new NodeFile([contents], name) as unknown as File;
beforeEach(() => {
  vi.clearAllMocks();
  api.rpc.mockImplementation(async (_name, payload) => ({
    error: null,
    data:
      payload.p_action === "reserve_report_document"
        ? {
            snapshot: {
              reportDocuments: [{ id: "doc", status: "pending", object_path: "company/doc.txt" }],
            },
          }
        : {},
  }));
  api.upload.mockResolvedValue({ error: null });
});
it("reserves a scoped path and confirms only after a real upload succeeds", async () => {
  const backend = createBackend("manager");
  const selected = file("Evidence");
  await backend.uploadReport("incident", "doc", selected);
  expect(api.rpc).toHaveBeenNthCalledWith(1, "sl_command", {
    p_action: "reserve_report_document",
    p_data: {
      id: "doc",
      incidentId: "incident",
      filename: "report.txt",
      mimeType: "text/plain",
      sizeBytes: 8,
    },
  });
  expect(api.upload).toHaveBeenCalledWith("company/doc.txt", selected, {
    contentType: "text/plain",
    upsert: false,
  });
  expect(api.rpc).toHaveBeenNthCalledWith(2, "sl_command", {
    p_action: "finish_report_document",
    p_data: { id: "doc" },
  });
});
it("does not finalize a failed upload and never overwrites an existing original", async () => {
  const backend = createBackend("manager");
  api.upload.mockResolvedValueOnce({ error: { statusCode: "503", message: "Upload unavailable" } });
  await expect(backend.uploadReport("incident", "doc", file("Evidence"))).rejects.toThrow(
    "Upload unavailable",
  );
  expect(api.rpc).toHaveBeenCalledTimes(1);
  api.upload.mockResolvedValueOnce({ error: { statusCode: "409", message: "Already exists" } });
  await backend.uploadReport("incident", "doc", file("Evidence"));
  expect(api.rpc).toHaveBeenLastCalledWith("sl_command", {
    p_action: "finish_report_document",
    p_data: { id: "doc" },
  });
});
it("rejects unsupported, empty and misleading files before contacting Storage", async () => {
  const backend = createBackend("manager");
  await expect(
    backend.uploadReport("incident", "doc", file("Not a PDF", "report.pdf")),
  ).rejects.toThrow("not a PDF");
  await expect(
    backend.uploadReport("incident", "doc", file("script", "report.exe")),
  ).rejects.toThrow("Only PDF");
  await expect(backend.uploadReport("incident", "doc", file(""))).rejects.toThrow("up to 5 MB");
  await expect(
    createBackend("worker").uploadReport("incident", "doc", file("Evidence")),
  ).rejects.toThrow("Manager access");
  expect(api.rpc).not.toHaveBeenCalled();
  expect(api.upload).not.toHaveBeenCalled();
});
