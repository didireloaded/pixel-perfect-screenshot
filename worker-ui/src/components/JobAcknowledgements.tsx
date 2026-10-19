import { useEffect, useState } from "react";
import type {
  JobAcknowledgementData,
  JobAcknowledgementRpc,
} from "../../../shared/job-acknowledgements";
export function JobAcknowledgements({
  jobId,
  rpc,
  refreshKey,
}: {
  jobId: string;
  rpc: JobAcknowledgementRpc;
  refreshKey?: object;
}) {
  const [data, setData] = useState<JobAcknowledgementData>();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
  async function respond(response: string) {
    setBusy(true);
    setError("");
    try {
      setData(await rpc("respond", { jobId, response, note }));
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save response.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Your job response</h3>
      {data?.reportingTimes.map((t) => (
        <p key={t.date} className="text-sm">
          Expected reporting:{" "}
          {new Date(t.expectedAt).toLocaleString([], {
            timeZone: data.timezone ?? "Africa/Windhoek",
          })}
        </p>
      ))}
      <label className="block text-sm">
        Note or availability conflict
        <textarea
          className="w-full rounded-xl border bg-background p-3"
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {(["seen", "available", "conflict"] as const).map((v) => (
          <button
            className="rounded-xl border px-3 py-2"
            key={v}
            disabled={busy || !data || (v === "conflict" && !note.trim())}
            onClick={() => void respond(v)}
          >
            {v === "seen" ? "Seen" : v === "available" ? "Available" : "Flag conflict"}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      {data?.responses.slice(0, 3).map((r) => (
        <p className="text-sm text-muted-foreground" key={r.id}>
          {r.response} · {new Date(r.createdAt).toLocaleString()}
          {r.note && ` — ${r.note}`}
        </p>
      ))}
      <p className="text-xs text-muted-foreground">
        Responses do not clock you in or change recorded hours.
      </p>
    </section>
  );
}
