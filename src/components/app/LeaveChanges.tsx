import { useEffect, useState } from "react";
import type { LeaveChange, LeaveChangesRpc } from "../../../shared/leave-changes";
export function LeaveChanges({
  rpc,
  onChanged,
  employees,
  refreshKey,
}: {
  rpc: LeaveChangesRpc;
  onChanged: () => void;
  employees: { id: string; name: string }[];
  refreshKey?: object;
}) {
  const [changes, setChanges] = useState<LeaveChange[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    rpc("list", {})
      .then((r) => {
        if (active) setChanges(r.changes);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [rpc, refreshKey]);
  async function review(id: string, status: string) {
    setBusy(true);
    setError("");
    try {
      const r = await rpc("review", { id, status, reason: reason[id] ?? "" });
      setChanges(r.changes);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to review leave change");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="project-panel">
      <div className="project-panel-head">
        <div>
          <h2>Leave changes</h2>
          <p className="project-panel-sub">
            Review cancellations and new dates. Original requests remain in the history.
          </p>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {!changes.length && !error && <p>No leave changes requested.</p>}
      {changes.map((c) => (
        <article key={c.id} style={{ padding: "16px", borderBottom: "1px solid var(--border)" }}>
          <strong>
            {employees.find((e) => e.id === c.employee_id)?.name ?? "Employee"} ·{" "}
            {c.kind === "cancel" ? "Cancel leave" : "Amend leave"}
          </strong>
          <p>{c.explanation}</p>
          {c.kind === "amend" && (
            <p>
              {c.leave_start} – {c.leave_end}
              {c.leave_start_time
                ? ` · ${c.leave_start_time.slice(0, 5)}–${c.leave_end_time?.slice(0, 5)}`
                : ""}
            </p>
          )}
          <p>Status: {c.status}</p>
          {c.review_reason && <p>{c.review_reason}</p>}
          {c.status === "pending" && (
            <>
              <label>
                Decision reason
                <textarea
                  aria-label="Leave change decision reason"
                  value={reason[c.id] ?? ""}
                  maxLength={1000}
                  onChange={(e) => setReason({ ...reason, [c.id]: e.target.value })}
                />
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="project-btn"
                  disabled={busy || !reason[c.id]?.trim()}
                  onClick={() => review(c.id, "approved")}
                >
                  Approve change
                </button>
                <button
                  className="project-btn"
                  disabled={busy || !reason[c.id]?.trim()}
                  onClick={() => review(c.id, "declined")}
                >
                  Decline change
                </button>
              </div>
            </>
          )}
        </article>
      ))}
    </section>
  );
}
