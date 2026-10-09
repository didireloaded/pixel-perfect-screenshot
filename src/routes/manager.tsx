import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Users,
  CalendarClock,
  Inbox,
  Clock3,
  ArrowLeft,
  LockKeyhole,
  Download,
  ShieldCheck,
} from "lucide-react";
import { ConnectionBanner, StatusPill } from "@/components/app/EmployeeShell";
import { Button } from "@/components/ui/button";
import { RecordForm, type Field } from "@/components/app/RecordForm";
import { useAttendance } from "@/lib/app-store";
import { deriveState, STATE_LABEL, fmtMin } from "@/lib/attendance";
import { downloadPayroll } from "@/lib/payroll-export";
export const Route = createFileRoute("/manager")({ component: Manager });
import { CompanySettings, SetupChecklist } from "@/components/app/CompanySettings";
import { CorrectionReview } from "@/components/app/CorrectionReview";
import { CompanyNotices, GrossPayroll, SiteAlerts } from "@/components/app/WorkdayOperations";
import { KioskDesk } from "@/components/app/KioskDesk";
import { ManagerJobTools, ManagerMessages } from "@/components/app/TeamComms";

const TABS = [
  "Overview",
  "Employees",
  "Schedule",
  "Requests",
  "Payroll",
  "Audit",
  "Policies",
  "Corrections",
  "News & events",
  "Messages",
  "Kiosk",
] as const;
function Manager() {
  const d = useAttendance();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
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
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-8">
      <header className="card-surface flex flex-wrap items-center gap-4 p-5">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft text-primary">
          <ShieldCheck />
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">{d.company.name}</p>
          <h1 className="text-xl font-bold">Manager dashboard</h1>
        </div>
        <Button variant="pill" asChild>
          <Link to="/">
            <ArrowLeft /> Employee view
          </Link>
        </Button>
        <Button variant="ghost" onClick={() => void d.logout()}>
          Sign out
        </Button>
      </header>
      <div className="my-4">
        <ConnectionBanner />
      </div>
      <nav aria-label="Manager" className="mb-5 flex gap-2 overflow-x-auto pb-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-current={tab === t ? "page" : undefined}
            className={`shrink-0 rounded-full px-5 py-3 text-sm font-semibold ${tab === t ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
          >
            {t}
          </button>
        ))}
      </nav>
      {tab === "Policies" && <CompanySettings />}
      {tab === "Corrections" && <CorrectionReview />}
      {tab === "News & events" && <CompanyNotices />}
      {tab === "Messages" && <ManagerMessages />}
      {tab === "Kiosk" && <KioskDesk />}
      {tab === "Overview" && (
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
            ].map(([Icon, label, count]) => {
              const I = Icon as typeof Users;
              return (
                <section key={String(label)} className="card-surface p-5">
                  <I className="h-5 w-5 text-primary" />
                  <p className="mt-3 text-xs text-muted-foreground">{String(label)}</p>
                  <p className="mt-1 text-3xl font-bold">{String(count)}</p>
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
                    <Button variant="soft" className="w-full" onClick={() => setTab("Payroll")}>
                      Review {submitted.length} timesheets
                    </Button>
                  )}
                </div>
              )}
            </section>
          </div>
        </>
      )}
      {tab === "Employees" && (
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
      {tab === "Schedule" && (
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
              {shiftOptions.length > 0 && (
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
          <ManagerJobTools />
        </>
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
      {tab === "Payroll" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <GrossPayroll />
            {d.shifts.map((s) => {
              const t = d.timesheets.find((t) => t.shiftId === s.id);
              return (
                <section key={s.id} className="card-surface p-5">
                  <div className="flex justify-between gap-2">
                    <h2 className="font-bold">{names(s.employeeId)}</h2>
                    <StatusPill
                      tone={
                        t?.status === "approved"
                          ? "ok"
                          : t?.status === "submitted"
                            ? "warn"
                            : "muted"
                      }
                    >
                      {t?.status || "open"}
                    </StatusPill>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {s.date} · {s.totals.complete ? "Complete shift" : "Awaiting clock-out"}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-tint-blue p-3">
                      <p className="text-xs">Regular time</p>
                      <p className="font-bold">{fmtMin(s.totals.regularMinutes)}</p>
                    </div>
                    <div className="rounded-2xl bg-tint-cream p-3">
                      <p className="text-xs">Overtime requested</p>
                      <p className="font-bold">{fmtMin(t?.overtimeRequested || 0)}</p>
                    </div>
                  </div>
                  {t?.status === "submitted" && s.employeeId !== d.me && (
                    <div className="mt-4">
                      <RecordForm
                        title="Approve timesheet"
                        action="approve_timesheet"
                        label="Approve hours"
                        extra={{ shiftId: s.id }}
                        fields={[
                          {
                            name: "overtimeMinutes",
                            label: "Overtime approved (minutes)",
                            type: "number",
                            value: t.overtimeRequested,
                            min: 0,
                            max: t.overtimeRequested,
                          },
                        ]}
                      />
                    </div>
                  )}
                </section>
              );
            })}
            {!d.shifts.length && (
              <p className="card-surface p-5 text-sm text-muted-foreground">
                Timesheets appear after shifts are assigned.
              </p>
            )}
          </div>
          <div className="space-y-5">
            <RecordForm
              title="Lock payroll period"
              action="lock_period"
              label="Lock approved period"
              fields={[
                { name: "start", label: "First date", type: "date", value: d.today },
                { name: "end", label: "Last date", type: "date", value: d.today },
              ]}
            />
            <p className="px-2 text-xs text-muted-foreground">
              All shifts in the period must be complete and approved. Locked periods cannot accept
              further attendance changes. CSVs contain approved minutes, not calculated pay.
            </p>
            <section className="card-surface p-5">
              <h2 className="text-lg font-bold">Locked exports</h2>
              {!d.periods.length && (
                <p className="mt-3 text-sm text-muted-foreground">No locked payroll periods yet.</p>
              )}
              {d.periods.map((p) => (
                <article key={p.id} className="mt-4 rounded-2xl bg-tint-mint p-4">
                  <p className="flex items-center gap-2 text-sm font-bold">
                    <LockKeyhole className="h-4 w-4" />
                    {p.start}–{p.end}
                  </p>
                  <Button
                    variant="pill"
                    className="mt-3 w-full"
                    disabled={d.busy}
                    onClick={async () => {
                      const result = await d.command("export_period", { id: p.id });
                      if (result?.rows)
                        downloadPayroll(result.rows, `shiftline-${p.start}-${p.end}.csv`);
                    }}
                  >
                    <Download /> Download CSV
                  </Button>
                </article>
              ))}
            </section>
          </div>
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
    </div>
  );
}
