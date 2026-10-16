import { useEffect, useState } from "react";
import { reportInterpretation } from "@/lib/backend";

export function ReportInterpretation({ incidentId }: { incidentId: string }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof reportInterpretation>> | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    setResult(null);
    setFailed(false);
    const load = async () => {
      try {
        const next = await reportInterpretation(incidentId);
        if (stopped) return;
        setResult(next);
        if (next.status === "pending" || next.status === "processing")
          timer = setTimeout(() => void load(), 15000);
      } catch {
        if (!stopped) setFailed(true);
      }
    };
    void load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [incidentId]);
  if (!result && !failed) return null;
  if (result?.status === "not_processed") return null;
  return (
    <section className="rounded-xl border border-border p-4 space-y-2" aria-live="polite">
      <h3 className="font-semibold">Suggested report summary</h3>
      {result?.status === "ready" && result.suggestion ? (
        <>
          <p className="whitespace-pre-wrap text-sm">{result.suggestion.summary}</p>
          {result.suggestion.questions.length > 0 && (
            <>
              <p className="text-sm font-medium">Information to clarify</p>
              <ul className="list-disc pl-5 text-sm">
                {result.suggestion.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            Automatically prepared from the report text. Review against the original evidence. No
            attendance or pay records have changed.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {failed || result?.status === "failed"
            ? "Summary unavailable. Your original report and review workflow remain available."
            : "Preparing a suggested summary. You can continue reviewing the original report."}
        </p>
      )}
    </section>
  );
}
