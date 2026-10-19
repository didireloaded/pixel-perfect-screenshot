import { useEffect, useState } from "react";
import { ThemedSelect } from "../../../shared/ThemedSelect";
import type {
  JobAcknowledgementData,
  JobAcknowledgementRpc,
} from "../../../shared/job-acknowledgements";
export function JobAcknowledgements({
  jobId,
  employees = [],
  rpc,
  canManage = false,
  refreshKey,
}: {
  jobId: string;
  employees?: { id: string; name: string }[];
  rpc: JobAcknowledgementRpc;
  canManage?: boolean;
  refreshKey?: object;
}) {
  const [data, setData] = useState<JobAcknowledgementData>();
  const [employeeId, setEmployee] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    rpc("list", { jobId })
      .then((d) => {
        if (active) setData(d);
      })
      .catch(() => {
        if (active) setError("Could not load job responses.");
      });
    return () => {
      active = false;
    };
  }, [jobId, rpc, refreshKey]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      setData(
        await rpc("set_reporting_time", {
          jobId,
          employeeId,
          date,
          expectedLocal: `${date}T${time}:00`,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save reporting time.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3">
      <h3 className="font-bold">Job responses and reporting</h3>
      {canManage && employees.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <label className="text-sm">
            Assigned employee
            <ThemedSelect
              className="block rounded-xl border bg-background p-2"
              value={employeeId}
              onValueChange={setEmployee}
            >
              <option value="">Choose employee</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </ThemedSelect>
          </label>
          <label className="text-sm">
            Reporting date
            <input
              className="block rounded-xl border bg-background p-2"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Namibia reporting time
            <input
              className="block rounded-xl border bg-background p-2"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
          <button
            className="rounded-xl border px-3 py-2 self-end"
            disabled={busy || !employeeId || !date || !time}
            onClick={() => void save()}
          >
            Save reporting time
          </button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Reporting times adjust existing attendance expectations for explicitly assigned employees.
        They do not create attendance records or approve hours.
      </p>
      {error && <p role="alert">{error}</p>}
      {data?.reportingTimes.map((t) => (
        <p className="text-sm" key={t.employeeId + t.date}>
          {employees.find((e) => e.id === t.employeeId)?.name ?? "Employee"}:{" "}
          {new Date(t.expectedAt).toLocaleString([], {
            timeZone: data.timezone ?? "Africa/Windhoek",
          })}
        </p>
      ))}
      {data?.responses.length === 0 && (
        <p className="text-sm text-muted-foreground">No employee responses yet.</p>
      )}
      {data?.responses.map((r) => (
        <div className="rounded-xl border p-3 text-sm" key={r.id}>
          <strong>{r.name}</strong> · {r.response} · {new Date(r.createdAt).toLocaleString()}
          {r.note && <p>{r.note}</p>}
        </div>
      ))}
    </section>
  );
}
