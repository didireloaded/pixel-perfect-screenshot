import { ThemedSelect } from "../../../shared/ThemedSelect";
import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { AttendanceSnapshot } from "../../../shared/attendance";
const day = (value: string) => new Date(`${value}T12:00:00Z`);
const add = (value: string, count: number) => {
  const next = day(value);
  next.setUTCDate(next.getUTCDate() + count);
  return next.toISOString().slice(0, 10);
};
export function ManagerCalendar({
  data,
}: {
  data: Pick<AttendanceSnapshot, "today" | "shifts" | "employees" | "sites" | "jobs" | "notices">;
}) {
  const [selected, setSelected] = useState(data.today);
  const [mode, setMode] = useState<"month" | "week">("month");
  const anchor = mode === "month" ? `${selected.slice(0, 7)}-01` : selected;
  const first = add(anchor, -((day(anchor).getUTCDay() + 6) % 7));
  const dates = Array.from({ length: mode === "month" ? 42 : 7 }, (_, index) => add(first, index));
  const move = (direction: number) => {
    if (mode === "week") setSelected(add(selected, direction * 7));
    else {
      const next = day(`${selected.slice(0, 7)}-01`);
      next.setUTCMonth(next.getUTCMonth() + direction);
      setSelected(next.toISOString().slice(0, 10));
    }
  };
  const shifts = data.shifts.filter((shift) => shift.date === selected);
  const names = (id: string) =>
    data.employees.find((employee) => employee.id === id)?.name ?? "Employee";
  return (
    <section className="manager-calendar">
      <div className="manager-calendar-toolbar">
        <div>
          <h2>
            {day(selected).toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
          </h2>
          <p>Worker attendance, jobs and company events</p>
        </div>
        <div>
          <ThemedSelect
            aria-label="Calendar view"
            value={mode}
            onValueChange={(value) => setMode(value as "month" | "week")}
          >
            <option value="month">Month</option>
            <option value="week">Week</option>
          </ThemedSelect>
          <button
            className="project-icon-button"
            aria-label="Previous period"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button className="manager-calendar-today" onClick={() => setSelected(data.today)}>
            Today
          </button>
          <button className="project-icon-button" aria-label="Next period" onClick={() => move(1)}>
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div className={`manager-week-grid ${mode === "month" ? "month-view" : ""}`}>
        {dates.map((date) => (
          <section key={date} className={selected === date ? "selected" : ""}>
            <button
              className="manager-week-day"
              aria-pressed={selected === date}
              onClick={() => setSelected(date)}
            >
              <span>
                {day(date).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}
              </span>
              <b>{day(date).getUTCDate()}</b>
              {date === data.today && <small>Today</small>}
            </button>
            <div className="manager-week-items">
              {data.shifts
                .filter((shift) => shift.date === date)
                .map((shift) => (
                  <button
                    key={shift.id}
                    aria-label={`View ${names(shift.employeeId)} attendance on ${date}`}
                    onClick={() => {
                      setSelected(date);
                    }}
                  >
                    <b>{names(shift.employeeId)}</b>
                    <small>
                      {shift.start}–{shift.end}
                    </small>
                    <span>{data.sites.find((site) => site.id === shift.siteId)?.name}</span>
                  </button>
                ))}
              {data.jobs
                .filter((job) => job.date === date)
                .map((job) => (
                  <button className="calendar-job" key={job.id} onClick={() => setSelected(date)}>
                    <b>{job.title}</b>
                    <small>
                      {job.start} · {job.status.replaceAll("_", " ")}
                    </small>
                    <span>{job.destination}</span>
                  </button>
                ))}
              {data.notices
                .filter((notice) => notice.startsOn <= date && notice.endsOn >= date)
                .map((notice) => (
                  <span className="manager-week-notice" key={notice.id}>
                    {notice.title}
                  </span>
                ))}
            </div>
          </section>
        ))}
      </div>
      <div className="manager-calendar-detail">
        <div className="project-panel-head">
          <div>
            <h3>
              {day(selected).toLocaleDateString("en-US", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: "UTC",
              })}
            </h3>
            <p>{shifts.length} attendance records</p>
          </div>
          <CalendarDays size={21} />
        </div>
        {data.jobs
          .filter((job) => job.date === selected)
          .map((job) => (
            <article key={job.id}>
              <div>
                <b>{job.title}</b>
                <small>
                  {job.destination} · {names(job.assignee)}
                </small>
              </div>
              <time>
                {job.start}–{job.end}
              </time>
            </article>
          ))}
        {!shifts.length && (
          <div className="project-empty">
            No attendance records for this day. Workers check in to start their workday.
          </div>
        )}
        {shifts.map((shift) => (
          <article key={shift.id}>
            <span className="manager-calendar-initial">
              {names(shift.employeeId)
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)}
            </span>
            <div>
              <b>{names(shift.employeeId)}</b>
              <small>
                {data.sites.find((site) => site.id === shift.siteId)?.name} · {shift.lunchMinutes}{" "}
                minute lunch
              </small>
              {data.jobs
                .filter((job) => job.shiftId === shift.id)
                .map((job) => (
                  <p key={job.id}>
                    {job.start} · {job.title}
                  </p>
                ))}
            </div>
            <time>
              {shift.start}–{shift.end}
            </time>
          </article>
        ))}
      </div>
    </section>
  );
}
