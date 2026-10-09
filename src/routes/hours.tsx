import { createFileRoute } from "@tanstack/react-router";
import { Clock3 } from "lucide-react";
import { EmployeeShell, ConnectionBanner, StatusPill } from "@/components/app/EmployeeShell";
import { RecordForm } from "@/components/app/RecordForm";
import { useAttendance } from "@/lib/app-store";
import { fmtMin } from "@/lib/attendance";
export const Route = createFileRoute("/hours")({ component: Hours });
function Hours() {
  const d = useAttendance();
  const shifts = d.shifts.filter((s) => s.employeeId === d.me);
  const approved = shifts
    .filter((s) => d.timesheets.find((t) => t.shiftId === s.id)?.status === "approved")
    .reduce((sum, s) => sum + s.totals.workedMinutes, 0);
  return (
    <EmployeeShell title="My hours">
      <ConnectionBanner />
      <section className="card-surface p-5">
        <Clock3 className="h-6 w-6 text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Approved hours</p>
        <h2 className="mt-1 text-3xl font-bold">{fmtMin(approved)}</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Recorded time is reviewed before it can be exported.
        </p>
      </section>
      {!shifts.length && (
        <p className="card-surface p-5 text-sm text-muted-foreground">
          Your shifts will appear here once assigned.
        </p>
      )}
      {shifts.map((s) => {
        const ts = d.timesheets.find((t) => t.shiftId === s.id);
        const total = s.totals;
        return (
          <section key={s.id} className="card-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">{s.date}</h2>
              <StatusPill
                tone={
                  ts?.status === "approved" ? "ok" : ts?.status === "submitted" ? "warn" : "muted"
                }
              >
                {ts?.status || "open"}
              </StatusPill>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {s.start}–{s.end} · {d.sites.find((site) => site.id === s.siteId)?.name}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {[
                ["Recorded", total.recordedMinutes],
                ["Regular", total.regularMinutes],
                ["Unpaid lunch", total.lunchMinutes],
                ["Approved overtime", total.overtimeMinutes],
              ].map(([label, minutes]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 font-bold">{fmtMin(Number(minutes))}</dd>
                </div>
              ))}
            </dl>
            {total.missingClockOut && (
              <p className="mt-4 rounded-2xl bg-tint-cream p-3 text-sm">
                Clock-out is missing. Submit a correction request if needed.
              </p>
            )}
            {total.complete && ts?.status === "open" && (
              <div className="mt-4">
                <RecordForm
                  title="Submit for review"
                  action="submit_timesheet"
                  extra={{ shiftId: s.id }}
                  label="Submit timesheet"
                  fields={[
                    {
                      name: "overtimeMinutes",
                      label: "Overtime requested (minutes)",
                      type: "number",
                      value: total.unapprovedOvertimeMinutes,
                      min: 0,
                      max: total.unapprovedOvertimeMinutes,
                    },
                  ]}
                />
              </div>
            )}
            {ts?.status === "submitted" && (
              <p className="mt-4 text-sm text-muted-foreground">Waiting for manager review.</p>
            )}
          </section>
        );
      })}
    </EmployeeShell>
  );
}
