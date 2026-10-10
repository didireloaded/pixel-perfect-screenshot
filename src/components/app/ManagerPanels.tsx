import { useState, type FormEvent } from "react";
import { CalendarClock, Clock3, MapPin, NotebookPen, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecordForm } from "@/components/app/RecordForm";
import { useAttendance } from "@/lib/app-store";
import { STATE_LABEL } from "@/lib/attendance";

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
          <span>Scheduled</span>
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
          <span>Worked</span>
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
                {Math.floor(shift.totals.workedMinutes / 60)}h {shift.totals.workedMinutes % 60}m
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
            const shift = d.shifts.find(
              (item) => item.employeeId === employee.id && item.date === d.today,
            );
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

export function ManagerSiteMap() {
  const d = useAttendance();
  const [siteId, setSiteId] = useState("");
  const site = d.sites.find((item) => item.id === siteId) || d.sites[0];
  const checked = d.sitePresence.filter((presence) => presence.siteId === site?.id);
  const siteShifts = d.shifts.filter(
    (shift) => shift.siteId === site?.id && shift.date === d.today,
  );
  const bbox =
    site?.latitude != null && site.longitude != null
      ? `${site.longitude - 0.01},${site.latitude - 0.007},${site.longitude + 0.01},${site.latitude + 0.007}`
      : null;
  return (
    <div className="project-map-layout">
      <section className="project-panel">
        <div className="project-panel-head">
          <div>
            <p className="project-panel-kicker">
              <MapPin size={16} /> WORKSITE MAP
            </p>
            <h2>Team locations</h2>
            <p className="project-panel-sub">
              Confirmed worksite checks during active shifts. No off-duty tracking.
            </p>
          </div>
          <select
            aria-label="Choose worksite"
            value={site?.id || ""}
            onChange={(e) => setSiteId(e.target.value)}
          >
            {d.sites.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        {bbox && site ? (
          <iframe
            className="project-map-frame"
            title={`Map of ${site.name}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${site.latitude},${site.longitude}`)}`}
          />
        ) : (
          <div className="project-map-empty">
            <MapPin size={28} />
            <p>Set the worksite coordinates in Policies to show it on the map.</p>
          </div>
        )}
        <p className="project-map-caption">
          Map shows the worksite marker. Individual GPS coordinates are never shown or retained.
        </p>
      </section>
      <section className="project-panel project-map-roster">
        <h2>{site?.name || "Worksite"}</h2>
        <p className="project-panel-sub">
          {checked.filter((item) => item.inside).length} recently confirmed on site
        </p>
        {siteShifts.map((shift) => {
          const employee = d.employees.find((item) => item.id === shift.employeeId);
          const presence = checked.find((item) => item.employeeId === shift.employeeId);
          const state = d.states.find((item) => item.shiftId === shift.id)?.state;
          return (
            <article key={shift.id}>
              <span className="project-presence-avatar">
                {employee?.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")}
              </span>
              <div>
                <b>{employee?.name || "Worker"}</b>
                <p>
                  {presence
                    ? presence.inside
                      ? "Confirmed on site"
                      : "Outside worksite"
                    : state === "working"
                      ? "No recent location check"
                      : state
                        ? STATE_LABEL[state]
                        : "Not clocked in"}
                </p>
                {presence && (
                  <small>
                    Checked{" "}
                    {new Date(presence.checkedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                )}
              </div>
              <span
                className={`project-presence-dot ${presence?.inside ? "inside" : presence ? "outside" : "unknown"}`}
              />
            </article>
          );
        })}
        {!siteShifts.length && <p className="project-empty">No workers scheduled here today.</p>}
      </section>
    </div>
  );
}
