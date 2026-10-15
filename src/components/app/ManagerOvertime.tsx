import { useAttendance } from "@/lib/app-store";
import { Button } from "@/components/ui/button";
export function ManagerOvertime() {
  const d = useAttendance();
  const pending = (d.overtimeSessions ?? []).filter(
    (session) => session.reviewStatus === "pending",
  );
  if (!pending.length) return null;
  return (
    <section className="project-panel space-y-4">
      <h2 className="text-lg font-semibold">Earlier overtime starts to review</h2>
      <p className="text-sm text-muted-foreground">
        The worker's actual tap remains recorded. Approving confirms an earlier start against the
        existing attendance evidence; pay still needs timesheet approval.
      </p>
      {pending.map((session) => (
        <article key={session.id} className="rounded-xl border border-border p-4 space-y-2">
          <h3 className="font-semibold">
            {d.employees.find((employee) => employee.id === session.employeeId)?.name ?? "Employee"}
          </h3>
          <p className="text-sm">
            Tap: {new Date(session.startedAt).toLocaleString([], { timeZone: d.company.timezone })}
          </p>
          <p className="text-sm">
            Requested:{" "}
            {session.requestedStartAt &&
              new Date(session.requestedStartAt).toLocaleString([], {
                timeZone: d.company.timezone,
              })}
          </p>
          <p className="text-sm whitespace-pre-wrap">{session.requestReason}</p>
          {d.accessRole === "owner" && d.payrollAdmin && session.employeeId !== d.me ? (
            <div className="flex gap-2">
              {(["approved", "declined"] as const).map((decision) => (
                <Button
                  key={decision}
                  variant="soft"
                  disabled={d.busy || !d.online}
                  onClick={() =>
                    void d.command("review_overtime_start", { shiftId: session.shiftId, decision })
                  }
                >
                  {decision === "approved" ? "Approve earlier start" : "Decline"}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Requires an independent payroll owner.</p>
          )}
        </article>
      ))}
    </section>
  );
}
