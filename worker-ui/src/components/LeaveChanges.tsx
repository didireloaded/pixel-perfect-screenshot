import { useEffect, useState } from "react";
import { ThemedSelect } from "../../../shared/ThemedSelect";
import type {
  LeaveChange,
  LeaveChangesRpc,
  LeaveChangeRequest,
} from "../../../shared/leave-changes";
export function LeaveChanges({
  rpc,
  onChanged,
  requests,
  refreshKey,
}: {
  rpc: LeaveChangesRpc;
  onChanged: () => void;
  requests: LeaveChangeRequest[];
  refreshKey?: object;
}) {
  const [changes, setChanges] = useState<LeaveChange[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [requestId, setRequestId] = useState(""),
    [kind, setKind] = useState("cancel"),
    [explanation, setExplanation] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [starts, setStarts] = useState(""),
    [ends, setEnds] = useState("");
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
  const eligible = requests.filter(
    (r) =>
      r.kind === "leave" &&
      ["pending", "approved"].includes(r.status) &&
      r.leaveStart &&
      !changes.some((c) => c.request_id === r.id && c.status === "pending"),
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await rpc("request", {
        id: crypto.randomUUID(),
        requestId,
        kind,
        explanation,
        ...(kind === "amend"
          ? {
              leaveStart: start,
              leaveEnd: end,
              ...(starts || ends ? { leaveStartTime: starts, leaveEndTime: ends } : {}),
            }
          : {}),
      });
      setChanges(r.changes);
      setRequestId("");
      setExplanation("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to request leave change");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      style={{
        padding: "16px",
        borderRadius: 16,
        border: "1px solid var(--border)",
        marginTop: 16,
      }}
    >
      <h3>Change your leave</h3>
      <p>
        Ask to cancel leave or change its dates. Your current leave stays in place until review.
      </p>
      {error && <p role="alert">{error}</p>}
      {eligible.length > 0 && (
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <label>
            Leave request
            <ThemedSelect required value={requestId} onValueChange={setRequestId}>
              <option value="">Choose leave</option>
              {eligible.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.summary} · {r.leaveStart}–{r.leaveEnd}
                </option>
              ))}
            </ThemedSelect>
          </label>
          <label>
            Change
            <ThemedSelect value={kind} onValueChange={setKind}>
              <option value="cancel">Cancel leave</option>
              <option value="amend">Change dates</option>
            </ThemedSelect>
          </label>
          {kind === "amend" && (
            <>
              <label>
                New first day
                <input
                  type="date"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label>
                New last day
                <input
                  type="date"
                  required
                  min={start}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
              <p>For part of one day, enter both times. Leave empty for full days.</p>
              <label>
                From
                <input type="time" value={starts} onChange={(e) => setStarts(e.target.value)} />
              </label>
              <label>
                Until
                <input type="time" value={ends} onChange={(e) => setEnds(e.target.value)} />
              </label>
            </>
          )}
          <label>
            Reason
            <textarea
              required
              maxLength={1000}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Request change"}
          </button>
        </form>
      )}
      {!eligible.length && <p>No eligible leave requests to change.</p>}
      {changes.map((c) => (
        <article key={c.id} style={{ marginTop: 16 }}>
          <strong>
            {c.kind === "cancel" ? "Cancellation" : "Date change"} · {c.status}
          </strong>
          {c.kind === "amend" && (
            <p>
              {c.leave_start}–{c.leave_end}
            </p>
          )}
          <p>{c.explanation}</p>
          {c.review_reason && <p>Decision: {c.review_reason}</p>}
        </article>
      ))}
    </section>
  );
}
