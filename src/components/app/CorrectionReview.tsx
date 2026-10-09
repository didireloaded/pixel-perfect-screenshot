import { useAttendance } from "@/lib/app-store";
import { RecordForm } from "./RecordForm";
import { StatusPill } from "./EmployeeShell";
export function CorrectionReview() {
  const d = useAttendance();
  const name = (id: string) => d.employees.find((e) => e.id === id)?.name || "Employee";
  const decisions = [
    { value: "approved", label: "Accept" },
    { value: "declined", label: "Decline" },
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {d.submissions
        .filter((s) => s.status !== "synced" || s.warning)
        .map((s) => (
          <section key={s.id} className="card-surface p-5">
            <div className="flex justify-between gap-2">
              <h2 className="font-bold">{name(s.employee_id)}</h2>
              <StatusPill
                tone={
                  s.status === "needs_review" ? "warn" : s.status === "declined" ? "bad" : "info"
                }
              >
                {s.status.replace("_", " ")}
              </StatusPill>
            </div>
            <p className="mt-3 text-sm">
              {s.payload.type.replaceAll("_", " ")} · {s.reason || s.warning}
            </p>
            <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
              <div>Captured · {new Date(s.captured_at).toLocaleString()}</div>
              <div>Received · {new Date(s.received_at).toLocaleString()}</div>
              <div>Accuracy · {s.payload.location?.accuracyM ?? "Unavailable"} metres</div>
            </dl>
            {s.status === "needs_review" &&
              s.employee_id !== d.me &&
              !d.corrections.some((c) => c.submission_id === s.id) && (
                <div className="mt-4">
                  <RecordForm
                    title="Review submission"
                    action="review_submission"
                    extra={{ id: s.id }}
                    fields={[
                      { name: "decision", label: "Decision", options: decisions },
                      { name: "reason", label: "Reason" },
                    ]}
                  />
                </div>
              )}
          </section>
        ))}
      {d.corrections.map((c) => (
        <section key={c.id} className="card-surface p-5">
          <div className="flex justify-between gap-2">
            <h2 className="font-bold">{name(c.employee_id)}</h2>
            <StatusPill
              tone={c.status === "approved" ? "ok" : c.status === "declined" ? "bad" : "warn"}
            >
              {c.status.replaceAll("_", " ")}
            </StatusPill>
          </div>
          <p className="mt-3 text-sm">
            {c.event_type.replaceAll("_", " ")} · {c.reason}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Original ·{" "}
            {c.original_value
              ? new Date(c.original_value.capturedAt).toLocaleString()
              : "Missing event"}
            <br />
            Replacement · {new Date(c.replacement_value.capturedAt).toLocaleString()}
          </p>
          {c.approved_by_level_1 && (
            <p className="mt-2 text-xs">Level 1 · {name(c.approved_by_level_1)}</p>
          )}
          {c.approved_by_level_2 && (
            <p className="mt-2 text-xs">Level 2 · {name(c.approved_by_level_2)}</p>
          )}
          {c.employee_id !== d.me &&
            (c.status === "pending_manager" ||
              (c.status === "pending_payroll" &&
                d.payrollAdmin &&
                c.approved_by_level_1 !== d.me)) && (
              <div className="mt-4">
                <RecordForm
                  title={
                    c.status === "pending_payroll"
                      ? "Payroll review · level 2"
                      : "Manager review · level 1"
                  }
                  action="review_correction"
                  extra={{ id: c.id }}
                  fields={[
                    { name: "decision", label: "Decision", options: decisions },
                    { name: "reason", label: "Decision reason" },
                  ]}
                />
              </div>
            )}
        </section>
      ))}
      {!d.corrections.length && !d.submissions.some((s) => s.status !== "synced" || s.warning) && (
        <p className="card-surface p-5 text-sm text-muted-foreground">
          No attendance conflicts or corrections.
        </p>
      )}
    </div>
  );
}
