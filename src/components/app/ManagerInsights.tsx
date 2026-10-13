import { ThemedSelect } from "../../../shared/ThemedSelect";
import { useState } from "react";
import { CalendarDays, ChevronRight, Clock3, Mail, Users } from "lucide-react";
import { Pie, PieChart, Cell } from "recharts";
import type { AttendanceSnapshot } from "../../../shared/attendance";
import type { ManagerSection } from "./manager-sections";
export type InsightData = Pick<
  AttendanceSnapshot,
  | "today"
  | "company"
  | "employees"
  | "shifts"
  | "events"
  | "states"
  | "requests"
  | "messages"
  | "notices"
>;

export function ManagerInsights({
  data,
  onSelect,
}: {
  data: InsightData;
  onSelect: (section: ManagerSection) => void;
}) {
  const [team, setTeam] = useState("");
  const teams = [
    ...new Set(
      data.employees
        .filter((employee) => employee.role === "employee" && employee.team)
        .map((employee) => employee.team),
    ),
  ];
  const ids = new Set(
    data.employees
      .filter((employee) => employee.role === "employee" && (!team || employee.team === team))
      .map((employee) => employee.id),
  );
  const shifts = data.shifts.filter(
    (shift) => shift.date === data.today && ids.has(shift.employeeId),
  );
  const scheduled = new Set(shifts.map((shift) => shift.employeeId)).size;
  const recorded = new Set(
    data.events
      .filter(
        (event) => event.type === "clock_in" && shifts.some((shift) => shift.id === event.shiftId),
      )
      .map((event) => event.employeeId),
  ).size;
  const stateCount = (states: string[]) =>
    new Set(
      data.states
        .filter(
          (state) =>
            shifts.some((shift) => shift.id === state.shiftId) && states.includes(state.state),
        )
        .map((state) => state.employeeId),
    ).size;
  const percentage = scheduled ? Math.round((recorded / scheduled) * 100) : 0;
  const next = data.shifts
    .filter((shift) => ids.has(shift.employeeId) && shift.date >= data.today)
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))[0];
  const pending = data.requests.filter(
    (request) => request.status === "pending" && ids.has(request.employeeId),
  ).length;
  const event = data.notices
    .filter((notice) => notice.kind === "event" && notice.endsOn >= data.today)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0];
  return (
    <>
      <section className="insight-card">
        <div className="insight-team">
          <label>
            <span>SELECTED TEAM</span>
            <ThemedSelect
              aria-label="Select team for insights"
              value={team}
              onValueChange={(value) => setTeam(value)}
            >
              <option value="">All teams</option>
              {teams.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </ThemedSelect>
          </label>
          <span className="insight-team-icon">
            <Users size={21} />
          </span>
        </div>
        <div
          className="insight-donut"
          role="img"
          aria-label={
            scheduled
              ? `${percentage}% of scheduled workers have clocked in`
              : "No workers scheduled today"
          }
        >
          <PieChart width={196} height={196}>
            <Pie
              data={[{ value: Math.max(percentage, 0) }, { value: Math.max(100 - percentage, 0) }]}
              dataKey="value"
              innerRadius={66}
              outerRadius={78}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive={false}
            >
              <Cell fill="var(--sl-accent)" />
              <Cell fill="var(--sl-accent-soft)" />
            </Pie>
          </PieChart>
          <div>
            <strong>{scheduled ? `${percentage}%` : "—"}</strong>
            <span>Team attendance</span>
          </div>
        </div>
        <h2>Today’s team</h2>
        <div className="insight-stat-grid">
          {[
            ["Scheduled", scheduled, "blue"],
            ["Working", stateCount(["working", "on_job"]), "orange"],
            ["On break", stateCount(["on_lunch"]), "pink"],
            ["Clocked out", stateCount(["clocked_out"]), "purple"],
          ].map(([label, count, tone]) => (
            <article key={String(label)} className={`insight-stat ${tone}`}>
              <span>{label}</span>
              <strong>{String(count).padStart(2, "0")}</strong>
            </article>
          ))}
        </div>
      </section>
      <section className="insight-card insight-agenda">
        <button onClick={() => onSelect("Calendar")}>
          <span className="insight-row-icon">
            <Clock3 size={19} />
          </span>
          <span>
            <small>
              {next
                ? new Date(`${next.date}T12:00:00Z`).toLocaleDateString([], {
                    weekday: "short",
                    day: "numeric",
                    month: "long",
                    timeZone: "UTC",
                  })
                : "Schedule"}
            </small>
            <b>{next ? `${next.start}–${next.end}` : "No upcoming shifts"}</b>
          </span>
          <ChevronRight size={16} />
        </button>
        <button onClick={() => onSelect("Messages")}>
          <span className="insight-row-icon blue">
            <Mail size={19} />
          </span>
          <span>
            <small>Stay connected</small>
            <b>Team messages</b>
          </span>
          <ChevronRight size={16} />
        </button>
        {event && (
          <button onClick={() => onSelect("Announcements")}>
            <span className="insight-row-icon orange">
              <CalendarDays size={19} />
            </span>
            <span>
              <small>{event.startsOn}</small>
              <b>{event.title}</b>
            </span>
            <ChevronRight size={16} />
          </button>
        )}
      </section>
      {pending > 0 && (
        <button className="insight-pending" onClick={() => onSelect("Requests")}>
          <span>
            <b>{pending} requests to review</b>
            <small>Your team is waiting for a decision</small>
          </span>
          <ChevronRight size={18} />
        </button>
      )}
      <p className="insight-footnote">
        Attendance comes from recorded clock-ins.
        <br />
        Locations are shared during active shifts only.
      </p>
    </>
  );
}
