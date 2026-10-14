import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttendanceProvider, useAttendance } from "../lib/app-store";
const api = vi.hoisted(() => ({
  authenticated: vi.fn(),
  snapshot: vi.fn(),
  command: vi.fn(),
  signOut: vi.fn(),
  onAuthChange: vi.fn(),
  watch: vi.fn(),
}));
vi.mock("../lib/backend", () => ({
  ...api,
  backendMode: "cloud",
  signIn: vi.fn(),
  resendConfirmation: vi.fn(),
  resetPassword: vi.fn(),
  updatePassword: vi.fn(),
}));
let auth: (event: string, userId: string | null) => void;
const records = (name: string) => ({
  me: "employee-1",
  role: "manager",
  company: { id: "company-1", name: "Company", timezone: "Africa/Windhoek" },
  today: "2026-10-12",
  employees: [{ id: "employee-1", name, siteId: "site-1" }],
  sites: [],
  shifts: [],
  events: [],
  jobs: [],
  states: [],
  periods: [],
});
function RecordView() {
  const data = useAttendance();
  return (
    <>
      <p>{data.employees[0]?.name}</p>
      <button onClick={() => void data.command("add_manager_note", {})}>Save</button>
    </>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  api.authenticated.mockResolvedValue(true);
  api.onAuthChange.mockImplementation((callback) => {
    auth = callback;
    return () => {};
  });
  api.watch.mockReturnValue(() => {});
});
afterEach(() => vi.restoreAllMocks());
describe("real account restoration", () => {
  it("retries a temporary startup failure without asking for login or company setup", async () => {
    api.snapshot
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValue(records("Restored manager"));
    render(
      <AttendanceProvider>
        <RecordView />
      </AttendanceProvider>,
    );
    await screen.findByRole("heading", { name: "Reconnect to your account" });
    expect(screen.queryByRole("heading", { name: "Welcome back" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry connection" }));
    await screen.findByText("Restored manager");
  });
  it("restores persisted records after remount and honors explicit sign-out", async () => {
    api.snapshot.mockResolvedValue(records("Returning manager"));
    const first = render(
      <AttendanceProvider>
        <RecordView />
      </AttendanceProvider>,
    );
    await screen.findByText("Returning manager");
    first.unmount();
    render(
      <AttendanceProvider>
        <RecordView />
      </AttendanceProvider>,
    );
    await screen.findByText("Returning manager");
    api.authenticated.mockResolvedValue(false);
    await act(async () => auth("SIGNED_OUT", null));
    await screen.findByRole("heading", { name: "Welcome back" });
    expect(screen.queryByText("Returning manager")).not.toBeInTheDocument();
  });
  it("offers company setup for an account without company membership", async () => {
    api.snapshot.mockResolvedValue({ onboarding: true });
    render(
      <AttendanceProvider>
        <RecordView />
      </AttendanceProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Set up your company" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "I have a workplace access code" }));
    expect(screen.getByRole("heading", { name: "Join your workplace" })).toBeInTheDocument();
  });
  it("discards an old command result and restores a newly signed-in account", async () => {
    api.snapshot.mockResolvedValue(records("First account"));
    let finish: (value: unknown) => void = () => {};
    api.command.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <AttendanceProvider>
        <RecordView />
      </AttendanceProvider>,
    );
    await screen.findByText("First account");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.command).toHaveBeenCalledOnce());
    api.snapshot.mockResolvedValue(records("Second account"));
    await act(async () => {
      auth("SIGNED_IN", "new-auth-user");
    });
    await act(async () => {
      finish({ snapshot: records("Stale account") });
    });
    expect(await screen.findByText("Second account")).toBeInTheDocument();
    expect(screen.queryByText("Stale account")).not.toBeInTheDocument();
  });
});
