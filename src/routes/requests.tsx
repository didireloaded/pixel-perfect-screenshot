import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Clock3, ChevronRight, ArrowLeft, Inbox } from "lucide-react";
import { useState, type FormEvent } from "react";
import { EmployeeShell, ConnectionBanner, StatusPill } from "@/components/app/EmployeeShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAttendance } from "@/lib/app-store";

export const Route = createFileRoute("/requests")({ component: Requests });
type Mode = "leave" | "clocking" | null;

function Requests() {
  const d = useAttendance();
  const [mode, setMode] = useState<Mode>(null);
  const [shiftId, setShiftId] = useState("");
  const [eventId, setEventId] = useState("");
  const requests = d.requests.filter((r) => r.employeeId === d.me);
  const corrections = d.corrections.filter((c) => c.employee_id === d.me);
  const shifts = d.shifts.filter((s) => s.employeeId === d.me);
  const events = d.events.filter((e) => e.employeeId === d.me && e.shiftId === shiftId);

  async function submitLeave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fields = new FormData(form);
    const result = await d.command("create_request", {
      kind: "leave",
      summary: String(fields.get("summary") || "").trim(),
      detail: String(fields.get("detail") || "").trim(),
    });
    if (result) {
      form.reset();
      setMode(null);
    }
  }

  async function submitCorrection(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fields = new FormData(form);
    const localTime = String(fields.get("replacementAt") || "");
    const replacementAt = new Date(localTime).toISOString();
    const result = await d.command("request_correction", {
      shiftId,
      eventId,
      eventType: String(fields.get("eventType") || "clock_in"),
      replacementAt,
      reason: String(fields.get("reason") || "").trim(),
    });
    if (result) {
      form.reset();
      setMode(null);
    }
  }

  return (
    <EmployeeShell title="Requests">
      <ConnectionBanner />
      <section className="px-1">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Your workday
        </p>
        <h2 className="mt-1 text-2xl font-bold">How can we help?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Send a request and follow its progress here.
        </p>
      </section>

      {!mode ? (
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => setMode("leave")}
            className="card-surface flex w-full items-center gap-4 p-4 text-left transition-transform active:scale-[0.99]"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-tint-pink text-primary">
              <CalendarDays className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">Request leave</span>
              <span className="block text-xs text-muted-foreground">
                Time off, holidays or an absence
              </span>
            </span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => setMode("clocking")}
            className="card-surface flex w-full items-center gap-4 p-4 text-left transition-transform active:scale-[0.99]"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-tint-blue text-primary">
              <Clock3 className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">Fix a clocking</span>
              <span className="block text-xs text-muted-foreground">
                Missing or incorrect attendance time
              </span>
            </span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
      ) : (
        <section className="card-surface p-5">
          <button
            type="button"
            onClick={() => setMode(null)}
            className="mb-4 flex items-center gap-2 text-sm font-semibold text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> All requests
          </button>
          {mode === "leave" ? (
            <form onSubmit={submitLeave} className="space-y-4">
              <div>
                <h2 className="text-lg font-bold">Request leave</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tell your manager when you need time away.
                </p>
              </div>
              <label className="block text-sm font-medium">
                Dates or short summary
                <Input
                  name="summary"
                  required
                  maxLength={200}
                  placeholder="e.g. Annual leave · 12 October"
                  className="mt-2 h-12 rounded-2xl bg-muted"
                />
              </label>
              <label className="block text-sm font-medium">
                Details
                <Input
                  name="detail"
                  maxLength={1000}
                  placeholder="Anything your manager should know"
                  className="mt-2 h-12 rounded-2xl bg-muted"
                />
              </label>
              <Button variant="hero" size="xl" className="w-full" disabled={d.busy || !d.online}>
                {d.busy ? "Sending…" : "Send request"}
              </Button>
            </form>
          ) : (
            <form onSubmit={submitCorrection} className="space-y-4">
              <div>
                <h2 className="text-lg font-bold">Fix a clocking</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your original record stays visible while managers review the change.
                </p>
              </div>
              {shifts.length ? (
                <>
                  <label className="block text-sm font-medium">
                    Shift
                    <select
                      name="shiftId"
                      required
                      value={shiftId}
                      onChange={(e) => {
                        setShiftId(e.target.value);
                        setEventId("");
                      }}
                      className="mt-2 h-12 w-full rounded-2xl bg-muted px-3"
                    >
                      <option value="">Choose a shift</option>
                      {shifts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.date} · {s.start}–{s.end}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium">
                    What needs fixing?
                    <select
                      name="eventId"
                      value={eventId}
                      onChange={(e) => setEventId(e.target.value)}
                      className="mt-2 h-12 w-full rounded-2xl bg-muted px-3"
                    >
                      <option value="">A missing clocking</option>
                      {events.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.type.replaceAll("_", " ")} ·{" "}
                          {new Date(e.capturedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!eventId && (
                    <label className="block text-sm font-medium">
                      Action
                      <select
                        name="eventType"
                        className="mt-2 h-12 w-full rounded-2xl bg-muted px-3"
                      >
                        <option value="clock_in">Clock in</option>
                        <option value="clock_out">Clock out</option>
                        <option value="start_lunch">Start lunch</option>
                        <option value="end_lunch">End lunch</option>
                      </select>
                    </label>
                  )}
                  <label className="block text-sm font-medium">
                    Correct date and time
                    <Input
                      name="replacementAt"
                      type="datetime-local"
                      required
                      className="mt-2 h-12 rounded-2xl bg-muted"
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Why does this need changing?
                    <Input
                      name="reason"
                      required
                      maxLength={200}
                      placeholder="A short explanation"
                      className="mt-2 h-12 rounded-2xl bg-muted"
                    />
                  </label>
                  <Button
                    variant="hero"
                    size="xl"
                    className="w-full"
                    disabled={d.busy || !d.online || !shiftId}
                  >
                    {d.busy ? "Sending…" : "Send for review"}
                  </Button>
                </>
              ) : (
                <p className="rounded-2xl bg-tint-cream p-4 text-sm">
                  There are no assigned shifts to correct yet.
                </p>
              )}
            </form>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="px-1 text-lg font-bold">Your requests</h2>
        {!requests.length && !corrections.length && (
          <div className="card-surface flex items-center gap-3 p-5 text-sm text-muted-foreground">
            <Inbox className="h-5 w-5" /> No requests yet.
          </div>
        )}
        {corrections.map((c) => (
          <article key={c.id} className="card-surface p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold">Clocking change</h3>
              <StatusPill
                tone={c.status === "approved" ? "ok" : c.status === "declined" ? "bad" : "warn"}
              >
                {c.status.replaceAll("_", " ")}
              </StatusPill>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {c.event_type.replaceAll("_", " ")} ·{" "}
              {new Date(c.replacement_value.capturedAt).toLocaleString()}
            </p>
            <p className="mt-2 text-sm">{c.reason}</p>
          </article>
        ))}
        {requests.map((r) => (
          <article key={r.id} className="card-surface p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {new Date(r.submittedAt).toLocaleDateString()}
              </p>
              <StatusPill
                tone={r.status === "approved" ? "ok" : r.status === "declined" ? "bad" : "warn"}
              >
                {r.status}
              </StatusPill>
            </div>
            <h3 className="mt-3 font-bold">{r.summary}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{r.detail}</p>
            {r.reviewer && (
              <p className="mt-3 rounded-2xl bg-muted p-3 text-sm">
                {r.reviewer}: {r.reason}
              </p>
            )}
          </article>
        ))}
      </section>
    </EmployeeShell>
  );
}
