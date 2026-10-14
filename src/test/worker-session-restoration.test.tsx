import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "../../worker-ui/src/state";
import { Splash } from "../../worker-ui/src/screens/Auth";
const backend = vi.hoisted(() => ({
  hasSession: vi.fn(),
  snapshot: vi.fn(),
  onAuthChange: vi.fn(),
}));
vi.mock("../../worker-ui/src/backend", () => backend);
let auth: (event: string, id: string | null) => void;
function View() {
  const app = useApp();
  return app.phase === "splash" ? <Splash /> : <p>{app.phase}</p>;
}
beforeEach(() => {
  vi.resetAllMocks();
  backend.hasSession.mockResolvedValue(true);
  backend.onAuthChange.mockImplementation((cb) => {
    auth = cb;
    return () => {};
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("waits beyond the old splash deadline for a saved session", async () => {
  vi.useFakeTimers();
  let finish: (data: object) => void = () => {};
  backend.snapshot.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <AppProvider>
      <View />
    </AppProvider>,
  );
  await act(async () => {});
  await act(async () => {
    vi.advanceTimersByTime(2000);
  });
  expect(screen.queryByText("welcome")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Opening Shiftline…");
  await act(async () => {
    finish({ onboarding: false });
  });
  expect(screen.getByText("app")).toBeInTheDocument();
});
it("retries failed restoration and restores again after remount without credentials", async () => {
  backend.snapshot
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue({ onboarding: false });
  const view = render(
    <AppProvider>
      <View />
    </AppProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Retry connection" }));
  await screen.findByText("app");
  view.unmount();
  render(
    <AppProvider>
      <View />
    </AppProvider>,
  );
  await screen.findByText("app");
  await act(async () => auth("SIGNED_OUT", null));
  expect(screen.getByText("welcome")).toBeInTheDocument();
});
