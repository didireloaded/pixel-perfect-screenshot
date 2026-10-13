import { Users, UserCheck, CalendarDays, Clock3, Megaphone, ArrowUpRight } from "lucide-react";
import type { AttendanceSnapshot } from "../../../shared/attendance";
import { hrSummary } from "../../../shared/hr-summary";
import { calendarJobs } from "../../../shared/calendar-jobs";
import type { ManagerSection } from "./manager-sections";
export function ManagerOverview({
  data,
  onSelect,
}: {
  data: AttendanceSnapshot;
  onSelect: (section: ManagerSection) => void;
}) {
  const summary = hrSummary(data);
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(`${data.today}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() - 6 + i);
    return day.toISOString().slice(0, 10);
  });
  const name = (id: string) =>
    data.employees.find((employee) => employee.id === id)?.name ?? "Employee";
  const upcoming = calendarJobs(data)
    .filter((job) => job.date >= data.today)
    .slice(0, 5);
  const notices = data.notices.filter(
    (notice) => notice.startsOn <= data.today && notice.endsOn >= data.today,
  );
  const metrics = [
    {
      label: "Total employees",
      value: summary.employees.length,
      section: "Employees",
      icon: Users,
    },
    {
      label: "Checked in today",
      value: summary.present.size,
      section: "Attendance",
      icon: UserCheck,
    },
    {
      label: "Awaiting check-in",
      value: summary.awaiting.length,
      section: "Attendance",
      icon: Clock3,
    },
    {
      label: "Approved full-day leave",
      value: summary.onLeave.size,
      section: "Requests",
      icon: CalendarDays,
    },
  ] as const;
  return (
    <div className="manager-overview">
      <div className="overview-metrics">
        {metrics.map((metric) => (
          <button key={metric.label} onClick={() => onSelect(metric.section)}>
            <metric.icon size={21} />
            <span>{metric.label}</span>
            <b>{metric.value}</b>
            <small>
              View details <ArrowUpRight size={12} className="inline" />
            </small>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Attendance comes from recorded clock-ins. Awaiting check-in is not confirmed absence.
        Undated legacy requests are excluded from today's leave count.
      </p>
      <div className="overview-two">
        <section className="project-panel">
          <div className="project-panel-head">
            <div>
              <h2>Attendance overview</h2>
              <p className="project-panel-sub">Last seven days · recorded work hours</p>
            </div>
            <button className="sl-map-tool" onClick={() => onSelect("Reports")}>
              View report
            </button>
          </div>
          <div className="mt-5 space-y-4">
            {days.map((date) => {
              const total = data.shifts
                .filter((shift) => shift.date === date)
                .reduce((sum, shift) => sum + shift.totals.recordedMinutes, 0);
              const count = data.shifts.filter(
                (shift) =>
                  shift.date === date &&
                  data.events.some(
                    (event) => event.shiftId === shift.id && event.type === "clock_in",
                  ),
              ).length;
              return (
                <div key={date} className="overview-history">
                  <b>
                    {date === data.today
                      ? "Today"
                      : new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
                          weekday: "short",
                          day: "numeric",
                          timeZone: "UTC",
                        })}
                  </b>
                  <div>
                    <span>
                      {count} checked in · {(total / 60).toFixed(1)} hours
                    </span>
                    <progress
                      aria-label={`Recorded hours on ${date}`}
                      max={Math.max(
                        1,
                        ...days.map((day) =>
                          data.shifts
                            .filter((shift) => shift.date === day)
                            .reduce((sum, shift) => sum + shift.totals.recordedMinutes, 0),
                        ),
                      )}
                      value={total}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <section className="project-panel">
          <div className="project-panel-head">
            <div>
              <h2>Leave applications</h2>
              <p className="project-panel-sub">{summary.pendingLeave.length} awaiting review</p>
            </div>
            <button className="sl-map-tool" onClick={() => onSelect("Requests")}>
              See details
            </button>
          </div>
          {data.requests
            .filter((request) => request.kind === "leave")
            .slice(0, 5)
            .map((request) => (
              <button
                className="overview-list-row"
                key={request.id}
                onClick={() => onSelect("Requests")}
              >
                <b>{name(request.employeeId)}</b>
                <span>{request.summary}</span>
                <small>
                  {request.leaveStart
                    ? `${request.leaveStart}–${request.leaveEnd}`
                    : "Dates not supplied"}{" "}
                  · {request.status}
                </small>
              </button>
            ))}
          {!data.requests.some((request) => request.kind === "leave") && (
            <p className="project-empty">No leave applications yet.</p>
          )}
        </section>
      </div>
      <div className="overview-two">
        <section className="project-panel">
          <div className="project-panel-head">
            <h2 className="flex gap-2 items-center">
              <Megaphone size={18} /> Company notices
            </h2>
            <button className="sl-map-tool" onClick={() => onSelect("Announcements")}>
              See details
            </button>
          </div>
          {notices.slice(0, 4).map((notice) => (
            <button
              className="overview-list-row"
              key={notice.id}
              onClick={() => onSelect("Announcements")}
            >
              <b>{notice.title}</b>
              <span className="line-clamp-2">{notice.body}</span>
              <small>
                {notice.startsOn}–{notice.endsOn}
              </small>
            </button>
          ))}
          {!notices.length && <p className="project-empty">No current notices.</p>}
        </section>
        <section className="project-panel">
          <div className="project-panel-head">
            <h2>Upcoming jobs</h2>
            <button className="sl-map-tool" onClick={() => onSelect("Calendar")}>
              Open calendar
            </button>
          </div>
          {upcoming.map((job) => (
            <button className="overview-list-row" key={job.id} onClick={() => onSelect("Calendar")}>
              <b>{job.title}</b>
              <span>
                {job.date} ·{" "}
                {job.assignedNames.length ? job.assignedNames.join(", ") : "Optional assignment"}
              </span>
            </button>
          ))}
          {!upcoming.length && <p className="project-empty">No upcoming jobs.</p>}
        </section>
      </div>
      <section className="project-panel">
        <div className="project-panel-head">
          <h2>Recent attendance</h2>
          <button className="sl-map-tool" onClick={() => onSelect("Attendance")}>
            View all
          </button>
        </div>
        {[...data.events]
          .sort((a, b) => b.capturedAt - a.capturedAt)
          .slice(0, 6)
          .map((event) => (
            <div className="overview-list-row" key={event.id}>
              <b>{name(event.employeeId)}</b>
              <span>
                {event.type.replaceAll("_", " ")} ·{" "}
                {new Date(event.capturedAt).toLocaleString([], { timeZone: data.company.timezone })}
              </span>
            </div>
          ))}
        {!data.events.length && (
          <p className="project-empty">Recorded employee activity will appear here.</p>
        )}
      </section>
    </div>
  );
}
