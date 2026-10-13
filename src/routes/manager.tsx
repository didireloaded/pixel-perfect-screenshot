import { ManagerMap } from "@/components/app/ManagerMap";
import { EmployeeDirectory } from "@/components/app/EmployeeDirectory";
import { ManagerJobBrief, ManagerJobBriefs } from "@/components/app/ManagerJobBrief";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Users, CalendarClock, Inbox, Clock3 } from "lucide-react";
import { StatusPill } from "@/components/app/EmployeeShell";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RecordForm } from "@/components/app/RecordForm";
import { useAttendance } from "@/lib/app-store";
import { STATE_LABEL } from "@/lib/attendance";
import { CompanySettings, SetupChecklist } from "@/components/app/CompanySettings";
import { CorrectionReview } from "@/components/app/CorrectionReview";
import { CompanyNotices, SiteAlerts } from "@/components/app/WorkdayOperations";
import { WorkerAccessPanel } from "@/components/app/WorkerAccessPanel";
import { KioskDesk } from "@/components/app/KioskDesk";
import { ManagerJobTools, ManagerMessages } from "@/components/app/TeamComms";
import { ManagerJobBoard } from "@/components/app/ManagerJobBoard";
import { ManagerNotes, ManagerReports, ManagerAttendance } from "@/components/app/ManagerPanels";
import { ManagerOverview } from "@/components/app/ManagerOverview";
import { ManagerCalendar } from "@/components/app/ManagerCalendar";
import { ManagerInsights } from "@/components/app/ManagerInsights";
import { ManagerFrame } from "@/components/app/ManagerFrame";
import { managerGroups, type ManagerSection } from "@/components/app/manager-sections";

const TABS: ManagerSection[] = [
  ...managerGroups.flatMap((group) => group.items.map((item) => item.name)),
  "Settings",
];
type ManagerTab = ManagerSection;
export const Route = createFileRoute("/manager")({
  validateSearch: (search: Record<string, unknown>): { tab?: ManagerTab } => {
    const tab = TABS.find((item) => item === search["tab"]);
    return tab ? { tab } : {};
  },
  component: Manager,
});
function Manager() {
  const d = useAttendance();
  const navigate = useNavigate();
  const tab = Route.useSearch().tab || "Tasks";
  const setTab = (next: ManagerTab) => void navigate({ to: "/manager", search: { tab: next } });
  const [showJobForm, setShowJobForm] = useState(false);
  if (d.role !== "manager")
    return (
      <div className="mx-auto mt-12 max-w-[440px] card-surface p-6">
        <h1 className="text-xl font-bold">Manager access required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your employee account cannot access company approvals or exports.
        </p>
        <Link to="/" className="mt-4 inline-block text-primary">
          Back to Today
        </Link>
      </div>
    );
  const staff = d.employees.filter((e) => e.role === "employee");
  const pending = d.requests.filter((r) => r.status === "pending");
  const submitted = d.timesheets.filter((t) => t.status === "submitted");
  const missing = d.shifts.filter((s) => s.date < d.today && s.totals.missingClockOut);
  const names = (id: string) => d.employees.find((e) => e.id === id)?.name || "Employee";

  return (
    <ManagerFrame
      active={tab}
      onSelect={setTab}
      company={d.company.name || "Project Inc."}
      managerName={d.employees.find((employee) => employee.id === d.me)?.name || "Manager"}
      insights={
        ["Tasks", "Overview", "Views"].includes(tab) ? (
          <ManagerInsights data={d} onSelect={setTab} />
        ) : undefined
      }
      onRefresh={() => void d.refresh()}
      onSignOut={() => void d.logout()}
    >
      {tab === "Overview" && (
        <ManagerOverview
          jobs={d.jobs}
          shifts={d.shifts}
          employees={staff}
          events={d.events}
          today={d.today}
          onSelect={setTab}
        />
      )}
      {tab === "Notes" && <ManagerNotes />}
      {tab === "Reports" && <ManagerReports />}
      {tab === "Attendance" && <ManagerAttendance />}
      {tab === "Map" && <ManagerMap />}
      {tab === "Project management" && (
        <div className="space-y-5">
          <ManagerJobBriefs onAdd={() => setShowJobForm(true)} />
          <ManagerJobTools />
        </div>
      )}
      {tab === "Settings" && <CompanySettings />}
      {tab === "Corrections" && <CorrectionReview />}
      {tab === "Announcements" && <CompanyNotices />}
      {tab === "Messages" && <ManagerMessages />}
      {tab === "Employee Access" && <KioskDesk />}
      {tab === "Views" && (
        <>
          <SetupChecklist />
          <div className="mb-5">
            <SiteAlerts />
          </div>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              [Users, "Employees", staff.length],
              [Inbox, "Pending requests", pending.length],
              [Clock3, "Timesheets to review", submitted.length],
              [CalendarClock, "Missing clock-outs", missing.length],
            ].map(([Icon, label, count], index) => {
              const I = Icon as typeof Users;
              return (
                <section
                  key={String(label)}
                  className={`card-surface p-5 ${index === 0 ? "manager-lime-card" : ""}`}
                >
                  <I className="h-5 w-5" />
                  <p className="mt-5 text-xs font-semibold opacity-70">{String(label)}</p>
                  <p className="mt-1 text-[2.2rem] font-bold leading-none tracking-tight">
                    {String(count)}
                  </p>
                </section>
              );
            })}
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card-surface p-5">
              <h2 className="text-lg font-bold">Today · {d.today}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Attendance status comes from recorded actions. Location stamps are captured only
                when required by the assigned shift policy.
              </p>
              <div className="mt-4 space-y-3">
                {!staff.length && (
                  <p className="text-sm text-muted-foreground">Add your first employee in Team.</p>
                )}
                {staff.map((e) => {
                  const shift = d.shifts.find((s) => s.employeeId === e.id && s.date === d.today);
                  const state =
                    d.states.find((s) => s.shiftId === shift?.id)?.state || "not_clocked_in";
                  return (
                    <div
                      key={e.id}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-muted p-3"
                    >
                      <div>
                        <p className="text-sm font-semibold">{e.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {shift ? `${shift.start}–${shift.end}` : "No shift assigned"}
                        </p>
                      </div>
                      <StatusPill tone={state === "working" ? "ok" : "muted"}>
                        {STATE_LABEL[state]}
                      </StatusPill>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="card-surface p-5">
              <h2 className="text-lg font-bold">Needs attention</h2>
              {!missing.length && !pending.length && !submitted.length ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  No outstanding exceptions or approvals.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {missing.map((s) => (
                    <div key={s.id} className="rounded-2xl bg-tint-cream p-3 text-sm">
                      <b>{names(s.employeeId)}</b>
                      <p>Missing clock-out · {s.date}</p>
                      <p className="mt-1 text-xs">
                        Hours cannot be approved while this shift is incomplete.
                      </p>
                    </div>
                  ))}
                  {pending.length > 0 && (
                    <Button variant="soft" className="w-full" onClick={() => setTab("Requests")}>
                      Review {pending.length} requests
                    </Button>
                  )}
                  {submitted.length > 0 && (
                    <Button variant="soft" className="w-full" onClick={() => setTab("Attendance")}>
                      Review {submitted.length} timesheets
                    </Button>
                  )}
                </div>
              )}
            </section>
          </div>
        </>
      )}
      {tab === "Team" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <section className="card-surface p-5">
              <h2 className="text-lg font-bold">Employee registration</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Ask workers to open the worker app and register with their name and phone number.
                The system gives each worker an employee number and private login code. New
                registrations appear here for approval.
              </p>
            </section>
            <RecordForm
              title="Add site"
              action="create_site"
              fields={[
                { name: "name", label: "Site name" },
                { name: "address", label: "Address", optional: true },
              ]}
            />
          </div>
          <WorkerAccessPanel />
        </div>
      )}
      {tab === "Calendar" && <ManagerCalendar data={d} />}
      {tab === "Tasks" && (
        <div className="space-y-5">
          <ManagerJobBoard
            jobs={d.jobs}
            steps={d.jobSteps}
            team={d.jobTeam}
            comments={d.jobComments}
            names={names}
            today={d.today}
            onAdd={() => setShowJobForm(true)}
            onMove={async (jobId, status) =>
              !!(await d.command("set_job_status", {
                jobId,
                status,
                expectedStatus: d.jobs.find((job) => job.id === jobId)?.status,
              }))
            }
            onStep={async (stepId, done) =>
              !!(await d.command("set_job_step_done", { stepId, done }))
            }
            onAddStep={async (jobId, label) =>
              !!(await d.command("add_job_step", { jobId, label }))
            }
            onComment={async (jobId, body) =>
              !!(await d.command("add_job_comment", { jobId, body }))
            }
          />
          <ManagerJobTools />
        </div>
      )}
      {tab === "Requests" && (
        <div className="grid gap-5 lg:grid-cols-2">
          {!d.requests.length && (
            <p className="card-surface p-5 text-sm text-muted-foreground">No requests to review.</p>
          )}
          {d.requests.map((r) => (
            <section key={r.id} className="card-surface p-5">
              <div className="flex justify-between gap-2">
                <p className="text-xs text-muted-foreground">{names(r.employeeId)}</p>
                <StatusPill
                  tone={r.status === "pending" ? "warn" : r.status === "approved" ? "ok" : "bad"}
                >
                  {r.status}
                </StatusPill>
              </div>
              <h2 className="mt-3 font-bold">{r.summary}</h2>
              <p className="mt-2 text-sm">{r.detail || "No details shared."}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(r.submittedAt).toLocaleString()}
              </p>
              {r.kind === "correction" || r.kind === "missing_clocking" ? (
                <p className="mt-3 rounded-xl bg-tint-cream p-3 text-xs">
                  A decision records your response. Use the Corrections tab to review attendance
                  changes. Payable changes require the configured approval stages.
                </p>
              ) : null}
              {r.status === "pending" && r.employeeId !== d.me && (
                <div className="mt-4">
                  <RecordForm
                    title="Review request"
                    action="review_request"
                    extra={{ id: r.id }}
                    fields={[
                      {
                        name: "status",
                        label: "Decision",
                        options: [
                          { value: "approved", label: "Approve" },
                          { value: "declined", label: "Decline" },
                        ],
                      },
                      { name: "reason", label: "Reason" },
                    ]}
                  />
                </div>
              )}
              {r.reason && (
                <p className="mt-3 rounded-xl bg-muted p-3 text-sm">
                  {r.reviewer}: {r.reason}
                </p>
              )}
            </section>
          ))}
        </div>
      )}
      {tab === "Employees" && <EmployeeDirectory />}
      <Dialog open={showJobForm} onOpenChange={setShowJobForm}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogTitle>Create job</DialogTitle>
          <DialogDescription>
            Assign a location, work instructions and lunch plan to a worker’s shift.
          </DialogDescription>
          <ManagerJobBrief onSaved={() => setShowJobForm(false)} />
        </DialogContent>
      </Dialog>
    </ManagerFrame>
  );
}
