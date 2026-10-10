import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Users, CalendarClock, Inbox, Clock3 } from "lucide-react";
import { StatusPill } from "@/components/app/EmployeeShell";
import { Button } from "@/components/ui/button";
import { RecordForm, type Field } from "@/components/app/RecordForm";
import { useAttendance } from "@/lib/app-store";
import { STATE_LABEL } from "@/lib/attendance";
import { CompanySettings, SetupChecklist } from "@/components/app/CompanySettings";
import { CorrectionReview } from "@/components/app/CorrectionReview";
import { CompanyNotices, SiteAlerts } from "@/components/app/WorkdayOperations";
import { KioskDesk } from "@/components/app/KioskDesk";
import { ManagerJobTools, ManagerMessages } from "@/components/app/TeamComms";
import { ManagerJobBoard } from "@/components/app/ManagerJobBoard";
import {
  ManagerNotes,
  ManagerReports,
  ManagerAttendance,
  ManagerSiteMap,
} from "@/components/app/ManagerPanels";
import { ManagerFrame } from "@/components/app/ManagerFrame";
import { managerGroups, type ManagerSection } from "@/components/app/manager-sections";

const TABS = managerGroups.flatMap((group) => group.items.map((item) => item.name));
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
  const [activation, setActivation] = useState<{
    activationCode: string;
    employeeId: string;
  } | null>(null);
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
  const employeeOptions = staff.map((e) => ({ value: e.id, label: `${e.name} · ${e.no}` }));
  const siteOptions = d.sites.map((s) => ({ value: s.id, label: s.name }));
  const shiftOptions = d.shifts
    .filter((s) => s.employeeId !== d.me)
    .map((s) => ({ value: s.id, label: `${names(s.employeeId)} · ${s.date}` }));
  const employeeFields: Field[] = [
    { name: "name", label: "Full name" },
    { name: "no", label: "Employee number" },
    { name: "team", label: "Team", optional: true },
    { name: "siteId", label: "Work site", options: siteOptions },
  ];
  return (
    <ManagerFrame
      active={tab}
      onSelect={setTab}
      company={d.company.name || "Project Inc."}
      onRefresh={() => void d.refresh()}
      onSignOut={() => void d.logout()}
    >
      {tab === "Notes" && <ManagerNotes />}
      {tab === "Reports" && <ManagerReports />}
      {tab === "Attendance" && <ManagerAttendance />}
      {tab === "Map" && <ManagerSiteMap />}
      {tab === "Project management" && <ManagerJobTools />}
      {tab === "Policies" && <CompanySettings />}
      {tab === "Corrections" && <CorrectionReview />}
      {tab === "Announcements" && <CompanyNotices />}
      {tab === "Messages" && <ManagerMessages />}
      {tab === "Kiosk" && <KioskDesk />}
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
                  <p className="text-sm text-muted-foreground">
                    Add your first employee in Employees.
                  </p>
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
            <RecordForm
              title="Add employee"
              action="create_employee"
              label="Create activation code"
              fields={employeeFields}
              onSaved={(result) => {
                if (result.activationCode && result.employeeId)
                  setActivation({
                    activationCode: result.activationCode,
                    employeeId: result.employeeId,
                  });
              }}
            />
            {activation && (
              <section role="status" className="card-surface bg-tint-cream p-5">
                <h2 className="font-bold">One-time activation code</h2>
                <p className="mt-2 text-sm">
                  {names(activation.employeeId)} · employee no.{" "}
                  {d.employees.find((e) => e.id === activation.employeeId)?.no}
                </p>
                <code className="mt-3 block break-all rounded-xl bg-card p-3 text-sm select-all">
                  {activation.activationCode}
                </code>
                <p className="mt-3 text-xs">
                  Share this code privately with the employee. It expires in 48 hours and can be
                  used once.
                </p>
                <Button variant="ghost" className="mt-3" onClick={() => setActivation(null)}>
                  Hide code
                </Button>
              </section>
            )}
            <RecordForm
              title="Add site"
              action="create_site"
              fields={[
                { name: "name", label: "Site name" },
                { name: "address", label: "Address", optional: true },
              ]}
            />
          </div>
          <section className="card-surface p-5">
            <h2 className="text-lg font-bold">Your team</h2>
            <div className="mt-4 space-y-3">
              {!staff.length && <p className="text-sm text-muted-foreground">No employees yet.</p>}
              {staff.map((e) => (
                <article key={e.id} className="rounded-2xl bg-muted p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold">{e.name}</h3>
                    <StatusPill tone={e.activated ? "ok" : "warn"}>
                      {e.activated ? "Activated" : "Invited"}
                    </StatusPill>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {e.no} · {e.team || "No team"} · {d.sites.find((s) => s.id === e.siteId)?.name}
                  </p>
                  {!e.activated && (
                    <Button
                      variant="chip"
                      className="mt-3"
                      disabled={d.busy}
                      onClick={async () => {
                        const r = await d.command("issue_activation", { employeeId: e.id });
                        if (r?.activationCode)
                          setActivation({ activationCode: r.activationCode, employeeId: e.id });
                      }}
                    >
                      Replace activation code
                    </Button>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
      {tab === "Calendar" && (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-5">
              {staff.length ? (
                <RecordForm
                  title="Assign shift"
                  action="assign_shift"
                  fields={[
                    { name: "employeeId", label: "Employee", options: employeeOptions },
                    { name: "siteId", label: "Site", options: siteOptions },
                    { name: "date", label: "Date", type: "date", value: d.today },
                    { name: "start", label: "Shift starts", type: "time", value: "08:00" },
                    { name: "end", label: "Shift ends", type: "time", value: "17:00" },
                    { name: "lunch", label: "Lunch starts", type: "time", value: "12:00" },
                    {
                      name: "lunchMinutes",
                      label: "Unpaid lunch (minutes)",
                      type: "number",
                      value: 60,
                      min: 0,
                      max: 120,
                    },
                    {
                      name: "regularMinutes",
                      label: "Regular work (minutes)",
                      type: "number",
                      value: 480,
                      min: 1,
                      max: 1440,
                    },
                  ]}
                />
              ) : (
                <p className="card-surface p-5 text-sm">Add an employee before assigning shifts.</p>
              )}
            </div>
            <section className="card-surface p-5">
              <h2 className="text-lg font-bold">Scheduled shifts</h2>
              <div className="mt-4 space-y-3">
                {!d.shifts.length && (
                  <p className="text-sm text-muted-foreground">No shifts assigned.</p>
                )}
                {d.shifts.map((s) => (
                  <article key={s.id} className="rounded-2xl bg-muted p-4">
                    <h3 className="font-bold">{names(s.employeeId)}</h3>
                    <p className="mt-1 text-sm">
                      {s.date} · {s.start}–{s.end}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {d.sites.find((site) => site.id === s.siteId)?.name} · {s.lunchMinutes} minute
                      lunch
                    </p>
                    {d.jobs
                      .filter((j) => j.shiftId === s.id)
                      .map((j) => (
                        <p key={j.id} className="mt-2 rounded-xl bg-tint-blue p-2 text-xs">
                          {j.start}–{j.end} · {j.title} · {j.destination}
                        </p>
                      ))}
                  </article>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
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
            onComment={async (jobId, body) =>
              !!(await d.command("add_job_comment", { jobId, body }))
            }
          />
          {showJobForm &&
            (shiftOptions.length > 0 ? (
              <RecordForm
                title="Assign job"
                action="create_job"
                fields={[
                  { name: "shiftId", label: "Assigned shift", options: shiftOptions },
                  { name: "title", label: "Job title" },
                  { name: "destination", label: "Destination" },
                  { name: "instructions", label: "Instructions", optional: true },
                  { name: "start", label: "Starts", type: "time", value: "14:00" },
                  { name: "end", label: "Ends", type: "time", value: "15:00" },
                ]}
              />
            ) : (
              <p className="card-surface p-5 text-sm">Assign a shift before creating a job.</p>
            ))}
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
      {tab === "Audit" && (
        <section className="card-surface p-5">
          <h2 className="text-lg font-bold">Audit history</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Last 100 actions. Attendance events are retained separately.
          </p>
          <div className="mt-4 divide-y divide-border">
            {d.audit.map((a) => (
              <article key={a.id} className="py-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    {a.actor} · {a.action.replaceAll("_", " ")}
                  </h3>
                  <p className="text-xs text-muted-foreground">{new Date(a.at).toLocaleString()}</p>
                </div>
                <p className="mt-2 break-all text-xs text-muted-foreground">{a.detail}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </ManagerFrame>
  );
}
