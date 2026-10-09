import { createFileRoute } from "@tanstack/react-router";
import { EmployeeShell, ConnectionBanner, StatusPill } from "@/components/app/EmployeeShell";
import { RecordForm } from "@/components/app/RecordForm";
import { useAttendance } from "@/lib/app-store";
export const Route = createFileRoute("/requests")({ component: Requests });
function Requests() {
  const d = useAttendance();
  const requests = d.requests.filter((r) => r.employeeId === d.me);
  return (
    <EmployeeShell title="Requests">
      <ConnectionBanner />
      <RecordForm
        title="Request a time correction"
        action="request_correction"
        fields={[
          {
            name: "shiftId",
            label: "Shift",
            options: d.shifts
              .filter((s) => s.employeeId === d.me)
              .map((s) => ({ value: s.id, label: `${s.date} · ${s.start}–${s.end}` })),
          },
          {
            name: "eventId",
            label: "Original event (blank for a missing action)",
            optional: true,
            options: [
              { value: "", label: "Missing action" },
              ...d.events
                .filter((e) => e.employeeId === d.me)
                .map((e) => ({
                  value: e.id,
                  label: `${e.type.replaceAll("_", " ")} · ${new Date(e.capturedAt).toLocaleString()}`,
                })),
            ],
          },
          {
            name: "eventType",
            label: "Missing action type",
            options: [
              { value: "clock_in", label: "Clock in" },
              { value: "clock_out", label: "Clock out" },
              { value: "start_lunch", label: "Start lunch" },
              { value: "end_lunch", label: "End lunch" },
            ],
          },
          {
            name: "replacementAt",
            label: "Correct time (include timezone, e.g. 2026-10-09T17:00:00+02:00)",
          },
          { name: "reason", label: "Reason" },
        ]}
      />
      {d.corrections
        .filter((c) => c.employee_id === d.me)
        .map((c) => (
          <section key={c.id} className="card-surface p-5">
            <h2 className="font-bold">{c.event_type.replaceAll("_", " ")}</h2>
            <p className="mt-2 text-sm">{c.reason}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {c.status.replaceAll("_", " ")} ·{" "}
              {new Date(c.replacement_value.capturedAt).toLocaleString()}
            </p>
          </section>
        ))}
      <RecordForm
        title="New request"
        action="create_request"
        label="Send request"
        fields={[
          {
            name: "kind",
            label: "Type",
            options: [
              { value: "leave", label: "Leave" },
              { value: "missing_clocking", label: "Missing clocking" },
              { value: "correction", label: "Time correction" },
            ],
          },
          { name: "summary", label: "Summary" },
          { name: "detail", label: "Details (dates and times)", optional: true },
        ]}
      />
      <p className="px-1 text-xs text-muted-foreground">
        Use a time correction for missing or incorrect punches. Approved corrections preserve the
        original event and require the configured approval levels.
      </p>
      {!requests.length && (
        <p className="card-surface p-5 text-sm text-muted-foreground">No requests yet.</p>
      )}
      {requests.map((r) => (
        <article key={r.id} className="card-surface p-5">
          <div className="flex justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {new Date(r.submittedAt).toLocaleDateString()}
            </p>
            <StatusPill
              tone={r.status === "approved" ? "ok" : r.status === "declined" ? "bad" : "warn"}
            >
              {r.status}
            </StatusPill>
          </div>
          <h2 className="mt-3 font-bold">{r.summary}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{r.detail}</p>
          {r.expectedReturn && <p className="mt-2 text-sm">Expected return · {r.expectedReturn}</p>}
          {r.reviewer && (
            <p className="mt-3 rounded-2xl bg-muted p-3 text-sm">
              {r.reviewer}: {r.reason}
            </p>
          )}
        </article>
      ))}
    </EmployeeShell>
  );
}
