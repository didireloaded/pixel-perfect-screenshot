import { activeJobForShift } from "../../../shared/active-job";
import { displayDate } from "../../../shared/display-date";
import { currentWorkday } from "../../../shared/workday";
import { NoticeCard } from "./NoticeDetails";
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
import { liveWorkMinutes } from "../../../shared/live-work-minutes";
import { checkinClosed } from "../../../shared/checkin-cutoff";
export function WorkerHome({
  data,
  state,
  busy,
  checkInBlocked = false,
  onAction,
  onDeparture,
  onEmergency,
  onJobs,
  onMonitoring,
  monitoring,
  onAcknowledge,
}: {
  data: AttendanceSnapshot;
  state: AttendanceState;
  busy: boolean;
  checkInBlocked?: boolean;
  onAction: (type: EventType) => void;
  onDeparture: () => void;
  onEmergency?: () => void;
  onJobs: () => void;
  onMonitoring: () => void;
  monitoring: boolean;
  onAcknowledge: (id: string) => Promise<boolean>;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const shift = currentWorkday(data);
  const closed =
    state === "not_clocked_in" &&
    checkinClosed(data.company.timezone, data.company.checkinCloseTime, now);
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
  const work = liveWorkMinutes(shift, state, events, now);
  const total = work.minutes;
  const hasLunch = Boolean(
    lastLunch && lastReturn && lastReturn.capturedAt >= lastLunch.capturedAt,
  );
  const stateTitle = {
    not_clocked_in: "Clock In",
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
            : state === "working"
              ? "clock_out"
              : null;
  const nextJob = data.jobs
    .filter(
      (job) => job.assignee === data.me && job.status !== "completed" && job.date >= data.today,
    )
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))[0];
  const activeJob = activeJobForShift(data.events, data.jobs, shift?.id);
  const site = data.sites.find((item) => item.id === shift?.siteId);
  const notice = data.notices.filter(
    (item) => item.startsOn <= data.today && item.endsOn >= data.today,
  )[0];
  return (
    <>
      {shift?.finishesAt &&
        now >= Date.parse(shift.finishesAt) &&
        !["clocked_out", "not_clocked_in"].includes(state) && (
          <p role="status" className="rounded-xl bg-bad/10 p-3 text-sm">
            Expected finish passed. Record your actual clock-out or request a correction. Location
            sharing is paused; estimated time stops at the planned finish.
          </p>
        )}
      <div className="worker-time">
        <p>
          {new Date(now).toLocaleDateString("en-GB", {
            month: "short",
            day: "numeric",
            year: "numeric",
            weekday: "long",
            timeZone: data.company.timezone,
          })}
        </p>
        <time>
          {new Date(now).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: data.company.timezone,
          })}
        </time>
      </div>
      <div className="worker-daily-stats">
        {[
          ["Clock In", formatTime(first?.capturedAt, data.company.timezone)],
          ["Clock Out", formatTime(last?.capturedAt, data.company.timezone)],
          [work.estimated ? "Hours · estimate" : "Recorded Hours", formatHours(total)],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <b className={value === "—:—" ? "placeholder" : ""}>{value}</b>
          </div>
        ))}
      </div>
      <WorkerCard className="worker-goal-card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <small>TODAY'S WORK</small>
            <h2>{state === "not_clocked_in" ? "Ready to start" : stateTitle}</h2>
            <p>
              {formatHours(total)} {work.estimated ? "live estimate" : "recorded"} ·{" "}
              {formatHours(shift?.regularMinutes ?? 480)} regular-hour target
            </p>
          </div>
          <Clock3 size={24} />
        </div>
        <progress
          aria-label="Regular hours progress"
          max={shift?.regularMinutes ?? 480}
          value={Math.min(total, shift?.regularMinutes ?? 480)}
        />
        {state === "working" && onEmergency && (
          <button disabled={busy} onClick={onEmergency}>
            Emergency departure <ArrowUpRight size={15} />
          </button>
        )}
      </WorkerCard>
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
          disabled={busy || (state !== "working" && state !== "on_job" && state !== "on_lunch")}
          onClick={() => onAction(state === "on_lunch" ? "end_lunch" : "start_lunch")}
          title={state === "not_clocked_in" ? "Clock in first to start break" : undefined}
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
                    ? "Clock in"
                    : state === "on_lunch"
                      ? "End lunch"
                      : state === "on_job"
                        ? "Return from job"
                        : state === "working"
                          ? "Clock out"
                          : "Return to work"
                }
                disabled={busy || closed || checkInBlocked}
                onClick={() => onAction(action)}
              >
                <span>
                  {closed
                    ? "Clock-in closed"
                    : checkInBlocked
                      ? "Needs review"
                      : busy
                        ? "Saving…"
                        : action === "clock_out"
                          ? "Clock out"
                          : stateTitle}
                </span>
                {state !== "not_clocked_in" && (
                  <small>
                    {state === "working"
                      ? `${formatHours(total)} worked`
                      : state === "on_lunch"
                        ? "End Lunch"
                        : "Return to work"}
                  </small>
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
          ? `Workday · ${shift.start}–${shift.end}${shift.finishDate && shift.finishDate !== shift.date ? " (+1 day)" : ""}`
          : "Ready to work? Clock in to start your day."}
      </div>
      {(state === "working" || state === "on_job") && (
        <div className="worker-active-actions">
          <button disabled={busy} onClick={onDeparture} hidden={state !== "working"}>
            <ArrowUpRight size={16} />
            Leave temporarily
          </button>
          {state === "on_job" && (
            <button className="clock-out" disabled={busy} onClick={() => onAction("clock_out")}>
              <Clock3 size={16} />
              Clock out
            </button>
          )}
        </div>
      )}
      <WorkerCard className="worker-worksite">
        <div>
          <span className="worker-soft-icon">
            <MapPin size={18} />
          </span>
          <span>
            <small>CURRENT WORKSITE</small>
            <b>
              {activeJob
                ? activeJob.destination
                : (site?.name ??
                  data.sites.find(
                    (item) =>
                      item.id ===
                      data.employees.find((employee) => employee.id === data.me)?.siteId,
                  )?.name ??
                  "No worksite assigned")}
            </b>
            <p>
              {shift
                ? `Expected finish ${shift.end}${shift.finishDate && shift.finishDate !== shift.date ? ` · ${displayDate(shift.finishDate)}` : ""}`
                : "Your attendance starts when you clock in"}
            </p>
          </span>
        </div>
        {(activeJob ? activeJob.latitude != null : site?.latitude != null) && (
          <button onClick={onMonitoring}>
            <ShieldCheck size={14} />
            {monitoring ? "Location sharing enabled" : "Enable location sharing"}
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
                {nextJob.date === data.today ? "Today" : displayDate(nextJob.date)} ·{" "}
                {nextJob.start}–{nextJob.end}
              </small>
            </span>
            <ArrowUpRight size={18} />
          </button>
        </WorkerCard>
      )}
      {notice && (
        <NoticeCard notice={notice} busy={busy} onAcknowledge={() => onAcknowledge(notice.id)} />
      )}
    </>
  );
}
