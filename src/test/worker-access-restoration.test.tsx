import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import LiveWorkerApp from "../../worker-ui/src/LiveWorkerApp";
import type { AttendanceSnapshot } from "../../shared/attendance";
import { attendanceOutbox } from "../../shared/web-attendance-outbox";
const api = vi.hoisted(() => ({ snapshot: vi.fn(), command: vi.fn(), watch: vi.fn() }));
vi.mock("../../worker-ui/src/backend", () => api);
vi.mock("../../shared/BrowserNotifications", () => ({ BrowserNotifications: () => null }));
vi.mock("../../shared/watch-work-position", () => ({ watchWorkPosition: vi.fn(() => () => {}) }));
const snapshot = {
  me: "worker",
  today: "2026-10-14",
  role: "employee",
  company: { id: "company", name: "Company", timezone: "Africa/Windhoek" },
  employees: [{ id: "worker", name: "Registered worker", role: "employee" }],
  shifts: [],
  sites: [],
  jobs: [],
  messages: [],
  notices: [],
  events: [],
  submissions: [],
  states: [],
} as unknown as AttendanceSnapshot;
let refresh: () => Promise<void>;
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
  vi.resetAllMocks();
  api.snapshot.mockResolvedValue(snapshot);
  api.watch.mockImplementation((_id, callback) => {
    refresh = callback;
    return () => {};
  });
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("removes company records and returns to approval when access is withdrawn", async () => {
  const onAccessChanged = vi.fn();
  render(<LiveWorkerApp onSignOut={vi.fn()} onAccessChanged={onAccessChanged} />);
  await screen.findByRole("heading", { name: "Registered worker" });
  api.snapshot.mockResolvedValue({ onboarding: true, workerAccess: { status: "rejected" } });
  await act(async () => {
    await refresh();
  });
  await waitFor(() => expect(onAccessChanged).toHaveBeenCalledOnce());
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: "Registered worker" })).not.toBeInTheDocument(),
  );
});
it("handles an onboarding snapshot on initial load without reading missing company fields", async () => {
  api.snapshot.mockResolvedValue({ onboarding: true });
  const changed = vi.fn();
  render(<LiveWorkerApp onSignOut={vi.fn()} onAccessChanged={changed} />);
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(
    screen.getByText("Your workplace access has changed. Contact your manager."),
  ).toBeInTheDocument();
});
it("discards a pending old-account refresh after the component is unmounted", async () => {
  let finish: (value: object) => void = () => {};
  api.snapshot.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const changed = vi.fn();
  const view = render(<LiveWorkerApp onSignOut={vi.fn()} onAccessChanged={changed} />);
  view.unmount();
  finish({ onboarding: true });
  await Promise.resolve();
  expect(changed).not.toHaveBeenCalled();
});
it("does not submit a delayed GPS check-in after the account screen unmounts", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-14T08:00:00Z"));
  let located: PositionCallback = () => {};
  const getCurrentPosition = vi.fn((callback) => {
    located = callback;
  });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
  api.snapshot.mockResolvedValue({ ...snapshot, policy: { require_gps_stamp: true } });
  const view = render(<LiveWorkerApp onSignOut={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Check in" }));
  fireEvent.click(screen.getByRole("button", { name: "Check in now" }));
  expect(getCurrentPosition).toHaveBeenCalledOnce();
  view.unmount();
  await act(async () => {
    located({
      coords: { latitude: -22.6, longitude: 17.08, accuracy: 10 },
      timestamp: Date.now(),
    } as GeolocationPosition);
  });
  expect(api.command).not.toHaveBeenCalled();
});
it("stops replaying the old account queue after unmount and preserves unsent evidence", async () => {
  const outbox = attendanceOutbox(localStorage, "company", "worker");
  for (const id of ["first", "second"])
    outbox.save({
      id,
      shiftId: "shift",
      type: "start_lunch",
      capturedAt: "2026-10-14T10:00:00Z",
      offline: true,
    });
  let accepted: (value: unknown) => void = () => {};
  api.command.mockImplementation(
    () =>
      new Promise((resolve) => {
        accepted = resolve;
      }),
  );
  const view = render(<LiveWorkerApp onSignOut={vi.fn()} />);
  await waitFor(() => expect(api.command).toHaveBeenCalledOnce());
  view.unmount();
  await act(async () => {
    accepted({ status: "synced", snapshot });
  });
  expect(api.command).toHaveBeenCalledOnce();
  expect(outbox.list().map((event) => event.id)).toEqual(["second"]);
});
it("explains an unresolved previous workday instead of offering another check-in", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-14T08:00:00Z"));
  api.snapshot.mockResolvedValue({
    ...snapshot,
    shifts: [
      { id: "previous", employeeId: "worker", date: "2026-10-13", start: "08:00", end: "17:00" },
    ],
    states: [{ shiftId: "previous", employeeId: "worker", state: "working" }],
  });
  render(<LiveWorkerApp onSignOut={vi.fn()} />);
  await screen.findByText("Previous workday needs review");
  expect(screen.getByRole("button", { name: "Check in" })).toBeDisabled();
  expect(screen.getByText("Needs review")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Review previous workday" })).toBeEnabled();
  expect(api.command).not.toHaveBeenCalled();
});
