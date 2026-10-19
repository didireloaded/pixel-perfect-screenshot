import { useEffect, useState } from "react";
import { ThemedSelect } from "./ThemedSelect";
import type { AvailabilityPreference, AvailabilityRpc } from "./availability";
export function EmployeeAvailability({
  rpc,
  manager = false,
  employees = [],
  onChanged,
  refreshKey,
}: {
  rpc: AvailabilityRpc;
  manager?: boolean;
  employees?: { id: string; name: string }[];
  onChanged: () => void;
  refreshKey?: object;
}) {
  const [items, setItems] = useState<AvailabilityPreference[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [availability, setAvailability] = useState("unavailable"),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [starts, setStarts] = useState(""),
    [ends, setEnds] = useState(""),
    [reason, setReason] = useState(""),
    [showHistory, setShowHistory] = useState(false),
    [employee, setEmployee] = useState("");
  useEffect(() => {
    let active = true;
    rpc("list", {})
      .then((r) => {
        if (active) setItems(r.availability);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [rpc, refreshKey]);
  async function act(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const r = await rpc(action, payload);
      setItems(r.availability);
      onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update availability");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (
      await act("create", {
        id: crypto.randomUUID(),
        availability,
        startDate: start,
        endDate: end,
        startTime: starts || null,
        endTime: ends || null,
        reason,
      })
    ) {
      setStart("");
      setEnd("");
      setStarts("");
      setEnds("");
      setReason("");
    }
  }
  const visible = items.filter(
    (i) => (showHistory || !i.withdrawn_at) && (!employee || i.employee_id === employee),
  );
  return (
    <section
      className={manager ? "project-panel" : ""}
      style={{ padding: 16, marginTop: 16, border: "1px solid var(--border)", borderRadius: 16 }}
    >
      <h3>Availability preferences</h3>
      <p>
        Availability helps plan work. It does not approve leave, change attendance expectations or
        change recorded hours.
      </p>
      {error && <p role="alert">{error}</p>}
      {manager ? (
        <label>
          Employee
          <ThemedSelect value={employee} onValueChange={setEmployee}>
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </ThemedSelect>
        </label>
      ) : (
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <label>
            Preference
            <ThemedSelect value={availability} onValueChange={setAvailability}>
              <option value="unavailable">Unavailable</option>
              <option value="available">Available</option>
            </ThemedSelect>
          </label>
          <label>
            First day
            <input required type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            Last day
            <input
              required
              type="date"
              value={end}
              min={start}
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
          <label>
            Note for your manager (optional)
            <textarea maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button disabled={busy} type="submit">
            {busy ? "Saving…" : "Save preference"}
          </button>
        </form>
      )}
      <label style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <input
          type="checkbox"
          checked={showHistory}
          onChange={(e) => setShowHistory(e.target.checked)}
        />
        Include withdrawn preferences
      </label>
      {!visible.length && <p>No availability preferences.</p>}
      {visible.map((i) => (
        <article key={i.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
          {manager && (
            <strong>{employees.find((e) => e.id === i.employee_id)?.name ?? "Employee"} · </strong>
          )}
          <strong>
            {i.availability === "available" ? "Available" : "Unavailable"}
            {i.withdrawn_at ? " · Withdrawn" : ""}
          </strong>
          <p>
            {i.start_date}–{i.end_date}
            {i.start_time ? ` · ${i.start_time.slice(0, 5)}–${i.end_time?.slice(0, 5)}` : ""}
          </p>
          {i.reason && <p>{i.reason}</p>}
          {!manager && !i.withdrawn_at && (
            <button disabled={busy} type="button" onClick={() => act("withdraw", { id: i.id })}>
              Withdraw preference
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
