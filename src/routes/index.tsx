import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPin, Utensils, Briefcase, AlertTriangle, LogOut, Wifi, WifiOff } from "lucide-react";
import { useState } from "react";
import { EmployeeShell, DemoBanner, StatusPill } from "@/components/app/EmployeeShell";
import { DepartureSheet } from "@/components/app/DepartureSheet";
import { Button } from "@/components/ui/button";
import { useDemo, fmtTime, at } from "@/lib/demo-store";
import { STATE_LABEL, type EventType } from "@/lib/attendance";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today — Shiftline" },
      { name: "description", content: "Clock in, take lunch, go on jobs and see today's shift timeline." },
      { property: "og:title", content: "Today — Shiftline" },
      { property: "og:description", content: "Clock in, take lunch, go on jobs and see today's shift timeline." },
    ],
  }),
  component: Today,
});

const EVENT_LABEL: Record<EventType, string> = {
  clock_in: "Clocked in", start_lunch: "Started lunch", end_lunch: "Returned from lunch",
  start_job: "Left for job", end_job: "Back from job", start_personal: "Personal departure",
  end_personal: "Returned to work", clock_out: "Clocked out",
};

function Today() {
  const d = useDemo();
  const [sheet, setSheet] = useState(false);
  const me = d.employees.find((e) => e.id === d.me)!;
  const site = d.sites.find((s) => s.id === d.shift.siteId)!;
  const ev = (t: EventType) => d.myEvents.find((e) => e.type === t);
  const lunchStart = [...d.myEvents].reverse().find((e) => e.type === "start_lunch");
  const expectedReturn = lunchStart ? lunchStart.capturedAt + d.shift.lunchMinutes * 60000 : at(d.shift.lunch) + d.shift.lunchMinutes * 60000;
  const nextJob = d.jobs.filter((j) => j.assignee === d.me && j.status !== "completed").sort((a, b) => a.start.localeCompare(b.start))[0];
  const notice = d.notices[0];

  const primary: { label: string; type: EventType } | null = {
    not_clocked_in: { label: "Clock in", type: "clock_in" as EventType },
    working: { label: "Start lunch", type: "start_lunch" as EventType },
    on_lunch: { label: "End lunch", type: "end_lunch" as EventType },
    on_job: { label: "Back from job", type: "end_job" as EventType },
    on_personal: { label: "Return to work", type: "end_personal" as EventType },
    clocked_out: null,
  }[d.state];

  const onPrimary = () => {
    if (!primary) return;
    if (primary.type === "clock_in") {
      // Demo: simulate the permission explanation + geofence verification.
      if (!window.confirm("Location is used only while you're clocked in, to confirm you're at your work site. Allow location for this shift?")) {
        d.update((x) => ({ ...x, location: "unavailable" }));
      }
    }
    if (primary.type === "end_job" && d.myEvents.at(-1)?.jobId) {
      const jid = d.myEvents.at(-1)!.jobId!;
      d.update((x) => ({ ...x, jobs: x.jobs.map((j) => (j.id === jid ? { ...j, status: "completed" } : j)) }));
    }
    d.act(primary.type);
  };

  const locTone = { inactive: "muted", active: "ok", paused: "warn", unavailable: "bad" } as const;
  const stateTone = d.state === "working" || d.state === "on_job" ? "ok" : d.state === "not_clocked_in" || d.state === "clocked_out" ? "muted" : "warn";

  // Timeline rows: recorded events + scheduled items not yet passed.
  const recorded = d.myEvents.map((e) => ({ t: e.capturedAt, label: EVENT_LABEL[e.type], kind: "recorded" as const, sync: e.sync }));
  const scheduled = [
    { t: at(d.shift.start), label: "Shift starts", done: !!ev("clock_in") },
    { t: at(d.shift.lunch), label: `Lunch (${d.shift.lunchMinutes} min)`, done: !!ev("start_lunch") },
    ...(nextJob ? [{ t: at(nextJob.start), label: nextJob.title, done: nextJob.status !== "assigned" }] : []),
    { t: at(d.shift.end), label: "Shift ends", done: !!ev("clock_out") },
    { t: at(d.shift.trackingStop), label: "Location tracking stops", done: d.state === "clocked_out" },
  ].filter((s) => !s.done).map((s) => ({ t: s.t, label: s.label, kind: "scheduled" as const, sync: undefined }));
  const rows = [...recorded, ...scheduled].sort((a, b) => a.t - b.t);
  const now = Date.now();

  return (
    <EmployeeShell title="Today">
      <DemoBanner />
      <section className="card-surface p-5" aria-label="Attendance">
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h2 className="mt-1 text-2xl font-bold">{me.name}</h2>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" /> {site.name} · Shift {d.shift.start}–{d.shift.end}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <StatusPill tone={stateTone}>{STATE_LABEL[d.state]}</StatusPill>
          <StatusPill tone={locTone[d.location]}>Location {d.location}</StatusPill>
          <button
            onClick={() => d.update((x) => ({ ...x, online: !x.online, events: x.online ? x.events : x.events.map((e) => (e.sync === "waiting_to_sync" ? { ...e, sync: "synced", receivedAt: Date.now() } : e)) }))}
            aria-label={d.online ? "Online. Tap to simulate offline" : "Offline. Tap to reconnect and sync"}
          >
            <StatusPill tone={d.online ? "info" : "warn"}>
              {d.online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {d.online ? "Online" : "Offline"}
            </StatusPill>
          </button>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-tint-blue p-3">
            <dt className="text-xs text-muted-foreground">Clock in</dt>
            <dd className="mt-1 text-lg font-bold">{fmtTime(ev("clock_in")?.capturedAt)}</dd>
            <dd className="text-xs text-muted-foreground">Scheduled {d.shift.start}</dd>
          </div>
          <div className="rounded-2xl bg-tint-pink p-3">
            <dt className="text-xs text-muted-foreground">Clock out</dt>
            <dd className="mt-1 text-lg font-bold">{fmtTime(ev("clock_out")?.capturedAt)}</dd>
            <dd className="text-xs text-muted-foreground">Scheduled {d.shift.end}</dd>
          </div>
          <div className="rounded-2xl bg-tint-cream p-3">
            <dt className="text-xs text-muted-foreground">Lunch</dt>
            <dd className="mt-1 text-lg font-bold">{lunchStart ? fmtTime(lunchStart.capturedAt) : d.shift.lunch}</dd>
            <dd className="text-xs text-muted-foreground">{lunchStart ? "Recorded" : "Scheduled"} · back by {fmtTime(expectedReturn)}</dd>
          </div>
          <div className="rounded-2xl bg-muted p-3">
            <dt className="text-xs text-muted-foreground">Tracking stops</dt>
            <dd className="mt-1 text-lg font-bold">{d.shift.trackingStop}</dd>
            <dd className="text-xs text-muted-foreground">or at clock-out</dd>
          </div>
        </dl>

        {d.location === "unavailable" && d.state !== "not_clocked_in" && (
          <p className="mt-4 flex gap-2 rounded-2xl bg-tint-pink p-3 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            Location unavailable. Your attendance is still recorded; your manager may ask you to confirm.
          </p>
        )}

        <div className="mt-5 space-y-2">
          {primary ? (
            <Button variant="hero" size="xl" className="w-full" onClick={onPrimary}>
              {primary.type === "start_lunch" ? <Utensils /> : null}{primary.label}
            </Button>
          ) : (
            <p className="rounded-2xl bg-muted p-4 text-center text-sm">Shift finished. See you next shift.</p>
          )}
          {d.state === "working" && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="soft" size="xl" onClick={() => setSheet(true)}><Briefcase /> Leave / Go on a job</Button>
              <Button variant="pill" size="xl" onClick={() => d.act("clock_out")}><LogOut /> Clock out</Button>
            </div>
          )}
          {d.state === "on_job" && (
            <Button variant="pill" size="xl" className="w-full" onClick={() => d.act("clock_out")}><LogOut /> Clock out from job</Button>
          )}
        </div>
      </section>

      {notice && (
        <section className="rounded-3xl bg-tint-pink p-4 text-sm" aria-label="Notice">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Closure · {notice.date}</p>
          <p className="mt-1 font-bold">{notice.title}</p>
          <p className="mt-1">{notice.attendance} · {notice.paid}</p>
        </section>
      )}

      {nextJob && (
        <Link to="/jobs" className="block rounded-3xl bg-tint-blue p-4">
          <p className="text-xs text-muted-foreground">Upcoming job</p>
          <p className="mt-1 text-lg font-bold">{nextJob.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{nextJob.start}–{nextJob.end} · {nextJob.destination}</p>
        </Link>
      )}

      <section className="card-surface p-5" aria-label="Timeline">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Timeline</h2>
          <span className="flex gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />Recorded</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full border border-muted-foreground" />Scheduled</span>
          </span>
        </div>
        <ol className="mt-4 space-y-3">
          {rows.map((r, i) => {
            const isNowNext = r.t > now && (i === 0 || (rows[i - 1]?.t ?? 0) <= now);
            return (
              <li key={i}>
                {isNowNext && (
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-primary">
                    <span className="w-12 text-right">{fmtTime(now)}</span>
                    <span className="h-px flex-1 bg-primary" />
                  </div>
                )}
                <div className="flex items-stretch gap-3">
                  <span className="w-12 shrink-0 pt-3 text-right text-xs text-muted-foreground">{fmtTime(r.t)}</span>
                  <div
                    className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-2xl border-l-4 px-3 py-3 ${
                      r.kind === "recorded" ? "border-primary bg-primary-soft" : "border-dashed border-border bg-muted"
                    }`}
                  >
                    <span className="min-w-0 truncate text-sm font-semibold">{r.label}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {r.kind === "recorded" ? (r.sync === "synced" ? "Synced" : r.sync === "waiting_to_sync" ? "Waiting to sync" : r.sync === "needs_review" ? "Needs review" : "Saved on phone") : "Scheduled"}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
      <DepartureSheet open={sheet} onOpenChange={setSheet} />
    </EmployeeShell>
  );
}
