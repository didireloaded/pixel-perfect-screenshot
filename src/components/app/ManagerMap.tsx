import { useEffect, useRef, useState } from "react";
import type { Map as MapboxMap, Marker, GeoJSONSource } from "mapbox-gl";
import { geofencePolygon } from "../../../shared/geofence-polygon";
import { currentWorkday, workPositionAllowed } from "../../../shared/workday";
import { LocateFixed, MapPin, RefreshCw, Users, Briefcase, ShieldCheck } from "lucide-react";
import { useAttendance } from "@/lib/app-store";
import { STATE_LABEL } from "@/lib/attendance";
import "mapbox-gl/dist/mapbox-gl.css";
import "./manager-map.css";

type Point = {
  id: string;
  name: string;
  detail: string;
  lng: number;
  lat: number;
  kind: "site" | "job" | "worker";
  radiusM?: number | undefined;
  photoUrl?: string | undefined;
};
export function ManagerMap() {
  const d = useAttendance();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const boundsSet = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [filter, setFilter] = useState<"all" | "workplace" | "jobs">("all");
  const [sitesVisible, setSitesVisible] = useState(true);
  const [jobsVisible, setJobsVisible] = useState(true);
  const token = import.meta.env["VITE_MAPBOX_ACCESS_TOKEN"];
  const presence = d.sitePresence.filter(
    (p) =>
      p.latitude != null &&
      p.longitude != null &&
      now - Date.parse(p.checkedAt) < 180000 &&
      d.shifts.some((s) => s.id === p.shiftId && workPositionAllowed(s, d.company.timezone, now)) &&
      d.states.some((s) => s.shiftId === p.shiftId && ["working", "on_job"].includes(s.state)),
  );
  const workers = presence.filter(
    (p) => filter === "all" || (filter === "jobs" ? !!p.jobId : !p.jobId && p.inside),
  );
  const points: Point[] = [
    ...(sitesVisible
      ? d.sites
          .filter((s) => s.latitude != null && s.longitude != null)
          .map((s) => ({
            id: s.id,
            name: s.name,
            detail: `${s.address} · ${s.radiusM}m worksite boundary`,
            lng: s.longitude!,
            lat: s.latitude!,
            kind: "site" as const,
            radiusM: s.radiusM,
          }))
      : []),
    ...(jobsVisible
      ? d.jobs
          .filter(
            (j) =>
              (j.date === d.today || presence.some((p) => p.jobId === j.id)) &&
              j.status !== "completed" &&
              j.latitude != null &&
              j.longitude != null,
          )
          .map((j) => ({
            id: j.id,
            name: j.title,
            detail: `${j.destination} · ${j.start}–${j.end}`,
            lng: j.longitude!,
            lat: j.latitude!,
            kind: "job" as const,
            radiusM: j.radiusM,
          }))
      : []),
    ...(jobsVisible
      ? (d.calendarJobs ?? [])
          .filter(
            (plan) =>
              plan.date === d.today &&
              plan.latitude != null &&
              plan.longitude != null &&
              !d.jobs.some((job) => job.calendarJobId === plan.id && job.status !== "completed"),
          )
          .map((plan) => ({
            id: `plan:${plan.id}`,
            name: plan.title,
            detail: `${plan.address} · Planned job destination`,
            lng: plan.longitude!,
            lat: plan.latitude!,
            kind: "job" as const,
            radiusM: plan.radiusM ?? 150,
          }))
      : []),
    ...workers.map((p) => ({
      id: p.employeeId,
      name: d.employees.find((e) => e.id === p.employeeId)?.name || "Employee",
      detail: `${p.jobId ? d.jobs.find((j) => j.id === p.jobId)?.title || "On job" : p.inside ? "At workplace" : "Working off-site"} · ${p.inside ? "Inside boundary" : "Outside boundary"} · accuracy ±${Math.round(p.accuracyM ?? 0)}m · ${new Date(p.checkedAt).toLocaleTimeString()}`,
      lng: p.longitude!,
      lat: p.latitude!,
      kind: "worker" as const,
      photoUrl: d.employees.find((employee) => employee.id === p.employeeId)?.photoUrl,
    })),
  ];
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const workplace = d.sites.find((site) => site.latitude != null && site.longitude != null);
  const workplaceRef = useRef(workplace);
  workplaceRef.current = workplace;
  const focusWorkplace = () => {
    const site = workplaceRef.current;
    if (!map.current || !site) return;
    boundsSet.current = true;
    map.current.flyTo({ center: [site.longitude!, site.latitude!], zoom: 15, duration: 600 });
  };
  const fit = (workersOnly = false) => {
    const all = pointsRef.current.filter((point) => !workersOnly || point.kind === "worker");
    if (!map.current || !all.length) return;
    const lngs = all.map((p) => p.lng),
      lats = all.map((p) => p.lat);
    boundsSet.current = true;
    map.current.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 90, maxZoom: 16, duration: 600 },
    );
  };
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!container.current || !token) return;
    let disposed = false;
    let instance: MapboxMap | null = null;
    const activeMarkers = markers.current;
    void import("mapbox-gl")
      .then(({ default: mapboxgl }) => {
        if (disposed || !container.current) return;
        const first = workplaceRef.current;
        instance = new mapboxgl.Map({
          container: container.current,
          accessToken: token,
          style: "mapbox://styles/mapbox/light-v11",
          center: first ? [first.longitude!, first.latitude!] : [17.5, -22.5],
          zoom: first ? 15 : 5,
          projection: "mercator",
          maxBounds: [[11, -29.5], [26, -16.5]],
          renderWorldCopies: false,
          attributionControl: false,
        });
        map.current = instance;
        instance.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
        instance.on("load", () => {
          if (!disposed) {
            setReady(true);
            setError("");
            focusWorkplace();
          }
        });
        instance.on("error", () => {
          if (!disposed)
            setError("The map could not load. Check the connection and Mapbox token permissions.");
        });
      })
      .catch(() => {
        if (!disposed) setError("The map could not start. Try refreshing this page.");
      });
    return () => {
      disposed = true;
      setReady(false);
      activeMarkers.forEach((m) => m.remove());
      activeMarkers.clear();
      instance?.remove();
      map.current = null;
      boundsSet.current = false;
    };
  }, [token]);
  useEffect(() => {
    if (!ready || !container.current || !map.current) return;
    const observer = new ResizeObserver(() => map.current?.resize());
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [ready]);
  const pointsKey = JSON.stringify(points);
  useEffect(() => {
    if (!ready || !map.current) return;
    let disposed = false;
    void import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (disposed || !map.current) return;
      const boundaries = {
        type: "FeatureCollection" as const,
        features: pointsRef.current
          .filter((point) => point.radiusM && point.kind !== "worker")
          .map((point) => ({
            type: "Feature" as const,
            properties: { name: point.name },
            geometry: {
              type: "Polygon" as const,
              coordinates: [geofencePolygon(point.lat, point.lng, point.radiusM!)],
            },
          })),
      };
      const source = map.current.getSource("work-boundaries") as GeoJSONSource | undefined;
      if (source) source.setData(boundaries);
      else {
        map.current.addSource("work-boundaries", { type: "geojson", data: boundaries });
        map.current.addLayer({
          id: "work-boundary-fill",
          type: "fill",
          source: "work-boundaries",
          paint: { "fill-color": "#6d4aff", "fill-opacity": 0.08 },
        });
        map.current.addLayer({
          id: "work-boundary-line",
          type: "line",
          source: "work-boundaries",
          paint: { "line-color": "#6d4aff", "line-width": 2, "line-dasharray": [3, 2] },
        });
      }
      const ids = new Set(pointsRef.current.map((p) => `${p.kind}:${p.id}`));
      markers.current.forEach((marker, id) => {
        if (!ids.has(id)) {
          marker.remove();
          markers.current.delete(id);
        }
      });
      pointsRef.current.forEach((p) => {
        const id = `${p.kind}:${p.id}`;
        let existing = markers.current.get(id);
        if (existing && existing.getElement().dataset["photoUrl"] !== (p.photoUrl ?? "")) {
          existing.remove();
          markers.current.delete(id);
          existing = undefined;
        }
        if (existing) {
          existing.getElement().setAttribute("aria-label", p.name);
          existing.setLngLat([p.lng, p.lat]);
          const info = document.createElement("div");
          const title = document.createElement("strong");
          title.textContent = p.name;
          const detail = document.createElement("p");
          detail.textContent = p.detail;
          info.append(title, detail);
          existing.getPopup()?.setDOMContent(info);
          return;
        }
        const button = document.createElement("button");
        button.dataset["photoUrl"] = p.photoUrl ?? "";
        button.type = "button";
        button.className = `sl-map-marker ${p.kind}`;
        button.setAttribute("aria-label", p.name);
        button.textContent =
          p.kind === "worker"
            ? p.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")
            : p.kind === "job"
              ? "J"
              : "W";
        if (p.kind === "worker" && p.photoUrl) {
          const image = document.createElement("img");
          image.src = p.photoUrl;
          image.alt = p.name;
          image.referrerPolicy = "no-referrer";
          button.style.position = "relative";
          image.style.cssText =
            "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%";
          image.onerror = () => image.remove();
          button.append(image);
        }
        const info = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = p.name;
        const detail = document.createElement("p");
        detail.textContent = p.detail;
        info.append(title, detail);
        const marker = new mapboxgl.Marker({ element: button })
          .setLngLat([p.lng, p.lat])
          .setPopup(new mapboxgl.Popup({ offset: 24 }).setDOMContent(info))
          .addTo(map.current!);
        markers.current.set(id, marker);
      });
      if (!boundsSet.current && workplaceRef.current) focusWorkplace();
    });
    return () => {
      disposed = true;
    };
  }, [ready, pointsKey]);
  return (
    <section className="sl-map-page">
      <header>
        <div>
          <p className="project-panel-kicker">
            <MapPin size={16} /> LIVE WORKSPACE
          </p>
          <h2>Team locations</h2>
          <p className="project-panel-sub">
            {presence.length} sharing now · {d.sites.length}{" "}
            {d.sites.length === 1 ? "workplace" : "workplaces"} · positions expire after 3 minutes
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <span className="rounded-full bg-[#e7f7ef] px-3 py-2">
              {
                d.states.filter(
                  (state) =>
                    ["working", "on_job"].includes(state.state) &&
                    d.shifts.some(
                      (shift) =>
                        shift.id === state.shiftId &&
                        shift.date <= d.today &&
                        (shift.finishDate ?? shift.date) >= d.today,
                    ),
                ).length
              }{" "}
              working
            </span>
            <span className="rounded-full bg-[#fff4dc] px-3 py-2">
              {
                d.states.filter(
                  (state) =>
                    state.state === "on_lunch" &&
                    d.shifts.some(
                      (shift) =>
                        shift.id === state.shiftId &&
                        shift.date <= d.today &&
                        (shift.finishDate ?? shift.date) >= d.today,
                    ),
                ).length
              }{" "}
              on lunch · location hidden
            </span>
            <span className="rounded-full bg-muted px-3 py-2">
              {presence.length} current positions
            </span>
          </div>
        </div>
        <button
          className="sl-map-tool"
          disabled={d.busy || !d.online}
          onClick={() => void d.refresh()}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </header>
      <div className="sl-map-stage">
        <div
          ref={container}
          className="sl-map-canvas"
          aria-label="Map of current on-duty employee locations"
        />
        {!workplace && (
          <div className="sl-map-error" role="status">
            Showing Namibia. Set your workplace's confirmed coordinates in company settings to
            open the map at your office. An address alone does not establish a geofence.
            {d.employees.find((employee) => employee.id === d.me)?.accessRole === "owner" && (
              <a href="/manager?tab=Settings" className="block mt-2 underline">Open company settings</a>
            )}
          </div>
        )}
        {(!token || error) && (
          <div className="sl-map-error" role="alert">
            {error || "Add VITE_MAPBOX_ACCESS_TOKEN to enable the map."}
          </div>
        )}
        <div className="sl-map-legend">
          <span className="site" /> Workplace <span className="job" /> Job site{" "}
          <span className="worker" /> Employee
        </div>
      </div>
      <div className="sl-map-controls">
        <button className="sl-map-tool" onClick={focusWorkplace} disabled={!ready || !workplace}>
          <MapPin size={16} /> Workplace
        </button>
        <button className="sl-map-tool" aria-label="Zoom in" onClick={() => map.current?.zoomIn()} disabled={!ready}>+</button>
        <button className="sl-map-tool" aria-label="Zoom out" onClick={() => map.current?.zoomOut()} disabled={!ready}>−</button>
        <button className="sl-map-tool" onClick={() => fit()} disabled={!ready}>
          <LocateFixed size={16} /> Fit all
        </button>
        <button
          className="sl-map-tool"
          onClick={() => fit(true)}
          disabled={!ready || !workers.length}
        >
          <Users size={16} /> Fit workers
        </button>
        {(["all", "workplace", "jobs"] as const).map((value) => (
          <button
            key={value}
            className={`sl-map-tool ${filter === value ? "selected" : ""}`}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === "all" ? (
              <Users size={16} />
            ) : value === "jobs" ? (
              <Briefcase size={16} />
            ) : (
              <MapPin size={16} />
            )}
            {value === "all" ? "All workers" : value === "jobs" ? "On jobs" : "At workplace"}
          </button>
        ))}
        <button
          className="sl-map-tool"
          aria-pressed={sitesVisible}
          onClick={() => setSitesVisible(!sitesVisible)}
        >
          Workplaces {sitesVisible ? "on" : "off"}
        </button>
        <button
          className="sl-map-tool"
          aria-pressed={jobsVisible}
          onClick={() => setJobsVisible(!jobsVisible)}
        >
          Job sites {jobsVisible ? "on" : "off"}
        </button>
      </div>
      <div className="sl-map-team">
        {d.employees
          .filter((e) => e.role === "employee" && e.accessStatus !== "rejected")
          .map((e) => {
            const shift = currentWorkday(d, e.id);
            const state = d.states.find((s) => s.shiftId === shift?.id)?.state;
            const current = presence.find((p) => p.employeeId === e.id);
            return (
              <button
                key={e.id}
                className="sl-map-worker"
                disabled={!current}
                onClick={() => {
                  if (current)
                    map.current?.flyTo({
                      center: [current.longitude!, current.latitude!],
                      zoom: 17,
                    });
                }}
              >
                <span className={`sl-map-avatar ${current ? "sharing" : ""}`}>
                  {e.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <span>
                  <b>{e.name}</b>
                  <small>
                    {current
                      ? current.jobId
                        ? "On job · live"
                        : current.inside
                          ? "At workplace · live"
                          : "Working off-site · live"
                      : state === "working" || state === "on_job"
                        ? shift && !workPositionAllowed(shift, d.company.timezone, now)
                          ? "Tracking ended · clock-out pending"
                          : "No recent GPS · worker must enable sharing and keep app open"
                        : state
                          ? STATE_LABEL[state]
                          : "Off duty"}
                  </small>
                </span>
              </button>
            );
          })}
        {!d.employees.some((e) => e.role === "employee") && <p>No employees registered yet.</p>}
      </div>
      <footer>
        <ShieldCheck size={15} /> Lunch, personal time and off-duty locations are hidden. Web
        sharing requires the worker app to remain visible and connected.
      </footer>
    </section>
  );
}
