import { useEffect, useState } from "react";
import type { AttendanceSnapshot, PunctualityData } from "./attendance";
import type { AttendanceContextData } from "./attendance-context";
import { ThemedSelect } from "./ThemedSelect";

export function AttendanceIssues({
  data,
  rpc,
  readPunctuality,
  manager = false,
}: {
  data: AttendanceSnapshot;
  rpc: (action: string, payload?: Record<string, unknown>) => Promise<AttendanceContextData>;
  readPunctuality: (action: "list", payload?: Record<string, unknown>) => Promise<PunctualityData>;
  manager?: boolean;
}) {
  const [date, setDate] = useState(data.today),
    [content, setContent] = useState<AttendanceContextData | null>(null);
  const [records, setRecords] = useState<PunctualityData["records"]>([]),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [issue, setIssue] = useState(""),
    [description, setDescription] = useState("");
  const [employee, setEmployee] = useState(""),
    [kind, setKind] = useState("off"),
    [start, setStart] = useState("08:00"),
    [end, setEnd] = useState("17:00"),
    [reason, setReason] = useState("");
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setContent(null);
    setRecords([]);
    setError("");
    void Promise.all([
      rpc("list", { date }),
      date <= data.today
        ? readPunctuality("list", { date })
        : Promise.resolve({ records: [] } as Pick<PunctualityData, "records">),
    ])
      .then(([result, p]) => {
        if (active) {
          setContent(result);
          setRecords(p.records);
        }
      })
      .catch(() => {
        if (active) setError("Could not load attendance issues. Reconnect and retry.");
      });
    return () => {
      active = false;
    };
  }, [date, data.company.id, data.today, data.requests, data.events, rpc, readPunctuality, reload]);
  const name = (id: string) => data.employees.find((e) => e.id === id)?.name ?? "Employee";
  const labels: Record<string, string> = {
    late: "Late arrival",
    no_checkin: "No check-in recorded",
    missing_clockout: "Missing clock-out",
  };
  async function submit(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      setContent(await rpc(action, { ...payload, date }));
      setReload((n) => n + 1);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save attendance context.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={manager ? "project-panel space-y-4" : "worker-card space-y-4"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Attendance issues and explanations</h2>
        <label className="text-sm">
          Date{" "}
          <input
            type="date"
            aria-label="Attendance issue date"
            value={date}
            max={manager ? undefined : data.today}
            onChange={(e) => {
              if (e.target.value) {
                setDate(e.target.value);
                setIssue("");
              }
            }}
          />
        </label>
      </div>
      <p className="text-sm text-muted-foreground">
        Explanations add context. Accepting one does not change clock-in, clock-out, hours or pay.
        Use the existing correction workflow to change an incorrect record.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}{" "}
          <button type="button" onClick={() => setReload((n) => n + 1)}>
            Retry
          </button>
        </p>
      )}
      {!content && !error && <p className="text-sm">Loading…</p>}
      {!manager && records.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium">My arrival history</h3>
          {records.map((r) => (
            <p key={r.id} className="text-sm">
              {r.status === "late"
                ? `${Math.floor((r.lateSeconds ?? 0) / 60)}m ${(r.lateSeconds ?? 0) % 60}s late`
                : r.status === "on_time"
                  ? "On time"
                  : r.status === "excused"
                    ? "Not expected at normal start"
                    : r.status === "expected"
                      ? "Expected"
                      : "No check-in recorded"}
            </p>
          ))}
        </div>
      )}
      {content?.issues.map((row) => (
        <p key={row.key} className="rounded-xl border border-border p-3 text-sm">
          {manager ? `${name(row.employeeId)} · ` : ""}
          {labels[row.kind] ?? row.kind}
        </p>
      ))}
      {content?.issues.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No unresolved attendance issues for this date.
        </p>
      )}
      {!manager && !!content?.issues.length && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const selected = content.issues.find((i) => i.key === issue);
            if (!selected) return;
            if (
              await submit("explain", {
                id: crypto.randomUUID(),
                recordId: selected.recordId,
                shiftId: selected.shiftId,
                description,
              })
            ) {
              setDescription("");
              setIssue("");
            }
          }}
        >
          <label className="block text-sm">
            Issue
            <ThemedSelect value={issue} onValueChange={setIssue} required>
              <option value="">Choose an issue</option>
              {content.issues.map((i) => (
                <option key={i.key} value={i.key}>
                  {labels[i.kind] ?? i.kind}
                </option>
              ))}
            </ThemedSelect>
          </label>
          <label className="block text-sm">
            What happened?
            <textarea
              className="w-full rounded-xl border border-border bg-background p-3"
              maxLength={1000}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Operational details only. Do not put medical information here. Company attendance
            reviewers can read this explanation.
          </p>
          <button className="worker-action" disabled={busy || !issue || !description.trim()}>
            {busy ? "Sending…" : "Send explanation"}
          </button>
        </form>
      )}
      {!!content?.explanations.length && <h3 className="font-medium">Explanation reviews</h3>}
      {content?.explanations.map((x) => (
        <article key={x.id} className="space-y-2 rounded-xl border border-border p-3 text-sm">
          <b>
            {manager ? `${name(x.employee_id)} · ` : ""}
            {x.status}
          </b>
          <p className="whitespace-pre-wrap">{x.description}</p>
          {x.review_reason && <p>Review: {x.review_reason}</p>}
          {manager && x.status === "pending" && x.employee_id !== data.me && (
            <div className="space-y-2">
              <label>
                Review reason
                <input
                  className="field-input w-full"
                  value={reviewReasons[x.id] ?? ""}
                  maxLength={1000}
                  onChange={(e) => setReviewReasons({ ...reviewReasons, [x.id]: e.target.value })}
                />
              </label>
              <div className="flex gap-3">
                {["accepted", "dismissed"].map((decision) => (
                  <button
                    key={decision}
                    disabled={busy || !(reviewReasons[x.id] ?? "").trim()}
                    onClick={() =>
                      void submit("review", { id: x.id, decision, reason: reviewReasons[x.id] })
                    }
                  >
                    {decision === "accepted" ? "Accept explanation" : "Dismiss explanation"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </article>
      ))}
      {manager && date >= data.today && (
        <form
          className="space-y-3 border-t border-border pt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await submit("set_exception", {
                id: crypto.randomUUID(),
                employeeId: employee,
                kind,
                start,
                end,
                reason,
              })
            )
              setReason("");
          }}
        >
          <h3 className="font-semibold">Company closure or individual exception</h3>
          <label className="block text-sm">
            Applies to
            <ThemedSelect value={employee} onValueChange={setEmployee}>
              <option value="">Entire company</option>
              {data.employees
                .filter((e) => e.role === "employee" && (e.accessStatus ?? "active") === "active")
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </ThemedSelect>
          </label>
          <label className="block text-sm">
            Expectation
            <ThemedSelect value={kind} onValueChange={setKind}>
              <option value="off">Not expected to work</option>
              <option value="hours">Different expected hours</option>
              <option value="normal">Return to normal expectations</option>
            </ThemedSelect>
          </label>
          {kind === "hours" && (
            <div className="grid grid-cols-2 gap-3">
              <label>
                Start
                <input
                  type="time"
                  aria-label="Exception start"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label>
                Finish
                <input
                  type="time"
                  aria-label="Exception finish"
                  required
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
            </div>
          )}
          <label className="block text-sm">
            Reason
            <input
              className="field-input w-full"
              required
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            className="sl-map-tool"
            disabled={busy || !reason.trim() || (kind === "hours" && (!employee || end <= start))}
          >
            Save date exception
          </button>
        </form>
      )}
      {!!content?.exceptions.length && (
        <div className="space-y-2">
          <h3 className="font-medium">Date exception history</h3>
          {content.exceptions.map((x) => (
            <p key={x.id} className="text-sm">
              {x.employee_id ? name(x.employee_id) : "Company"} ·{" "}
              {x.kind === "off"
                ? "Not expected"
                : x.kind === "hours"
                  ? "Different hours"
                  : "Normal expectations"}{" "}
              · {x.reason}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
