import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ManagerMap } from "../components/app/ManagerMap";
const mocks = vi.hoisted(() => ({
  options: vi.fn(),
  fly: vi.fn(),
  remove: vi.fn(),
  data: {} as Record<string, unknown>,
}));
vi.mock("../lib/app-store", () => ({ useAttendance: () => mocks.data }));
vi.mock("mapbox-gl", () => ({
  default: {
    Map: class {
      constructor(options: unknown) {
        mocks.options(options);
      }
      addControl() {}
      on(name: string, callback: () => void) {
        if (name === "load") queueMicrotask(callback);
      }
      flyTo = mocks.fly;
      remove = mocks.remove;
      resize() {}
      getSource() {
        return { setData() {} };
      }
    },
    AttributionControl: class {},
    Marker: class {
      setLngLat() {
        return this;
      }
      setPopup() {
        return this;
      }
      addTo() {
        return this;
      }
      remove() {}
    },
    Popup: class {
      setDOMContent() {
        return this;
      }
    },
  },
}));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function setup(sites: unknown[]) {
  vi.stubEnv("VITE_MAPBOX_ACCESS_TOKEN", "test-token");
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  mocks.data = {
    sites,
    company: { timezone: "Africa/Windhoek" },
    sitePresence: [],
    jobs: [],
    calendarJobs: [],
    employees: [],
    shifts: [],
    states: [],
  };
}
it("starts in Namibia when the office has no coordinates, with a setup explanation", async () => {
  setup([{ id: "office", name: "Office", latitude: null, longitude: null }]);
  render(<ManagerMap />);
  await waitFor(() => expect(mocks.options).toHaveBeenCalled());
  expect(mocks.options.mock.calls[0]![0]).toMatchObject({
    center: [17.5, -22.5],
    zoom: 5,
    projection: "mercator",
    renderWorldCopies: false,
  });
  expect(screen.getByText(/An address alone/)).toBeInTheDocument();
  expect(mocks.fly).not.toHaveBeenCalled();
});
it("opens at the workplace and recentres when coordinates arrive after loading", async () => {
  setup([]);
  const { rerender } = render(<ManagerMap />);
  await waitFor(() => expect(mocks.options).toHaveBeenCalled());
  mocks.data = {
    ...mocks.data,
    sites: [{ id: "office", name: "Office", latitude: -22.5, longitude: 17.1, radiusM: 150 }],
  };
  rerender(<ManagerMap />);
  await waitFor(() =>
    expect(mocks.fly).toHaveBeenCalledWith(
      expect.objectContaining({ center: [17.1, -22.5], zoom: 15 }),
    ),
  );
  expect(mocks.options).toHaveBeenCalledTimes(1);
});
