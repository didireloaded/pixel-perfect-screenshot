import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Briefcase,
  Clock3,
  Megaphone,
} from "lucide-react";
import { EmployeeShell } from "@/components/app/EmployeeShell";
import { useAttendance } from "@/lib/app-store";

export const Route = createFileRoute("/calendar")({ component: Calendar });

const dateFor = (iso: string) => new Date(`${iso}T12:00:00Z`);
const isoFor = (date: Date) => date.toISOString().slice(0, 10);

function Calendar() {
  const d = useAttendance();
  const [selected, setSelected] = useState(d.today);
  const selectedDate = dateFor(selected);
  const monthStart = new Date(
    Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth(), 1, 12),
  );
  const lead = (monthStart.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const grid = Array.from({ length: Math.ceil((lead + daysInMonth) / 7) * 7 }, (_, index) => {
    const date = new Date(monthStart);
    date.setUTCDate(index - lead + 1);
    return {
      date,
      iso: isoFor(date),
      currentMonth: date.getUTCMonth() === monthStart.getUTCMonth(),
    };
  });
  const moveMonth = (amount: number) => {
    const date = new Date(
      Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth() + amount, 1, 12),
    );
    setSelected(isoFor(date));
  };
  const shift = d.shifts.find((s) => s.employeeId === d.me && s.date === selected);
  const jobs = d.jobs.filter((j) => j.assignee === d.me && j.date === selected);
  const notices = d.notices.filter((n) => n.startsOn <= selected && n.endsOn >= selected);
  const hasShift = (iso: string) => d.shifts.some((s) => s.employeeId === d.me && s.date === iso);
  const hasJob = (iso: string) => d.jobs.some((j) => j.assignee === d.me && j.date === iso);
  const hasNotice = (iso: string) => d.notices.some((n) => n.startsOn <= iso && n.endsOn >= iso);

  return (
    <EmployeeShell title="Calendar">
      <section className="card-surface p-5" aria-label="Work calendar">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Your schedule
            </p>
            <h2 className="mt-1 text-2xl font-bold">
              {monthStart.toLocaleDateString("en", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
            </h2>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => moveMonth(-1)}
              className="grid h-10 w-10 place-items-center rounded-full bg-muted"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => moveMonth(1)}
              className="grid h-10 w-10 place-items-center rounded-full bg-muted"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-7 text-center text-[11px] font-semibold text-muted-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name) => (
            <span key={name}>{name}</span>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1.5">
          {grid.map(({ date, iso, currentMonth }) => (
            <button
              key={iso}
              type="button"
              onClick={() => setSelected(iso)}
              aria-label={`${date.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}${hasShift(iso) ? ", shift" : ""}${hasJob(iso) ? ", job" : ""}${hasNotice(iso) ? ", company notice" : ""}`}
              aria-pressed={selected === iso}
              className={`flex min-h-14 flex-col items-center justify-center rounded-2xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected === iso ? "bg-primary text-white" : iso === d.today ? "bg-primary-soft text-primary" : currentMonth ? "bg-muted" : "bg-muted/40 text-muted-foreground"}`}
            >
              {date.getUTCDate()}
              <span className="mt-1 flex h-1.5 gap-0.5">
                {hasShift(iso) && (
                  <i
                    className={`h-1.5 w-1.5 rounded-full ${selected === iso ? "bg-white" : "bg-primary"}`}
                  />
                )}
                {hasJob(iso) && <i className="h-1.5 w-1.5 rounded-full bg-success" />}
                {hasNotice(iso) && <i className="h-1.5 w-1.5 rounded-full bg-warning" />}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>🟣 Shift</span>
          <span>🟢 Job</span>
          <span>🟠 Company</span>
        </p>
      </section>
      <section className="card-surface p-5" aria-label="Selected day">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">
            {selectedDate.toLocaleDateString("en", {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}
          </h2>
        </div>
        {!shift && !jobs.length && !notices.length && (
          <p className="mt-4 text-sm text-muted-foreground">Nothing scheduled for this day.</p>
        )}
        {shift && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-primary-soft p-4">
            <Clock3 className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <p className="font-semibold">
                Shift · {shift.start}–{shift.end}
              </p>
              <p className="text-xs text-muted-foreground">
                {d.sites.find((site) => site.id === shift.siteId)?.name} · Lunch {shift.lunch}
              </p>
            </div>
          </div>
        )}
        {jobs.map((job) => (
          <Link
            key={job.id}
            to="/jobs"
            className="mt-3 flex items-start gap-3 rounded-2xl bg-tint-blue p-4"
          >
            <Briefcase className="mt-0.5 h-4 w-4 text-info" />
            <div>
              <p className="font-semibold">{job.title}</p>
              <p className="text-xs text-muted-foreground">
                {job.start}–{job.end} · {job.destination}
              </p>
            </div>
          </Link>
        ))}
        {notices.map((notice) => (
          <div
            key={notice.id}
            className="mt-3 flex items-start gap-3 rounded-2xl bg-tint-cream p-4"
          >
            <Megaphone className="mt-0.5 h-4 w-4 text-warning" />
            <div>
              <p className="font-semibold">{notice.title}</p>
              <p className="text-xs text-muted-foreground">
                {notice.kind.replaceAll("_", " ")}
                {notice.startsTime ? ` · ${notice.startsTime}` : ""}
              </p>
            </div>
          </div>
        ))}
      </section>
    </EmployeeShell>
  );
}
