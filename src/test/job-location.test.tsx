import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { JobAddressPicker } from "../components/app/JobAddressPicker";
import { ManagerJobBrief } from "../components/app/ManagerJobBrief";
import { JobPlanLocationForm } from "../components/app/JobPlanLocationForm";
const api = vi.hoisted(() => ({ command: vi.fn().mockResolvedValue({ snapshot: {} }) }));
vi.mock("../lib/app-store", () => ({
  useAttendance: () => ({
    me: "manager",
    today: "2026-10-13",
    shifts: [],
    sites: [],
    employees: [],
    busy: false,
    online: true,
    command: api.command,
  }),
}));
vi.mock("mapbox-gl", () => ({
  default: {
    Map: class {
      addControl() {}
      on() {}
      resize() {}
      remove() {}
      flyTo() {}
    },
    Marker: class {
      setLngLat() {
        return this;
      }
      addTo() {
        return this;
      }
      on() {}
      remove() {}
    },
    NavigationControl: class {},
  },
}));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("keeps manual coordinates expanded while both coordinates are entered", () => {
  vi.stubEnv("VITE_MAPBOX_ACCESS_TOKEN", "pk.test");
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  function Form() {
    const [value, setValue] = useState<{
      address: string;
      latitude: number | null;
      longitude: number | null;
    }>({ address: "", latitude: null, longitude: null });
    return <JobAddressPicker value={value} onChange={setValue} />;
  }
  render(<Form />);
  const details = screen.getByText("Advanced: enter confirmed coordinates").closest("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  fireEvent.change(screen.getByLabelText("latitude"), { target: { value: "-22.6" } });
  fireEvent.change(screen.getByLabelText("longitude"), { target: { value: "17.08" } });
  expect(details.open).toBe(true);
  expect(screen.getByLabelText("longitude")).toHaveValue(17.08);
});
it("creates general jobs without a required employee shift", () => {
  render(<ManagerJobBrief onSaved={vi.fn()} />);
  expect(screen.queryByText("Assigned shift")).not.toBeInTheDocument();
  expect(screen.getByText("Assigned employees (optional)")).toBeInTheDocument();
  expect(screen.getByLabelText("Job address or destination")).toBeInTheDocument();
});
it("updates an existing plan location without creating another job or an attendance shift", async () => {
  const onSaved = vi.fn();
  render(
    <JobPlanLocationForm
      plan={{
        id: "plan",
        date: "2026-10-14",
        title: "Stage setup",
        details: "Instructions",
        employeeIds: [],
        assignedNames: [],
      }}
      onSaved={onSaved}
    />,
  );
  fireEvent.change(screen.getByLabelText("Job address or destination"), {
    target: { value: "Confirmed venue" },
  });
  fireEvent.change(screen.getByLabelText("latitude"), { target: { value: "-22.6" } });
  fireEvent.change(screen.getByLabelText("longitude"), { target: { value: "17.08" } });
  fireEvent.click(screen.getByRole("button", { name: "Save job location" }));
  await waitFor(() =>
    expect(api.command).toHaveBeenCalledWith("update_job_plan_location", {
      id: "plan",
      address: "Confirmed venue",
      latitude: -22.6,
      longitude: 17.08,
      radiusM: 150,
      expected: { address: "", latitude: null, longitude: null, radiusM: 150 },
    }),
  );
  expect(onSaved).toHaveBeenCalled();
});
it("retrieves permanent address suggestions and fills the matching coordinates only on selection", async () => {
  vi.stubEnv("VITE_MAPBOX_ACCESS_TOKEN", "pk.test");
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      features: [
        {
          id: "address",
          geometry: { coordinates: [17.08, -22.6] },
          properties: { full_address: "Confirmed address" },
        },
      ],
    }),
  });
  vi.stubGlobal("fetch", fetch);
  const change = vi.fn();
  render(
    <JobAddressPicker
      value={{ address: "Street query", latitude: null, longitude: null }}
      onChange={change}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Confirmed address" }));
  expect(change).toHaveBeenCalledWith({
    address: "Confirmed address",
    longitude: 17.08,
    latitude: -22.6,
  });
  const url = new URL(fetch.mock.calls[0]![0]);
  expect(url.searchParams.get("permanent")).toBe("true");
  expect(url.searchParams.get("country")).toBe("na");
  expect(url.searchParams.get("types")).toBe("address,street,place,locality,neighborhood");
  expect(url.searchParams.get("proximity")).toBe("17.08,-22.57");
});
it("keeps unmatched venue coordinates empty rather than guessing a job destination", async () => {
  vi.stubEnv("VITE_MAPBOX_ACCESS_TOKEN", "pk.test");
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) }),
  );
  const change = vi.fn();
  render(
    <JobAddressPicker
      value={{ address: "Unlisted venue", latitude: null, longitude: null }}
      onChange={change}
    />,
  );
  await waitFor(() => expect(screen.getByText(/No address suggestions/)).toBeInTheDocument());
  expect(change).not.toHaveBeenCalled();
  expect(screen.getByLabelText("latitude")).toHaveValue(null);
});
