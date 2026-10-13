import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BrowserNotifications } from "../../shared/BrowserNotifications";
const { notifications } = vi.hoisted(() => ({ notifications: vi.fn().mockResolvedValue([]) }));
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
vi.mock("../../shared/backend", () => ({ createBackend: () => ({ notifications }) }));
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("Notification", { permission: "default", requestPermission: vi.fn() });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  if (originalShow) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShow);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});
it("skips setup when this device already has a push subscription", async () => {
  vi.stubGlobal("navigator", {
    serviceWorker: {
      register: vi.fn().mockResolvedValue({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue({ endpoint: "existing-device" }),
        },
      }),
    },
  });
  render(<BrowserNotifications app="worker" prompt />);
  await waitFor(() =>
    expect(localStorage.getItem("shiftline-notification-setup-seen:worker")).toBe("complete"),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(Notification.requestPermission).not.toHaveBeenCalled();
});
it("shows setup once, then leaves the home screen clear after dismissal and remount", async () => {
  const view = render(<BrowserNotifications app="worker" prompt />);
  await screen.findByRole("dialog");
  expect(Notification.requestPermission).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Not now" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  view.unmount();
  render(<BrowserNotifications app="worker" prompt />);
  await waitFor(() =>
    expect(localStorage.getItem("shiftline-notification-setup-seen:worker")).toBe("shown"),
  );
  expect(screen.queryByRole("region", { name: "App notifications" })).not.toBeInTheDocument();
});
it("does not nag when notifications were denied, while keeping manual settings available", async () => {
  vi.stubGlobal("Notification", { permission: "denied", requestPermission: vi.fn() });
  const view = render(<BrowserNotifications app="worker" prompt />);
  await waitFor(() =>
    expect(localStorage.getItem("shiftline-notification-setup-seen:worker")).toBe("complete"),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  view.unmount();
  render(<BrowserNotifications app="worker" feed />);
  expect(screen.getByRole("heading", { name: "Notification settings" })).toBeInTheDocument();
});
