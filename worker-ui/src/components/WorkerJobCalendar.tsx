import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Users } from "lucide-react";
import type { AttendanceSnapshot } from "../../../shared/attendance";
import { calendarJobs, jobRunsOn } from "../../../shared/calendar-jobs";
import { displayDate } from "../../../shared/display-date";
import { EmptyState, WorkerCard, WorkerSheet } from "./WorkerUI";
import { JobAcknowledgements } from "./JobAcknowledgements";
import { jobAcknowledgements } from "../backend";
const day = (date: string) => new Date(`${date}T12:00:00Z`);
export function WorkerJobCalendar({ data }: { data: AttendanceSnapshot }) {
  const [selected, setSelected] = useState(data.today);
  const [detailId, setDetailId] = useState<string | null>(null);
  const jobs = calendarJobs(data);
  const detail = jobs.find((job) => job.id === detailId);
  const first = day(`${selected.slice(0, 7)}-01`);
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const dates = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + i);
    return date.toISOString().slice(0, 10);
  });
  const move = (direction: number) => {
    const next = new Date(first);
    next.setUTCMonth(next.getUTCMonth() + direction);
    setSelected(next.toISOString().slice(0, 10));
  };
  const daily = jobs.filter((job) => jobRunsOn(job, selected));
  return (
    <>
      <section className="worker-calendar-card">
        <div className="worker-month-head">
          <b>
            {first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
          </b>
          <div>
            <button aria-label="Previous month" onClick={() => move(-1)}>
              <ChevronLeft size={16} />
            </button>
            <button aria-label="Next month" onClick={() => move(1)}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="worker-weekday-labels">
          {["S", "M", "T", "W", "T", "F", "S"].map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>
        <div className="worker-week-strip full-month">
          {dates.map((date) => (
            <button
              key={date}
              aria-label={day(date).toLocaleDateString("en-US", {
                dateStyle: "full",
                timeZone: "UTC",
              })}
              aria-pressed={selected === date}
              className={`${selected === date ? "selected" : ""} ${date === data.today ? "today" : ""} ${date.slice(0, 7) !== selected.slice(0, 7) ? "outside-month" : ""}`}
              onClick={() => setSelected(date)}
            >
              <span>{day(date).getUTCDate()}</span>
              {jobs.some((job) => jobRunsOn(job, date)) && <i aria-label="Job planned" />}
            </button>
          ))}
        </div>
        <div className="worker-week-controls">
          <button onClick={() => setSelected(data.today)}>Today</button>
        </div>
      </section>
      <div className="worker-section-heading">
        <h2>
          {day(selected).toLocaleDateString("en-US", {
            day: "numeric",
            month: "long",
            timeZone: "UTC",
          })}
        </h2>
        <span>{daily.length} jobs</span>
      </div>
      {daily.map((job) => (
        <WorkerCard key={job.id}>
          <button className="w-full p-4 text-left" onClick={() => setDetailId(job.id)}>
            <h3 className="font-semibold">{job.title}</h3>
            <p className="my-2 text-sm text-sub line-clamp-2">{job.details}</p>
            <small className="flex items-center gap-2">
              <Users size={14} />
              {job.employeeIds.includes(data.me)
                ? "Assigned to you"
                : job.assignedNames.length
                  ? job.assignedNames.join(", ")
                  : "No specific employees assigned"}
            </small>
          </button>
        </WorkerCard>
      ))}
      {!daily.length && (
        <EmptyState
          icon={<CalendarDays size={28} />}
          title="No jobs planned"
          description="Company jobs appear here when your manager adds them."
        />
      )}
      {detail && (
        <WorkerSheet title={detail.title} onClose={() => setDetailId(null)}>
          <p className="worker-muted-copy">{displayDate(detail.date)}</p>
          {detail.endDate && detail.endDate !== detail.date && (
            <p className="worker-muted-copy">Through {displayDate(detail.endDate)}</p>
          )}
          <p className="my-4 whitespace-pre-wrap">{detail.details}</p>
          {detail.address && <p className="my-3">Job destination: {detail.address}</p>}
          <p className="my-3">
            {detail.returnToOffice === false
              ? "Finish at the job site; no office return required."
              : "Return to the office after this job."}
          </p>
          {detail.lunchGuidance && (
            <p className="my-3">Breaks and travel: {detail.lunchGuidance}</p>
          )}
          <h3 className="worker-sheet-section">Assigned team</h3>
          <p>
            {detail.assignedNames.length
              ? detail.assignedNames.join(", ")
              : "No specific employees assigned"}
          </p>
          {data.calendarJobs?.some((job) => job.id === detail.id) && (
            <JobAcknowledgements
              refreshKey={data.calendarJobs}
              jobId={detail.id}
              rpc={jobAcknowledgements}
            />
          )}
        </WorkerSheet>
      )}
    </>
  );
}
