import { ManagerMap } from "@/components/app/ManagerMap";
import { currentWorkday } from "../../shared/workday";
import { canViewManagerSection } from "../../shared/permissions";
import { ManagerNotifications } from "@/components/app/ManagerNotifications";
import { ManagerRequests } from "@/components/app/ManagerRequests";
import { managerNotifications } from "../../shared/manager-notifications";
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
import { TaskTemplates } from "@/components/app/TaskTemplates";
import { taskTemplates, knowledge } from "@/lib/backend";
import { KnowledgeCentre } from "../../shared/KnowledgeCentre";
import { WorkerAccessPanel } from "@/components/app/WorkerAccessPanel";
import { KioskDesk } from "@/components/app/KioskDesk";
import { ManagerJobTools, ManagerMessages } from "@/components/app/TeamComms";
import { ManagerJobBoard } from "@/components/app/ManagerJobBoard";
import { ManagerNotes, ManagerReports, ManagerAttendance } from "@/components/app/ManagerPanels";
import { ManagerOverview } from "@/components/app/ManagerOverview";
import { WorkplaceReports } from "@/components/app/WorkplaceReports";
import { ManagerCalendar } from "@/components/app/ManagerCalendar";
import { ManagerInsights } from "@/components/app/ManagerInsights";
import { ManagerFrame } from "@/components/app/ManagerFrame";
import { managerGroups, type ManagerSection } from "@/components/app/manager-sections";

const TABS: ManagerSection[] = [
  ...managerGroups.flatMap((group) => group.items.map((item) => item.name)),
  "Settings",
  "Project management",
  "Views",
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
  const requestedTab = Route.useSearch().tab || "Overview";
  const tab = canViewManagerSection(d.accessRole, requestedTab) ? requestedTab : "Overview";
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
      accessRole={d.accessRole}
      active={tab}
      onSelect={setTab}
      company={d.company.name}
      logoUrl={d.company.logoUrl}
      managerName={d.employees.find((employee) => employee.id === d.me)?.name || "Manager"}
      insights={
        (!d.accessRole || d.accessRole === "owner") &&
        ["Tasks", "Overview", "Views"].includes(tab) ? (
          <ManagerInsights data={d} onSelect={setTab} />
        ) : undefined
      }
      onRefresh={() => void d.refresh()}
      notificationCount={
        d.unreadNotificationCount ?? managerNotifications(d).filter((item) => !item.read).length
      }
      onSignOut={() => void d.logout()}
    >
      {tab === "Overview" && <ManagerOverview data={d} onSelect={setTab} />}
      {tab === "Notes" && <ManagerNotes />}
      {tab === "Reports" && <ManagerReports />}
      {tab === "Workplace reports" && <WorkplaceReports />}
      {tab === "Attendance" && <ManagerAttendance />}
      {tab === "Map" && <ManagerMap />}
      {tab === "Project management" && (
        <div className="space-y-5">
          <ManagerJobBriefs onAdd={() => setShowJobForm(true)} />
          <ManagerJobTools />
        </div>
      )}
      {tab === "Settings" && (
        <>
          <SetupChecklist />
          <CompanySettings />
        </>
      )}
      {tab === "Corrections" && <CorrectionReview />}
      {tab === "Announcements" && (
        <div className="space-y-5">
          <CompanyNotices />
          <KnowledgeCentre
            rpc={knowledge}
            manager={!d.accessRole || ["owner", "hr"].includes(d.accessRole)}
            onChanged={() => void d.refresh()}
            refreshKey={d.requests}
          />
        </div>
      )}
      {tab === "Messages" && <ManagerMessages />}
      {tab === "Notifications" && <ManagerNotifications onSelect={setTab} />}
      {tab === "Employee Access" && (d.accessRole === "hr" ? <WorkerAccessPanel /> : <KioskDesk />)}
      {tab === "Views" && (
        <>
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
                <button
                  type="button"
                  onClick={() =>
                    setTab((["Employees", "Requests", "Reports", "Attendance"] as const)[index]!)
                  }
                  key={String(label)}
                  className={`card-surface p-5 text-left ${index === 0 ? "manager-lime-card" : ""}`}
                >
                  <I className="h-5 w-5" />
                  <p className="mt-5 text-xs font-semibold opacity-70">{String(label)}</p>
                  <p className="mt-1 text-[2.2rem] font-bold leading-none tracking-tight">
                    {String(count)}
                  </p>
                </button>
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
                  const shift = currentWorkday(d, e.id);
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
                          {shift ? `${shift.start}–${shift.end}` : "No workday recorded"}
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
              <p className="mt-3 text-sm">
                Company registration code:{" "}
                <strong className="select-all break-all font-mono">
                  {d.company.registrationCode}
                </strong>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Workers must enter this code to register with your company.
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
          {(!d.accessRole || ["owner", "operations"].includes(d.accessRole)) && (
            <TaskTemplates
              rpc={taskTemplates}
              jobs={d.jobs.filter((job) => job.status !== "completed")}
              onApplied={() => void d.refresh()}
            />
          )}
          <ManagerJobBriefs onAdd={() => setShowJobForm(true)} />
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
      {tab === "Requests" && <ManagerRequests />}
      {tab === "Employees" && <EmployeeDirectory />}
      <Dialog open={showJobForm} onOpenChange={setShowJobForm}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogTitle>Create job</DialogTitle>
          <DialogDescription>
            Add the job, its location and details. Select employees only when specific people are
            needed.
          </DialogDescription>
          <ManagerJobBrief onSaved={() => setShowJobForm(false)} />
        </DialogContent>
      </Dialog>
    </ManagerFrame>
  );
}
