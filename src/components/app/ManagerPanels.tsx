import { useState, type FormEvent } from "react";
import { CalendarClock, Clock3, NotebookPen, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecordForm } from "@/components/app/RecordForm";
import { useAttendance } from "@/lib/app-store";
import { PunctualityHistory } from "./Punctuality";
import { AttendanceIssues } from "../../../shared/AttendanceIssues";
import { attendanceContext, punctuality, availability } from "@/lib/backend";
import { EmployeeAvailability } from "../../../shared/EmployeeAvailability";
import { STATE_LABEL } from "@/lib/attendance";
import { ManagerOvertime } from "./ManagerOvertime";
import { currentWorkday } from "../../../shared/workday";

export function ManagerNotes() {
  const d = useAttendance();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (await d.command("add_manager_note", { title: title.trim(), body: body.trim() })) {
      setTitle("");
      setBody("");
    }
  };
  return (
    <div className="project-content-grid">
      <form onSubmit={save} className="project-panel project-note-form">
        <p className="project-panel-kicker">
          <NotebookPen size={16} /> PRIVATE NOTES
        </p>
        <h2>New note</h2>
        <label>
          Title
          <input
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What should your team remember?"
          />
        </label>
        <label>
          Details
          <textarea
            maxLength={4000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a note…"
          />
        </label>
        <Button disabled={d.busy || !d.online || !title.trim()}>
          <Plus size={16} /> Save note
        </Button>
      </form>
      <section className="project-panel">
        <h2>Saved notes</h2>
        <p className="project-panel-sub">Visible to managers in this company.</p>
        <div className="project-note-list">
          {d.managerNotes.map((note) => (
            <article key={note.id}>
              <div>
                <h3>{note.title}</h3>
                <button
                  aria-label={`Delete ${note.title}`}
                  disabled={d.busy || !d.online}
                  onClick={() => void d.command("delete_manager_note", { id: note.id })}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <p>{note.body}</p>
              <small>
                {note.authorName} · {new Date(note.createdAt).toLocaleString()}
              </small>
            </article>
          ))}
          {!d.managerNotes.length && <p className="project-empty">No notes yet.</p>}
        </div>
      </section>
    </div>
  );
}

export function ManagerReports() {
  const d = useAttendance();
  const [date, setDate] = useState(d.today);
  const shifts = d.shifts.filter((shift) => shift.date === date);
  const jobs = d.jobs.filter((job) => job.date === date);
  const events = d.events.filter((event) => shifts.some((shift) => shift.id === event.shiftId));
  const clocked = new Set(
    events.filter((event) => event.type === "clock_in").map((event) => event.employeeId),
  );
  return (
    <div className="project-panel">
      <div className="project-panel-head">
        <div>
          <p className="project-panel-kicker">OPERATIONS REPORT</p>
          <h2>Daily activity</h2>
          <p className="project-panel-sub">
            Recorded attendance and task progress for the selected date.
          </p>
        </div>
        <label className="project-date-control">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <div className="project-report-metrics">
        <article>
          <span>Workday records</span>
          <b>{shifts.length}</b>
        </article>
        <article>
          <span>Clocked in</span>
          <b>{clocked.size}</b>
        </article>
        <article>
          <span>Jobs</span>
          <b>{jobs.length}</b>
        </article>
        <article>
          <span>Completed</span>
          <b>{jobs.filter((job) => job.status === "completed").length}</b>
        </article>
      </div>
      <div className="project-report-table">
        <div className="project-report-row heading">
          <span>Employee</span>
          <span>Shift</span>
          <span>Clock in</span>
          <span>Clock out</span>
          <span>Recorded hours</span>
        </div>
        {shifts.map((shift) => {
          const employee = d.employees.find((item) => item.id === shift.employeeId);
          const shiftEvents = events.filter((event) => event.shiftId === shift.id);
          const first = shiftEvents.find((event) => event.type === "clock_in");
          const last = [...shiftEvents].reverse().find((event) => event.type === "clock_out");
          const time = (ms?: number) =>
            ms
              ? new Date(ms).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: d.company.timezone,
                })
              : "—";
          return (
            <div className="project-report-row" key={shift.id}>
              <span>{employee?.name || "Employee"}</span>
              <span>
                {shift.start}–{shift.end}
              </span>
              <span>{time(first?.capturedAt)}</span>
              <span>{time(last?.capturedAt)}</span>
              <span>
                {Math.floor(shift.totals.recordedMinutes / 60)}h {shift.totals.recordedMinutes % 60}
                m
              </span>
            </div>
          );
        })}
        {!shifts.length && <p className="project-empty">No shifts on this date.</p>}
      </div>
    </div>
  );
}

export function ManagerAttendance() {
  const d = useAttendance();
  const staff = d.employees.filter((employee) => employee.role === "employee");
  return (
    <div className="space-y-5">
      <ManagerOvertime />
      <PunctualityHistory />
      <AttendanceIssues
        key={d.company.id}
        data={d}
        rpc={attendanceContext}
        readPunctuality={punctuality}
        manager
      />
      <EmployeeAvailability
        rpc={availability}
        manager
        employees={d.employees}
        onChanged={() => void d.refresh()}
        refreshKey={d.requests}
      />
      <div className="project-panel">
        <p className="project-panel-kicker">
          <Clock3 size={16} /> LIVE ATTENDANCE
        </p>
        <h2>Clock in and clock out</h2>
        <p className="project-panel-sub">
          Today’s activity from the worker app. Times are shown in {d.company.timezone}.
        </p>
        <div className="project-attendance-grid">
          {staff.map((employee) => {
            const shift = currentWorkday(d, employee.id);
            const events = d.events.filter((event) => event.shiftId === shift?.id);
            const state =
              d.states.find((item) => item.shiftId === shift?.id)?.state || "not_clocked_in";
            const clockIn = events.find((event) => event.type === "clock_in");
            const clockOut = [...events].reverse().find((event) => event.type === "clock_out");
            const time = (ms?: number) =>
              ms
                ? new Date(ms).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: d.company.timezone,
                  })
                : "—";
            return (
              <article key={employee.id}>
                <div>
                  <b>{employee.name}</b>
                  <span className={`project-state ${state}`}>{STATE_LABEL[state]}</span>
                </div>
                <p>
                  {shift
                    ? `${shift.start}–${shift.end} · ${d.sites.find((site) => site.id === shift.siteId)?.name || "Site"}`
                    : "No shift assigned"}
                </p>
                <footer>
                  <span>
                    In <strong>{time(clockIn?.capturedAt)}</strong>
                  </span>
                  <span>
                    Out <strong>{time(clockOut?.capturedAt)}</strong>
                  </span>
                </footer>
              </article>
            );
          })}
          {!staff.length && <p className="project-empty">Add workers to see attendance.</p>}
        </div>
      </div>
      <section className="project-panel">
        <h2>Timesheets awaiting review</h2>
        <div className="project-timesheet-list">
          {d.timesheets
            .filter((sheet) => sheet.status === "submitted")
            .map((sheet) => {
              const shift = d.shifts.find((item) => item.id === sheet.shiftId);
              const name =
                d.employees.find((item) => item.id === sheet.employeeId)?.name || "Employee";
              return (
                <div key={sheet.shiftId}>
                  <p>
                    <b>{name}</b> · {shift?.date} · {shift?.totals.workedMinutes || 0} worked
                    minutes
                  </p>
                  {(!d.accessRole || d.accessRole === "owner") && (
                    <RecordForm
                      title="Approve hours"
                      action="approve_timesheet"
                      label="Approve"
                      extra={{ shiftId: sheet.shiftId }}
                      fields={[
                        {
                          name: "overtimeMinutes",
                          label: "Overtime approved (minutes)",
                          type: "number",
                          value: sheet.overtimeRequested,
                          min: 0,
                          max: sheet.overtimeRequested,
                        },
                      ]}
                    />
                  )}
                </div>
              );
            })}
          {!d.timesheets.some((sheet) => sheet.status === "submitted") && (
            <p className="project-empty">No timesheets awaiting review.</p>
          )}
        </div>
      </section>
    </div>
  );
}
