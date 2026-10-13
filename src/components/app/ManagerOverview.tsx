import type { Job, Shift, Employee, AttendanceEvent } from "../../../shared/attendance";
import type { ManagerSection } from "./manager-sections";
export function ManagerOverview({
  jobs,
  shifts,
  employees,
  events,
  today,
  onSelect,
}: {
  jobs: Job[];
  shifts: Shift[];
  employees: Employee[];
  events: AttendanceEvent[];
  today: string;
  onSelect: (section: ManagerSection) => void;
}) {
  const completed = jobs.filter((job) => job.status === "completed");
  const days = [...new Set([...jobs.map((job) => job.date), ...shifts.map((shift) => shift.date)])]
    .sort()
    .reverse()
    .slice(0, 7);
  return (
    <div className="manager-overview">
      <div className="overview-metrics">
        {[
          ["Team members", employees.length, "Team"],
          ["Active tasks", jobs.filter((job) => job.status === "in_progress").length, "Tasks"],
          ["Completed work", completed.length, "Reports"],
          [
            "Recorded hours",
            Math.round(shifts.reduce((sum, shift) => sum + shift.totals.workedMinutes, 0) / 60),
            "Attendance",
          ],
        ].map(([label, value, section]) => (
          <button key={label} onClick={() => onSelect(section as ManagerSection)}>
            <span>{label}</span>
            <b>{value}</b>
            <small>View details →</small>
          </button>
        ))}
      </div>
      <div className="overview-two">
        <section className="project-panel">
          <h2>Work across the week</h2>
          <p className="project-panel-sub">Current assignments and past delivery</p>
          {days.map((date) => (
            <div className="overview-history" key={date}>
              <b>{date === today ? "Today" : date}</b>
              <div>
                {jobs.filter((job) => job.date === date).length} jobs ·{" "}
                {jobs.filter((job) => job.date === date && job.status === "completed").length}{" "}
                completed
                <progress
                  max={Math.max(1, jobs.filter((job) => job.date === date).length)}
                  value={
                    jobs.filter((job) => job.date === date && job.status === "completed").length
                  }
                />
              </div>
            </div>
          ))}
        </section>
        <section className="project-panel">
          <h2>Upcoming work</h2>
          {jobs
            .filter((job) => job.date >= today && job.status !== "completed")
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(0, 5)
            .map((job) => (
              <button className="overview-list-row" key={job.id} onClick={() => onSelect("Tasks")}>
                <b>{job.title}</b>
                <span>
                  {job.date} · {job.destination}
                </span>
              </button>
            ))}
          <h3>Recent attendance</h3>
          {[...events]
            .sort((a, b) => b.capturedAt - a.capturedAt)
            .slice(0, 5)
            .map((event) => (
              <div className="overview-list-row" key={event.id}>
                <b>{employees.find((person) => person.id === event.employeeId)?.name}</b>
                <span>
                  {event.type.replaceAll("_", " ")} · {new Date(event.capturedAt).toLocaleString()}
                </span>
              </div>
            ))}
        </section>
      </div>
      <section className="project-panel">
        <h2>Completed work archive</h2>
        <div className="overview-project-grid">
          {completed.map((job) => (
            <article key={job.id}>
              <span className="manager-task-tag purple">Completed</span>
              <h3>{job.title}</h3>
              <p>{job.instructions}</p>
              <small>
                {job.date} · {job.destination}
              </small>
            </article>
          ))}
        </div>
        {!completed.length && <p>No completed jobs yet.</p>}
      </section>
    </div>
  );
}
