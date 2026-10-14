import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BrowserNotifications } from "../../shared/BrowserNotifications";
const { notifications } = vi.hoisted(() => ({ notifications: vi.fn().mockResolvedValue([]) }));
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
vi.mock("../../shared/backend", () => ({ createBackend: () => ({ notifications }) }));
beforeEach(() => {
  notifications.mockReset().mockResolvedValue([]);
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
          getSubscription: vi.fn().mockResolvedValue({
            endpoint: "existing-device",
            toJSON: () => ({
              endpoint: "existing-device",
              keys: { p256dh: "key", auth: "secret" },
            }),
          }),
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
  expect(notifications).toHaveBeenCalledWith("subscribe", {
    endpoint: "existing-device",
    p256dh: "key",
    auth: "secret",
    app: "worker",
  });
});
it("does not consume the one-time setup prompt when opening manual settings", async () => {
  vi.stubGlobal("navigator", {
    serviceWorker: {
      register: vi.fn().mockResolvedValue({
        pushManager: { getSubscription: vi.fn().mockResolvedValue(null) },
      }),
    },
  });
  const view = render(<BrowserNotifications app="worker" />);
  await waitFor(() => expect(navigator.serviceWorker.register).toHaveBeenCalled());
  expect(localStorage.getItem("shiftline-notification-setup-seen:worker")).toBeNull();
  view.unmount();
  render(<BrowserNotifications app="worker" prompt />);
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
});
it("revokes browser delivery even when disabling cannot reach the server", async () => {
  const unsubscribe = vi.fn().mockResolvedValue(true);
  const subscription = {
    endpoint: "current-device",
    unsubscribe,
    toJSON: () => ({ endpoint: "current-device", keys: { p256dh: "key", auth: "secret" } }),
  };
  const registration = {
    pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) },
  };
  vi.stubGlobal("navigator", {
    serviceWorker: {
      register: vi.fn().mockResolvedValue(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    },
  });
  render(<BrowserNotifications app="worker" />);
  const disable = await screen.findByRole("button", { name: "Disable phone notifications" });
  notifications.mockRejectedValue(new Error("Failed to fetch"));
  fireEvent.click(disable);
  expect(
    await screen.findByText("Could not complete notification cleanup. Try again when connected."),
  ).toBeInTheDocument();
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Enable phone notifications" })).toBeInTheDocument();
});
it("revokes a previous account's subscription instead of claiming delivery is enabled", async () => {
  const unsubscribe = vi.fn().mockResolvedValue(true);
  notifications.mockRejectedValue(new Error("Subscription belongs to another account"));
  vi.stubGlobal("navigator", {
    serviceWorker: {
      register: vi.fn().mockResolvedValue({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue({
            endpoint: "old-account",
            unsubscribe,
            toJSON: () => ({ endpoint: "old-account", keys: { p256dh: "key", auth: "secret" } }),
          }),
        },
      }),
    },
  });
  render(<BrowserNotifications app="worker" />);
  expect(
    await screen.findByText("Enable phone notifications for your current account."),
  ).toBeInTheDocument();
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(screen.queryByText("Disable phone notifications")).not.toBeInTheDocument();
  expect(Notification.requestPermission).not.toHaveBeenCalled();
});
it("does not claim phone delivery is enabled or discard the subscription when verification is offline", async () => {
  const unsubscribe = vi.fn();
  notifications.mockRejectedValue(new Error("Failed to fetch"));
  vi.stubGlobal("navigator", {
    serviceWorker: {
      register: vi.fn().mockResolvedValue({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue({
            endpoint: "current-device",
            unsubscribe,
            toJSON: () => ({ endpoint: "current-device", keys: { p256dh: "key", auth: "secret" } }),
          }),
        },
      }),
    },
  });
  render(<BrowserNotifications app="manager" />);
  expect(
    await screen.findByText(
      "Could not verify phone notifications. Reconnect and enable them again.",
    ),
  ).toBeInTheDocument();
  expect(unsubscribe).not.toHaveBeenCalled();
  expect(screen.queryByText("Disable phone notifications")).not.toBeInTheDocument();
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
it("rechecks an unverified subscription after reconnection without requesting permission", async () => {
  const subscription = {
    endpoint: "current-device",
    toJSON: () => ({ endpoint: "current-device", keys: { p256dh: "key", auth: "secret" } }),
  };
  vi.stubGlobal("navigator", {
    onLine: true,
    serviceWorker: {
      register: vi.fn().mockResolvedValue({
        pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) },
      }),
    },
  });
  notifications.mockRejectedValueOnce(new Error("Failed to fetch"));
  render(<BrowserNotifications app="worker" />);
  await screen.findByText("Could not verify phone notifications. Reconnect and enable them again.");
  notifications.mockResolvedValue({ ok: true });
  fireEvent(window, new Event("online"));
  expect(
    await screen.findByRole("button", { name: "Disable phone notifications" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByText("Could not verify phone notifications. Reconnect and enable them again."),
  ).not.toBeInTheDocument();
  expect(Notification.requestPermission).not.toHaveBeenCalled();
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
it("discards a pre-read list response without blocking later polls", async () => {
  const unread = {
    id: "message-1",
    title: "New work message",
    destination: "messages",
    created_at: "2026-10-14T08:00:00Z",
    read_at: null,
  };
  let poll: () => void = () => {};
  const originalInterval = globalThis.setInterval;
  vi.spyOn(globalThis, "setInterval").mockImplementation((callback, delay) => {
    if (delay === 15000 && typeof callback === "function") {
      poll = callback;
      return 1 as unknown as ReturnType<typeof setInterval>;
    }
    return originalInterval(callback, delay);
  });
  let finishStale: (rows: unknown[]) => void = () => {};
  let count = 0;
  notifications.mockImplementation((action: string) => {
    if (action !== "list") return Promise.resolve({ ok: true });
    count += 1;
    if (count === 2)
      return new Promise((resolve) => {
        finishStale = resolve;
      });
    return Promise.resolve(
      count === 1
        ? [unread]
        : [{ ...unread, read_at: "2026-10-14T09:00:00Z", title: "Freshly polled update" }],
    );
  });
  render(<BrowserNotifications app="worker" feed />);
  fireEvent.click(await screen.findByRole("button", { name: "Mark read" }));
  // Start another list before the read completes, as a timer can do.
  await act(async () => {
    poll();
  });
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Mark read" })).not.toBeInTheDocument(),
  );
  await act(async () => {
    finishStale([unread]);
  });
  expect(screen.queryByRole("button", { name: "Mark read" })).not.toBeInTheDocument();
  await act(async () => {
    poll();
  });
  expect(await screen.findByText("Freshly polled update")).toBeInTheDocument();
});
it("does not continue enabling delivery after the account screen unmounts", async () => {
  let permission: (value: string) => void = () => {};
  vi.stubGlobal("Notification", {
    permission: "default",
    requestPermission: vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          permission = resolve;
        }),
    ),
  });
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("navigator", {
    serviceWorker: {
      register: vi.fn().mockResolvedValue({
        pushManager: { getSubscription: vi.fn().mockResolvedValue(null) },
      }),
    },
  });
  const view = render(<BrowserNotifications app="worker" />);
  fireEvent.click(screen.getByRole("button", { name: "Enable phone notifications" }));
  view.unmount();
  await act(async () => {
    permission("granted");
  });
  expect(notifications).not.toHaveBeenCalled();
});
