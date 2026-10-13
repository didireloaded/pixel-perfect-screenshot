import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Clock3,
  MapPin,
} from "lucide-react";
import type { AttendanceSnapshot, Shift } from "../../../shared/attendance";
import { EmptyState, WorkerSheet, formatHours, formatTime } from "./WorkerUI";
const parseDate = (value: string) => new Date(`${value}T12:00:00Z`);
const key = (date: Date) => date.toISOString().slice(0, 10);
const offset = (value: string, days: number) => {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return key(date);
};
export function AttendanceCalendar({
  data,
  onCorrection,
}: {
  data: AttendanceSnapshot;
  onCorrection: (shift: Shift) => void;
}) {
  const [selected, setSelected] = useState(data.today);
  const [fullMonth, setFullMonth] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = data.shifts.find((shift) => shift.id === detailId && shift.employeeId === data.me);
  const date = parseDate(selected);
  const month = selected.slice(0, 7);
  const weekStart = offset(selected, -date.getUTCDay());
  const week = Array.from({ length: 7 }, (_, index) => offset(weekStart, index));
  const daysInMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const monthFirst = `${month}-01`;
  const monthStart = offset(monthFirst, -parseDate(monthFirst).getUTCDay());
  const monthDays = Array.from(
    { length: Math.ceil((parseDate(monthFirst).getUTCDay() + daysInMonth) / 7) * 7 },
    (_, index) => offset(monthStart, index),
  );
  const shifts = useMemo(
    () =>
      data.shifts
        .filter((shift) => shift.employeeId === data.me && shift.date.startsWith(month))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data, month],
  );
  const eventsFor = (shift: Shift) =>
    data.events
      .filter((event) => event.shiftId === shift.id)
      .sort((a, b) => a.capturedAt - b.capturedAt);
  const attended = new Set(
    shifts
      .filter((shift) => eventsFor(shift).some((event) => event.type === "clock_in"))
      .map((shift) => shift.date),
  );
  const currentTime = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: data.company.timezone,
    hourCycle: "h23",
  }).format(new Date());
  const absent = new Set(
    shifts
      .filter(
        (shift) =>
          (shift.date < data.today || (shift.date === data.today && shift.end <= currentTime)) &&
          !attended.has(shift.date),
      )
      .map((shift) => shift.date),
  );
  const moveMonth = (direction: number) => {
    const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + direction, 1, 12));
    setSelected(key(next));
  };
  return (
    <>
      <section className="worker-calendar-card">
        <div className="worker-month-head">
          <button
            className="worker-month-title"
            onClick={() => setFullMonth((value) => !value)}
            aria-expanded={fullMonth}
          >
            {date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
            <ChevronDown size={15} />
          </button>
          <div>
            <button aria-label="Previous month" onClick={() => moveMonth(-1)}>
              <ChevronLeft size={16} />
            </button>
            <button aria-label="Next month" onClick={() => moveMonth(1)}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="worker-weekday-labels">
          {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
            <span key={index} className={index === 0 || index === 6 ? "weekend" : ""}>
              {day}
            </span>
          ))}
        </div>
        <div className={`worker-week-strip ${fullMonth ? "full-month" : ""}`}>
          {(fullMonth ? monthDays : week).map((day) => (
            <button
              key={day}
              aria-label={parseDate(day).toLocaleDateString("en-US", {
                dateStyle: "full",
                timeZone: "UTC",
              })}
              aria-pressed={day === selected}
              className={`${day === selected ? "selected" : ""} ${day === data.today ? "today" : ""} ${!day.startsWith(month) ? "outside-month" : ""}`}
              onClick={() => setSelected(day)}
            >
              <span>{parseDate(day).getUTCDate().toString().padStart(2, "0")}</span>
              {attended.has(day) ? (
                <i aria-label="Attendance recorded" />
              ) : shifts.some((shift) => shift.date === day) ? (
                <i aria-label="Shift scheduled" />
              ) : null}
            </button>
          ))}
        </div>
        {!fullMonth && (
          <div className="worker-week-controls">
            <button aria-label="Previous week" onClick={() => setSelected(offset(selected, -7))}>
              <ChevronLeft size={14} />
              Previous
            </button>
            <button onClick={() => setSelected(data.today)}>Today</button>
            <button aria-label="Next week" onClick={() => setSelected(offset(selected, 7))}>
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </section>
      <div className="worker-section-heading">
        <h2>Monthly Summary</h2>
        <span>{date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</span>
      </div>
      <div className="worker-month-stats">
        <article>
          <div>
            <span className="worker-stat-icon coral">
              <CircleX size={17} />
            </span>
            <span>
              Absence<small>Scheduled days missed</small>
            </span>
          </div>
          <p>
            <b>{String(absent.size).padStart(2, "0")}</b>
            <span>Days</span>
          </p>
        </article>
        <article>
          <div>
            <span className="worker-stat-icon">
              <CheckCircle2 size={17} />
            </span>
            <span>
              Attendance<small>Recorded clock-ins</small>
            </span>
          </div>
          <p>
            <b>{String(attended.size).padStart(2, "0")}</b>
            <span>Days</span>
          </p>
        </article>
      </div>
      <div className="worker-section-heading">
        <h2>Your Attendance</h2>
        <span>{shifts.length} shifts</span>
      </div>
      <div className="worker-attendance-list">
        {shifts.map((shift) => {
          const events = eventsFor(shift);
          const start = events.find((event) => event.type === "clock_in");
          const end = [...events].reverse().find((event) => event.type === "clock_out");
          return (
            <button
              key={shift.id}
              onClick={() => {
                setSelected(shift.date);
                setDetailId(shift.id);
              }}
              className={`worker-attendance-row ${shift.date === selected ? "selected" : ""}`}
            >
              <span className="worker-day-number">{shift.date.slice(-2)}</span>
              <span>
                <span className="worker-muted-copy">
                  Scheduled {shift.start}–{shift.end} ·{" "}
                  {data.sites.find((site) => site.id === shift.siteId)?.name ?? "No worksite"}
                </span>
                <span className="worker-attendance-cells">
                  {[
                    ["Check In", formatTime(start?.capturedAt, data.company.timezone)],
                    ["Check Out", formatTime(end?.capturedAt, data.company.timezone)],
                    ["Total Hours", formatHours(shift.totals.workedMinutes)],
                  ].map(([label, value]) => (
                    <span key={label}>
                      <small>{label}</small>
                      <b>{value}</b>
                    </span>
                  ))}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {!shifts.length && (
        <EmptyState
          icon={<CalendarDays size={28} />}
          title="Your schedule is clear"
          description="Assigned shifts and attendance will appear here."
        />
      )}
      {detail && (
        <WorkerSheet
          title={parseDate(detail.date).toLocaleDateString("en-US", {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "UTC",
          })}
          onClose={() => setDetailId(null)}
        >
          <div className="worker-detail-meta">
            <p>
              <Clock3 size={16} />
              {detail.start}–{detail.end}
            </p>
            <p>
              <MapPin size={16} />
              {data.sites.find((site) => site.id === detail.siteId)?.name ?? "No worksite"}
            </p>
          </div>
          <dl className="worker-detail-list">
            <div>
              <dt>Recorded work</dt>
              <dd>{formatHours(detail.totals.workedMinutes)}</dd>
            </div>
            <div>
              <dt>Lunch</dt>
              <dd>{detail.totals.lunchMinutes} min</dd>
            </div>
            <div>
              <dt>Personal departures</dt>
              <dd>{detail.totals.personalMinutes} min</dd>
            </div>
            <div>
              <dt>Approved overtime</dt>
              <dd>{formatHours(detail.totals.overtimeMinutes)}</dd>
            </div>
            <div>
              <dt>Timesheet</dt>
              <dd>
                {data.timesheets.find((sheet) => sheet.shiftId === detail.id)?.status ?? "Open"}
              </dd>
            </div>
          </dl>
          <h3 className="worker-sheet-section">Recorded activity</h3>
          {eventsFor(detail).map((event) => (
            <div className="worker-history-row" key={event.id}>
              <span>{event.type.replace(/_/g, " ")}</span>
              <time>{formatTime(event.capturedAt, data.company.timezone)}</time>
            </div>
          ))}
          {!eventsFor(detail).length && (
            <p className="worker-muted-copy">No attendance recorded for this shift.</p>
          )}
          <button
            className="worker-action secondary mt-5"
            onClick={() => {
              onCorrection(detail);
              setDetailId(null);
            }}
          >
            Request a correction
          </button>
        </WorkerSheet>
      )}
    </>
  );
}
