import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProfileChangeRequests } from "../../shared/ProfileChangeRequests";
import { JobAcknowledgements } from "../../worker-ui/src/components/JobAcknowledgements";
import { KnowledgeCentre } from "../../shared/KnowledgeCentre";
afterEach(cleanup);

it("preserves unsaved profile changes across background refresh and resets across account remount", async () => {
  const value = {
    currentProfile: { name: "John", contactPhone: "", jobTitle: "Technician", bio: "" },
    requests: [],
  };
  const rpc = vi.fn().mockResolvedValue(value);
  const view = render(<ProfileChangeRequests key="company:john" rpc={rpc} refreshKey={1} />);
  const name = await screen.findByLabelText("Name");
  await waitFor(() => expect(name).toHaveValue("John"));
  fireEvent.change(name, { target: { value: "John Updated" } });
  view.rerender(<ProfileChangeRequests key="company:john" rpc={rpc} refreshKey={2} />);
  await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText("Name")).toHaveValue("John Updated");
  rpc.mockResolvedValue({
    ...value,
    currentProfile: { ...value.currentProfile, name: "Other Employee" },
  });
  view.rerender(<ProfileChangeRequests key="company:other" rpc={rpc} refreshKey={3} />);
  await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Other Employee"));
});

it("sends a job availability response through the real component callback", async () => {
  const rpc = vi.fn().mockResolvedValue({ responses: [], reportingTimes: [] });
  render(<JobAcknowledgements jobId="job" rpc={rpc} />);
  const available = screen.getByRole("button", { name: "Available" });
  await waitFor(() => expect(available).toBeEnabled());
  fireEvent.click(available);
  await waitFor(() =>
    expect(rpc).toHaveBeenCalledWith("respond", { jobId: "job", response: "available", note: "" }),
  );
});

it("acknowledges only the selected published policy version", async () => {
  const entry = {
    id: "version-1",
    article_id: "policy",
    version: 1,
    category: "policy",
    title: "Workplace policy",
    body: "Original policy text.",
    published: true,
    created_at: "2026-10-19T08:00:00Z",
  };
  const rpc = vi
    .fn()
    .mockResolvedValue({ entries: [entry], acknowledgements: [], employees: [], me: "worker" });
  render(<KnowledgeCentre rpc={rpc} onChanged={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: /Workplace policy.*Version 1/ }));
  expect(screen.getByText("Original policy text.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "I have read this version" }));
  await waitFor(() => expect(rpc).toHaveBeenCalledWith("acknowledge", { versionId: "version-1" }));
});
