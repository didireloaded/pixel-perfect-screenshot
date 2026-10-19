import { useEffect, useState } from "react";
import { useAttendance } from "@/lib/app-store";
import { punctuality } from "@/lib/backend";
import type { PunctualityData } from "../../../shared/attendance";
import { Button } from "@/components/ui/button";

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function PunctualitySettings() {
  const d = useAttendance();
  if (d.accessRole && d.accessRole !== "owner") return null;
  return <PunctualitySettingsForm key={d.company.id} />;
}

function PunctualitySettingsForm() {
  const d = useAttendance();
  const [policy, setPolicy] = useState<PunctualityData["policy"]>(null);
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [days, setDays] = useState([1, 2, 3, 4, 5]);
  const [employees, setEmployees] = useState<string[]>([]);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState(d.company.checkinCloseTime ?? "17:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void punctuality("list")
      .then((result) => {
        if (cancelled) return;
        setPolicy(result.policy);
        if (result.policy) {
          setEnabled(result.policy.enabled);
          setDays(result.policy.weekdays);
          setStart(result.policy.start);
          setEnd(result.policy.end);
          setEmployees(result.policy.employeeIds);
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled)
          setError("Could not load attendance reminder settings. Reopen Settings to retry.");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const staff = d.employees.filter(
    (e) => e.role === "employee" && e.activated && (e.accessStatus ?? "active") === "active",
  );
  return (
    <section className="card-surface p-5 space-y-4">
      <h2 className="font-bold">Expected hours and late reminders</h2>
      <p className="text-sm text-muted-foreground">
        Select employees expected to follow normal company hours. Reminders arrive at 5 and 20
        minutes without a recorded check-in. Approved leave and overlapping overnight work are
        excluded. This does not change hours or pay.
      </p>
      {policy && (
        <p className="text-sm">
          Latest saved rule: {policy.enabled ? "On" : "Off"}, effective {policy.startsOn} (
          {d.company.timezone}).
        </p>
      )}
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = await punctuality("configure", {
              enabled,
              weekdays: days,
              employeeIds: employees.filter((id) => staff.some((e) => e.id === id)),
              start,
              end,
            });
            setPolicy(result.policy);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not save reminders.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={!loaded || busy} className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Enable check-in reminders
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              Expected start
              <input
                aria-label="Expected start"
                className="field-input w-full"
                type="time"
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Normal finish
              <input
                aria-label="Normal finish"
                className="field-input w-full"
                type="time"
                required
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Expected working days</legend>
            <div className="flex flex-wrap gap-3">
              {weekdays.map((label, i) => (
                <label key={label} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={days.includes(i + 1)}
                    onChange={(e) =>
                      setDays(
                        e.target.checked ? [...days, i + 1] : days.filter((day) => day !== i + 1),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Employees following these hours</legend>
            <div className="max-h-60 space-y-2 overflow-y-auto">
              {staff.map((e) => (
                <label key={e.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={employees.includes(e.id)}
                    onChange={(event) =>
                      setEmployees(
                        event.target.checked
                          ? [...employees, e.id]
                          : employees.filter((id) => id !== e.id),
                      )
                    }
                  />
                  {e.name}
                </label>
              ))}
            </div>
            {!staff.length && (
              <p className="text-sm text-muted-foreground">
                Approve employees before enabling this rule.
              </p>
            )}
          </fieldset>
          <Button
            type="submit"
            disabled={
              !d.online ||
              days.length === 0 ||
              end <= start ||
              (enabled && !employees.some((id) => staff.some((e) => e.id === id)))
            }
          >
            {busy ? "Saving…" : "Save rule for tomorrow"}
          </Button>
        </fieldset>
      </form>
      <p className="text-xs text-muted-foreground">
        Changes start tomorrow and preserve earlier records. Newly approved or flexible staff are
        not included automatically. Company timezone: {d.company.timezone}.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

export function PunctualityHistory() {
  const d = useAttendance();
  const [date, setDate] = useState(d.today);
  const [records, setRecords] = useState<PunctualityData["records"]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setRecords([]);
    setLoaded(false);
    setError("");
    const load = async () => {
      if (document.hidden) return;
      try {
        const result = await punctuality("list", { date });
        if (!cancelled) {
          setRecords(result.records);
          setLoaded(true);
          setError("");
        }
      } catch {
        if (!cancelled)
          setError("Could not load punctuality records. Reconnect or select the date again.");
      }
    };
    void load();
    const timer = setInterval(() => void load(), 30000);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [date, d.company.id]);
  const time = (value: string) =>
    new Date(value).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: d.company.timezone,
    });
  return (
    <section className="project-panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2>Arrival and check-in history</h2>
        <label className="text-sm">
          Date{" "}
          <input
            aria-label="Punctuality date"
            type="date"
            value={date}
            max={d.today}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
          />
        </label>
      </div>
      <p className="text-sm text-muted-foreground">
        No check-in recorded is not confirmed absence. Late arrival uses accepted clock-in evidence
        and approved corrections, not GPS or an estimated timer.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!loaded && !error && <p className="text-sm">Loading arrival records…</p>}
      {loaded && records.length === 0 && (
        <p className="project-empty">
          No expected arrivals for this date. The owner can configure company hours and
          participating employees in Settings.
        </p>
      )}
      <div className="space-y-3">
        {records.map((row) => (
          <article key={row.id} className="rounded-xl border border-border p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <strong>
                {d.employees.find((e) => e.id === row.employeeId)?.name ?? "Employee"}
              </strong>
              <span>
                {row.status === "late"
                  ? `${Math.floor((row.lateSeconds ?? 0) / 60)}m ${(row.lateSeconds ?? 0) % 60}s late`
                  : (
                      {
                        expected: "Expected",
                        no_checkin: "No check-in recorded",
                        on_time: "On time",
                        excused: "Not expected at normal start",
                      } as Record<string, string>
                    )[row.status]}
              </span>
            </div>
            <p className="text-muted-foreground">
              Expected {time(row.expectedAt)} · Clock-in {row.clockInAt ? time(row.clockInAt) : "—"}
            </p>
            {row.originalClockInAt && row.clockInAt !== row.originalClockInAt && (
              <p className="text-xs text-muted-foreground">
                Original clock-in {time(row.originalClockInAt)} · Updated by approved attendance
                correction
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
