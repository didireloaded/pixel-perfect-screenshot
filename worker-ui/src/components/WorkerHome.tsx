import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Briefcase,
  Check,
  ChevronRight,
  Clock3,
  Coffee,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import type { AttendanceSnapshot, AttendanceState, EventType } from "../../../shared/attendance";
import { WorkerCard, formatHours, formatTime } from "./WorkerUI";
export function WorkerHome({
  data,
  state,
  busy,
  onAction,
  onDeparture,
  onJobs,
  onMonitoring,
  monitoring,
}: {
  data: AttendanceSnapshot;
  state: AttendanceState;
  busy: boolean;
  onAction: (type: EventType) => void;
  onDeparture: () => void;
  onJobs: () => void;
  onMonitoring: () => void;
  monitoring: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const shift = data.shifts.find((item) => item.employeeId === data.me && item.date === data.today);
  const events = data.events
    .filter((event) => event.shiftId === shift?.id && event.employeeId === data.me)
    .sort((a, b) => a.capturedAt - b.capturedAt);
  const first = events.find((event) => event.type === "clock_in");
  const last = events.find((event) => event.type === "clock_out");
  const lastLunch = [...events].reverse().find((event) => event.type === "start_lunch");
  const lastReturn = [...events].reverse().find((event) => event.type === "end_lunch");
  const lunchMinutes =
    state === "on_lunch" && lastLunch
      ? Math.floor(Math.max(0, now - lastLunch.capturedAt) / 60000)
      : (shift?.totals.lunchMinutes ?? 0);
  const total = shift?.totals.workedMinutes ?? 0;
  const hasLunch = Boolean(
    lastLunch && lastReturn && lastReturn.capturedAt >= lastLunch.capturedAt,
  );
  const stateTitle = {
    not_clocked_in: "Check In",
    working: "Working",
    on_lunch: "On Break",
    on_job: "On Job",
    on_personal: "Away",
    clocked_out: "Shift Complete",
  }[state];
  const action =
    state === "not_clocked_in"
      ? "clock_in"
      : state === "on_lunch"
        ? "end_lunch"
        : state === "on_job"
          ? "end_job"
          : state === "on_personal"
            ? "end_personal"
            : null;
  const nextJob = data.jobs
    .filter(
      (job) => job.assignee === data.me && job.status !== "completed" && job.date >= data.today,
    )
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))[0];
  const site = data.sites.find((item) => item.id === shift?.siteId);
  const notice = data.notices.filter(
    (item) => item.startsOn <= data.today && item.endsOn >= data.today,
  )[0];
  return (
    <>
      <div className="worker-time">
        <p>
          {new Date(now).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            weekday: "long",
            timeZone: data.company.timezone,
          })}
        </p>
        <time>
          {new Date(now).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: data.company.timezone,
          })}
        </time>
      </div>
      <div className="worker-daily-stats">
        {[
          ["Check In", formatTime(first?.capturedAt, data.company.timezone)],
          ["Check Out", formatTime(last?.capturedAt, data.company.timezone)],
          ["Total Hours", formatHours(total)],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <b className={value === "—:—" ? "placeholder" : ""}>{value}</b>
          </div>
        ))}
      </div>
      <div className={`worker-lunch ${state === "on_lunch" ? "active" : ""}`}>
        <span className="worker-lunch-label">
          <Coffee size={19} />
          <span>
            Lunch
            <br />
            Break
          </span>
        </span>
        <button
          disabled={busy || (state !== "working" && state !== "on_lunch")}
          onClick={() => onAction(state === "on_lunch" ? "end_lunch" : "start_lunch")}
        >
          {state === "on_lunch" ? "End Lunch" : hasLunch ? "Start again" : "Start"}
        </button>
        <time>{lunchMinutes} min</time>
      </div>
      <div
        className={`worker-orb-area ${state === "on_lunch" ? "on-break" : ""} ${state === "clocked_out" ? "complete" : ""}`}
      >
        <div className="worker-orb-halo">
          <div className="worker-orb-ring">
            {action ? (
              <button
                className="worker-orb press"
                aria-label={
                  state === "not_clocked_in"
                    ? "Check in"
                    : state === "on_lunch"
                      ? "End lunch"
                      : state === "on_job"
                        ? "Return from job"
                        : "Return to work"
                }
                disabled={busy || !shift}
                onClick={() => onAction(action)}
              >
                <span>{busy ? "Saving…" : stateTitle}</span>
                {state !== "not_clocked_in" && (
                  <small>{state === "on_lunch" ? "End Lunch" : "Return to work"}</small>
                )}
              </button>
            ) : (
              <div className="worker-orb static">
                {state === "clocked_out" && <Check size={22} />}
                <span>{stateTitle}</span>
                <small>{formatHours(total)}</small>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="worker-shift-caption">
        <span className={`worker-status-dot ${state !== "not_clocked_in" ? "active" : ""}`} />
        {shift
          ? `${state === "not_clocked_in" ? "Your shift" : "Today’s shift"} · ${shift.start}–${shift.end}`
          : "No shift scheduled today"}
      </div>
      {(state === "working" || state === "on_job") && (
        <div className="worker-active-actions">
          <button disabled={busy} onClick={onDeparture} hidden={state !== "working"}>
            <ArrowUpRight size={16} />
            Leave temporarily
          </button>
          <button className="clock-out" disabled={busy} onClick={() => onAction("clock_out")}>
            <Clock3 size={16} />
            Clock out
          </button>
        </div>
      )}
      <WorkerCard className="worker-worksite">
        <div>
          <span className="worker-soft-icon">
            <MapPin size={18} />
          </span>
          <span>
            <small>CURRENT WORKSITE</small>
            <b>{site?.name ?? "No worksite assigned"}</b>
            <p>{shift ? `Shift ends at ${shift.end}` : "Your next shift will appear here"}</p>
          </span>
        </div>
        {site?.latitude != null && (
          <button onClick={onMonitoring}>
            <ShieldCheck size={14} />
            {monitoring ? "Worksite checks on" : "Enable worksite checks"}
          </button>
        )}
      </WorkerCard>
      {nextJob && (
        <WorkerCard className="worker-next-job">
          <div className="worker-section-heading">
            <h2>Up next</h2>
            <button onClick={onJobs}>
              All jobs
              <ChevronRight size={14} />
            </button>
          </div>
          <button className="worker-job-shortcut" onClick={onJobs}>
            <span className="worker-soft-icon">
              <Briefcase size={18} />
            </span>
            <span>
              <b>{nextJob.title}</b>
              <small>
                {nextJob.date === data.today ? "Today" : nextJob.date} · {nextJob.start}–
                {nextJob.end}
              </small>
            </span>
            <ArrowUpRight size={18} />
          </button>
        </WorkerCard>
      )}
      {notice && (
        <WorkerCard>
          <p className="worker-eyebrow">COMPANY UPDATE</p>
          <h3 className="mt-2 text-sm font-semibold">{notice.title}</h3>
          <p className="mt-2 text-xs leading-relaxed text-sub">{notice.body}</p>
        </WorkerCard>
      )}
    </>
  );
}
