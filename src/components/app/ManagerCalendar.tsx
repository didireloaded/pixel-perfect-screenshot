import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Users } from "lucide-react";
import { ThemedSelect } from "../../../shared/ThemedSelect";
import { calendarJobs, jobRunsOn } from "../../../shared/calendar-jobs";
import type { AttendanceSnapshot } from "../../../shared/attendance";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CalendarJobForm } from "./CalendarJobForm";
const day = (value: string) => new Date(`${value}T12:00:00Z`);
const add = (value: string, count: number) => {
  const date = day(value);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
};
export function ManagerCalendar({
  data,
}: {
  data: Pick<AttendanceSnapshot, "today" | "jobs" | "employees" | "calendarJobs">;
}) {
  const [selected, setSelected] = useState(data.today);
  const [mode, setMode] = useState<"month" | "week">("month");
  const [newJobDate, setNewJobDate] = useState<string | null>(null);
  const jobs = calendarJobs(data);
  const anchor = mode === "month" ? `${selected.slice(0, 7)}-01` : selected;
  const first = add(anchor, -((day(anchor).getUTCDay() + 6) % 7));
  const dates = Array.from({ length: mode === "month" ? 42 : 7 }, (_, i) => add(first, i));
  const move = (direction: number) => {
    if (mode === "week") setSelected(add(selected, direction * 7));
    else {
      const next = day(`${selected.slice(0, 7)}-01`);
      next.setUTCMonth(next.getUTCMonth() + direction);
      setSelected(next.toISOString().slice(0, 10));
    }
  };
  const daily = jobs.filter((job) => jobRunsOn(job, selected));
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
          <p>Jobs and assigned teams</p>
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
          <button className="manager-add-button" onClick={() => setNewJobDate(selected)}>
            <Plus size={15} /> New job
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
              {jobs
                .filter((job) => jobRunsOn(job, date))
                .map((job) => (
                  <button className="calendar-job" key={job.id} onClick={() => setSelected(date)}>
                    <b>{job.title}</b>
                    <small>
                      {job.assignedNames.length
                        ? job.assignedNames.join(", ")
                        : "Assignment optional"}
                    </small>
                  </button>
                ))}
            </div>
          </section>
        ))}
      </div>
      <section className="manager-calendar-detail">
        <div className="project-panel-head">
          <div>
            <h3>
              {day(selected).toLocaleDateString("en-US", { dateStyle: "full", timeZone: "UTC" })}
            </h3>
            <p>
              {daily.length} {daily.length === 1 ? "job" : "jobs"}
            </p>
          </div>
          <CalendarDays size={21} />
        </div>
        {daily.map((job) => (
          <article key={job.id}>
            <div className="w-full">
              <b>{job.title}</b>
              <p className="my-3 whitespace-pre-wrap text-sm">{job.details}</p>
              <p className="my-2 text-sm">
                {job.address} · {job.date}–{job.endDate ?? job.date}
              </p>
              {job.lunchGuidance && (
                <p className="my-2 text-sm">Breaks and travel: {job.lunchGuidance}</p>
              )}
              <small className="flex items-center gap-2">
                <Users size={14} />
                {job.assignedNames.length
                  ? job.assignedNames.join(", ")
                  : "No specific employees assigned"}
              </small>
            </div>
          </article>
        ))}
        {!daily.length && (
          <p className="project-empty">
            No jobs planned for this day. Add a job to share it with your employees.
          </p>
        )}
      </section>
      <Dialog open={!!newJobDate} onOpenChange={(open) => !open && setNewJobDate(null)}>
        <DialogContent>
          <DialogTitle>Add job to calendar</DialogTitle>
          <DialogDescription>Date, details and optional employee assignment.</DialogDescription>
          {newJobDate && <CalendarJobForm date={newJobDate} onSaved={() => setNewJobDate(null)} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}
