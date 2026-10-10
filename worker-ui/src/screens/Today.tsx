import { useEffect, useMemo, useState } from "react";
import {
  Bell, MapPin, ChevronRight, Megaphone, Coffee, LogOut, Play,
  DoorOpen, Briefcase, CheckCircle2, CloudOff, RefreshCw,
  ShieldCheck, ShieldOff, X, MapPinned, AlertTriangle, ArrowRight,
  ClipboardList, CircleAlert,
} from "lucide-react";
import { useApp, useNow, fmtDur, fmtTime, SyncState, LIVE_SHIFT_ID } from "../state";
import { fmtMinutes } from "../calc/overtime";
import {
  Page, IconBtn, Avatar, Card, SectionTitle, Pill, Sheet, Button,
  Spinner, SuccessCheck, SkeletonCard, statusTone,
} from "../ui";
import { EMPLOYEE, SHIFT, JOBS, NOTICES, NOTIFICATIONS, WEEK_STRIP, TODAY, getDayInfo, dayKey } from "../data";
import { cn } from "../utils/cn";

type SheetKind = null | "lunch" | "more" | "depart" | "clockout" | "sync" | "endofday";

const STATUS_META: Record<string, { label: string; tone: any }> = {
  off: { label: "Not Clocked In", tone: "blue" },
  working: { label: "Working", tone: "green" },
  lunch: { label: "On Lunch", tone: "orange" },
  away: { label: "Away", tone: "orange" },
  onjob: { label: "On Job", tone: "purple" },
  done: { label: "Clocked Out", tone: "gray" },
};

export default function TodayScreen() {
  const app = useApp();
  const { att, push, goTab, jobState, online } = app;
  const now = useNow(1000);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [overlay, setOverlay] = useState<null | "locating" | "success">(null);
  const [loadingUi, setLoadingUi] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoadingUi(false), 700);
    return () => clearTimeout(t);
  }, []);

  const { dismissReminder, triggerLunchReminder, syncNow, prefs } = app;

  // Surface a lunch reminder once the shift is properly under way.
  useEffect(() => {
    if (att.status !== "working" || att.reminders.lunch || !att.clockInAt) return;
    const t = setTimeout(triggerLunchReminder, 12000);
    return () => clearTimeout(t);
  }, [att.status, att.reminders.lunch, att.clockInAt, triggerLunchReminder]);

  const queued = att.timeline.filter((e) => e.sync === "pending" || e.sync === "unsynced").length;
  const needsReview = att.timeline.filter((e) => e.sync === "review").length;

  const meta = STATUS_META[att.status];
  const worked = app.workedMs(now);
  const shiftStart = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate(), 8, 0).getTime();
  const startsIn = shiftStart - now > 0 ? fmtDur(shiftStart - now) : att.clockInAt ? "Started" : "Now";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const activeJob = JOBS.find((j) => j.id === att.activeJobId);
  const todayJobs = JOBS.filter((j) => j.bucket === "today").slice(0, 3);
  const openJobs = JOBS.filter(
    (j) => j.bucket === "today" && jobState[j.id].status !== "completed"
  );
  const unreadNotifs = NOTIFICATIONS.filter((n) => !app.readNotifs.includes(n.id)).length;
  /** Today's shift totals, derived from the recorded event log — not the clock. */
  const liveDay = app.dayViews.find((d) => d.record.id === LIVE_SHIFT_ID);

  /** Everything that should be resolved before the worker walks out. */
  const endOfDayChecks = (() => {
    if (att.status === "off" || att.status === "done") return [];
    const out: { id: string; label: string; detail: string; action: string; run: () => void }[] = [];
    for (const j of openJobs) {
      const st = app.jobState[j.id];
      const left = j.tasks.length - st.done.length;
      if (st.status !== "completed" && left > 0) {
        out.push({
          id: `job-${j.id}`,
          label: `${j.title} has ${left} unfinished task${left > 1 ? "s" : ""}`,
          detail: st.status === "inprogress" ? "Started but not completed" : "Not started",
          action: "Open job",
          run: () => { setSheet(null); push("jobDetails", { id: j.id }); },
        });
      }
    }
    if (att.status === "onjob") {
      out.push({
        id: "onjob",
        label: "You are still marked as on a job",
        detail: "Record your return so the time is attributed correctly",
        action: "Return from job",
        run: () => { setSheet(null); app.returnFromJob(); app.toast("Returned from job"); },
      });
    }
    if (att.status === "lunch" || att.status === "away") {
      out.push({
        id: "break",
        label: att.status === "lunch" ? "Your lunch break is still open" : `You are still away · ${att.awayReason}`,
        detail: "Close it so your unpaid time is recorded correctly",
        action: att.status === "lunch" ? "End lunch" : "Return to work",
        run: () => {
          setSheet(null);
          if (att.status === "lunch") app.endLunch();
          else app.endAway();
        },
      });
    }
    for (const d of app.missingPunches) {
      if (d.record.id === LIVE_SHIFT_ID) continue;
      out.push({
        id: `punch-${d.record.id}`,
        label: `${d.record.label} is missing a ${!d.totals.clockIn ? "clock-in" : "clock-out"}`,
        detail: "Hours for that day are provisional until it is corrected",
        action: "Report a correction",
        run: () => { setSheet(null); push("correction", { tsId: d.record.id, date: d.record.label }); },
      });
    }
    if (liveDay && liveDay.totals.clockOut && !app.submittedTs.includes(LIVE_SHIFT_ID)) {
      out.push({
        id: "submit",
        label: "Today's timesheet is not submitted",
        detail: `${fmtMinutes(liveDay.totals.workedMinutes)} worked · ${fmtMinutes(liveDay.eligibleMinutes)} overtime eligible`,
        action: "Open Hours",
        run: () => { setSheet(null); goTab("hours"); },
      });
    }
    return out;
  })();

  const doClockIn = () => {
    setOverlay("locating");
    setTimeout(() => {
      app.clockIn();
      setOverlay("success");
      setTimeout(() => setOverlay(null), 1900);
    }, prefs.siteChecks ? 1400 : 700);
  };

  return (
    <>
      <Page
        title="Today"
        subtitle={
          <span className="text-[13px] font-semibold uppercase tracking-wide text-sub dark:text-dsub">
            Friday, 9 October
          </span>
        }
        right={
          <>
            <IconBtn label="Notifications" onClick={() => push("notifications")}>
              <Bell size={19} strokeWidth={2} />
              {unreadNotifs > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-page bg-bad px-1 text-[10px] font-bold text-white dark:border-dpage">
                  {unreadNotifs}
                </span>
              )}
            </IconBtn>
            <button className="press" onClick={() => push("profile")} aria-label="Profile">
              <Avatar initials={EMPLOYEE.initials} size={40} />
            </button>
          </>
        }
      >
        <p className="mt-1 text-[17px] text-sub dark:text-dsub">
          {greeting}, {EMPLOYEE.first}
        </p>

        <SyncStrip
          online={online}
          queued={queued}
          needsReview={needsReview}
          pendingSync={att.pendingSync}
          lastSyncedAt={app.lastSyncedAt}
          now={now}
          onSync={() => {
            const n = syncNow();
            app.toast(n ? `Syncing ${n} saved action${n > 1 ? "s" : ""}…` : "Already up to date", "info");
          }}
          onHistory={() => setSheet("sync")}
        />

        {/* lunch reminder */}
        {att.status === "working" && att.reminders.lunch && (
          <div className="anim-rise mt-3 flex items-start gap-3 rounded-card bg-warn/12 p-4 dark:bg-warn/16">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warn/20 text-[#C47608] dark:text-[#FFB340]">
              <Coffee size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-ink dark:text-white">Time for your lunch break</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-sub dark:text-dsub">
                Your break was scheduled for 12:00. Starting it pauses your working time.
              </span>
              <span className="mt-2.5 flex gap-2">
                <button
                  onClick={() => { dismissReminder("lunch"); setSheet("lunch"); }}
                  className="press rounded-full bg-warn px-3.5 py-1.5 text-[13px] font-semibold text-white"
                >
                  Start Lunch
                </button>
                <button
                  onClick={() => dismissReminder("lunch")}
                  className="press rounded-full px-3 py-1.5 text-[13px] font-medium text-sub dark:text-dsub"
                >
                  Not now
                </button>
              </span>
            </span>
            <button onClick={() => dismissReminder("lunch")} className="press shrink-0 text-sub dark:text-dsub" aria-label="Dismiss reminder">
              <X size={16} />
            </button>
          </div>
        )}

        {/* worksite exit alert */}
        {att.status === "working" && att.reminders.siteExit && (
          <div className="anim-rise mt-3 flex items-start gap-3 rounded-card bg-bad/10 p-4 dark:bg-bad/16">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bad/15 text-bad">
              <MapPinned size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-ink dark:text-white">You left the worksite</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-sub dark:text-dsub">
                This was noted against your active shift and is waiting for your manager to review. Record a departure if you're stepping out.
              </span>
              <span className="mt-2.5 flex gap-2">
                <button
                  onClick={() => { dismissReminder("siteExit"); setSheet("depart"); }}
                  className="press rounded-full bg-bad px-3.5 py-1.5 text-[13px] font-semibold text-white"
                >
                  Record Departure
                </button>
                <button
                  onClick={() => dismissReminder("siteExit")}
                  className="press rounded-full px-3 py-1.5 text-[13px] font-medium text-sub dark:text-dsub"
                >
                  I'm back on site
                </button>
              </span>
            </span>
          </div>
        )}

        {loadingUi ? (
          <div className="mt-1 space-y-4">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : (
          <>
            {/* ── Main shift card ── */}
            <Card className="hero-shadow mt-1 overflow-hidden rounded-[20px]">
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <Pill tone={meta.tone} dot>
                    {meta.label}
                  </Pill>
                  {att.pendingSync && !online ? (
                    <span className="flex items-center gap-1 text-[12px] font-medium text-warn">
                      <CloudOff size={13} /> Waiting to sync
                    </span>
                  ) : att.clockInAt ? (
                    <span className="flex items-center gap-1 text-[12px] font-medium text-sub dark:text-dsub">
                      <CheckCircle2 size={13} className="text-ok" /> Synced
                    </span>
                  ) : null}
                </div>

                {/* state-specific body */}
                {att.status === "off" && (
                  <>
                    <p className="mt-4 text-[28px] font-bold tabular-nums tracking-tight text-ink dark:text-white">
                      {SHIFT.start} – {SHIFT.end}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-[15px] text-sub dark:text-dsub">
                      <MapPin size={14} /> {SHIFT.site}
                    </p>
                    <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-fill p-3.5 dark:bg-dfill">
                      <MiniStat label="Scheduled" value={SHIFT.expected} />
                      <MiniStat label="Lunch" value="1h 00m" />
                      <MiniStat label="Starts in" value={startsIn} />
                    </div>
                    <Button className="mt-5" onClick={doClockIn}>
                      <Play size={18} fill="currentColor" /> Clock In
                    </Button>
                  </>
                )}

                {(att.status === "working" || att.status === "onjob") && (
                  <>
                    <p className="mt-4 text-[13px] font-medium uppercase tracking-wide text-sub dark:text-dsub">
                      Working time
                    </p>
                    <p className="mt-0.5 text-[40px] font-bold tabular-nums leading-none tracking-tight text-ink dark:text-white">
                      {fmtDur(worked)}
                    </p>
                    <p className="mt-2.5 flex items-center gap-1.5 text-[15px] text-sub dark:text-dsub">
                      <MapPin size={14} />
                      {att.status === "onjob" && activeJob ? activeJob.site : SHIFT.site} · Shift {SHIFT.startShort} – {SHIFT.endShort}
                      {att.clockInLabel && <span>· In {att.clockInLabel}</span>}
                    </p>
                    <p className="mt-1.5 text-[12.5px] leading-snug text-sub dark:text-dsub">
                      Running estimate from your recorded events. Final hours and any overtime are calculated once you
                      clock out.
                    </p>

                    {att.status === "onjob" && activeJob ? (
                      <>
                        <div className="mt-4 rounded-xl bg-brand-soft/70 px-4 py-3 dark:bg-brand/15">
                          <p className="text-[15px] font-semibold text-brand dark:text-[#9D91F2]">
                            On job · {activeJob.title}
                          </p>
                          <p className="mt-0.5 text-[13px] text-brand/80 dark:text-[#9D91F2]/80">
                            {activeJob.time} · {activeJob.site}
                          </p>
                        </div>
                        <Button className="mt-4" onClick={() => { app.returnFromJob(); app.toast("Returned from job"); }}>
                          Return From Job
                        </Button>
                        <Button variant="plain" size="md" className="mt-1" onClick={() => push("jobDetails", { id: activeJob.id })}>
                          View job details
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="mt-5 flex gap-3">
                          <Button variant="tinted" onClick={() => setSheet("lunch")}>
                            <Coffee size={18} /> Start Lunch
                          </Button>
                          <Button onClick={() => setSheet(endOfDayChecks.length > 0 ? "endofday" : "clockout")}>
                            <LogOut size={18} /> Clock Out
                          </Button>
                        </div>
                        <Button variant="plain" size="md" className="mt-1.5" onClick={() => setSheet("more")}>
                          More options
                        </Button>
                      </>
                    )}
                  </>
                )}

                {att.status === "lunch" && <LunchBody now={now} onEnd={() => { const d = app.endLunch(); app.toast(`Lunch recorded · ${fmtDur(d)}`); }} />}

                {att.status === "away" && (
                  <>
                    <p className="mt-4 text-[13px] font-medium uppercase tracking-wide text-sub dark:text-dsub">Away from work</p>
                    <p className="mt-0.5 text-[28px] font-bold tabular-nums tracking-tight text-ink dark:text-white">
                      {fmtDur(now - (att.awayStartedAt ?? now))}
                    </p>
                    <p className="mt-2 text-[15px] text-sub dark:text-dsub">
                      {att.awayReason} · Left at {fmtTime(att.awayStartedAt ?? now)}
                      {att.awayExpectedReturn ? ` · expected back ${att.awayExpectedReturn}` : ""}
                    </p>
                    <Button className="mt-5" onClick={() => { const d = app.endAway(); app.toast(`Departure recorded · ${fmtDur(d)}`); }}>
                      Return to Work
                    </Button>
                  </>
                )}

                {att.status === "done" && (
                  <>
                    <div className="mt-4 flex items-center gap-3">
                      <SuccessCheck size={46} />
                      <div>
                        <p className="text-[20px] font-bold tracking-tight text-ink dark:text-white">Shift complete</p>
                        <p className="text-[14px] text-sub dark:text-dsub">
                          {att.clockInLabel} – {att.clockOutLabel} · {SHIFT.site}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-fill p-3.5 dark:bg-dfill">
                      <MiniStat label="Worked" value={liveDay ? fmtMinutes(liveDay.totals.workedMinutes) : fmtDur(worked)} />
                      <MiniStat label="Unpaid" value={liveDay ? fmtMinutes(liveDay.totals.unpaidMinutes) : fmtDur(att.breakMs)} />
                      <MiniStat label="Regular" value={liveDay ? fmtMinutes(liveDay.totals.regularMinutes) : fmtDur(worked)} />
                    </div>
                    {liveDay?.provisional && (
                      <p className="mt-3 text-[12.5px] leading-snug text-sub dark:text-dsub">
                        Still confirming your recorded events — these figures settle within a few seconds.
                      </p>
                    )}
                    {liveDay && liveDay.eligibleMinutes > 0 && (
                      <p className="mt-3 rounded-xl bg-warn/10 px-3.5 py-2.5 text-[13px] leading-snug text-[#C47608] dark:bg-warn/14 dark:text-[#FFB340]">
                        Recorded time supports {fmtMinutes(liveDay.eligibleMinutes)} of overtime for review. Request it
                        from Hours — it is not approved and not guaranteed pay until your manager decides.
                      </p>
                    )}
                    <Button variant="tinted" size="md" className="mt-4" onClick={() => goTab("hours")}>
                      View today's timesheet
                    </Button>
                  </>
                )}

                {att.status !== "off" && <SiteCheckChip />}
              </div>
            </Card>

            {/* ── Next action reminder ── */}
            <NextUp
              now={now}
              clockInAt={att.clockInAt}
              status={att.status}
              onLunch={() => setSheet("lunch")}
              onJob={(id) => push("jobDetails", { id })}
            />

            {/* ── Missing punch help ── */}
            {app.missingPunches
              .filter((d) => d.record.id !== LIVE_SHIFT_ID)
              .map((d) => (
                <div key={d.record.id} className="mt-3 flex items-start gap-3 rounded-card bg-bad/8 p-4 dark:bg-bad/14">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bad/14 text-bad">
                    <CircleAlert size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-ink dark:text-white">
                      Missing {d.totals.clockIn ? "clock-out" : "clock-in"} · {d.record.label}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-sub dark:text-dsub">
                      That day's hours stay provisional until it's fixed, so it won't count toward pay yet.
                    </span>
                    <button
                      onClick={() => push("correction", { tsId: d.record.id, date: d.record.label })}
                      className="press mt-2.5 flex items-center gap-1.5 rounded-full bg-bad px-3.5 py-1.5 text-[13px] font-semibold text-white"
                    >
                      Report a correction <ArrowRight size={13} />
                    </button>
                  </span>
                </div>
              ))}

            {/* ── Today's plan ── */}
            <SectionTitle>Today's plan</SectionTitle>
            <Card className="px-5 py-4">
              <TodayPlan
                now={now}
                clockInLabel={att.clockInLabel}
                clockOutLabel={att.clockOutLabel}
                onOpenJob={(id: string) => push("jobDetails", { id })}
              />
            </Card>

            {/* ── Weekly strip ── */}
            <SectionTitle>This week</SectionTitle>
            <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
              {WEEK_STRIP.map((d) => {
                const info = getDayInfo(d);
                const isToday = dayKey(d) === dayKey(TODAY);
                return (
                  <button
                    key={d.getDate()}
                    onClick={() => push("shiftDetails", { date: d.toISOString() })}
                    className={cn(
                      "press flex w-[72px] shrink-0 flex-col items-center rounded-2xl py-3",
                      isToday ? "bg-brand text-white shadow-[0_6px_18px_rgba(91,77,216,0.35)]" : "bg-card text-ink card-shadow dark:bg-dcard dark:text-white"
                    )}
                  >
                    <span className={cn("text-[12px] font-semibold uppercase", isToday ? "text-white/75" : "text-sub dark:text-dsub")}>
                      {d.toLocaleDateString("en-GB", { weekday: "short" })}
                    </span>
                    <span className="mt-0.5 text-[20px] font-bold tabular-nums">{d.getDate()}</span>
                    <span className="mt-1.5 flex h-2 items-center gap-1">
                      {info.hasShift && <span className={cn("h-1.5 w-1.5 rounded-full", isToday ? "bg-white" : "bg-brand")} />}
                      {info.approved && <span className="h-1.5 w-1.5 rounded-full bg-ok" />}
                      {info.leave && <span className="h-1.5 w-1.5 rounded-full bg-warn" />}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* ── Today's jobs ── */}
            <SectionTitle action="See All" onAction={() => goTab("jobs")}>
              Today's jobs
            </SectionTitle>
            <Card>
              {todayJobs.map((j, i) => {
                const js = jobState[j.id];
                const label = js.status === "completed" ? "Completed" : js.status === "inprogress" ? "In progress" : "Assigned";
                return (
                  <button
                    key={j.id}
                    onClick={() => push("jobDetails", { id: j.id })}
                    className={cn(
                      "press-row flex w-full items-center gap-3 px-4 py-3.5 text-left",
                      i < todayJobs.length - 1 && "border-b border-sep/80 dark:border-dsep/70"
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand dark:bg-brand/20 dark:text-[#9D91F2]">
                      <Briefcase size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-semibold text-ink dark:text-white">{j.title}</span>
                      <span className="mt-0.5 block text-[13px] tabular-nums text-sub dark:text-dsub">
                        {j.time} · {j.site}
                      </span>
                    </span>
                    <Pill tone={statusTone(label)}>{label}</Pill>
                    <ChevronRight size={17} className="shrink-0 text-sub/70 dark:text-dsub/70" />
                  </button>
                );
              })}
            </Card>

            {/* ── Timeline ── */}
            <SectionTitle>Today's timeline</SectionTitle>
            <Card className="px-5 py-4">
              <Timeline />
            </Card>

            {/* ── Announcement ── */}
            <SectionTitle>Announcement</SectionTitle>
            <Card onClick={() => push("notice", { id: "n1" })} className="mb-2 flex items-center gap-3.5 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warn/15 text-[#C47608] dark:text-[#FFB340]">
                <Megaphone size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold text-ink dark:text-white">{NOTICES[0].title}</span>
                <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-sub dark:text-dsub">{NOTICES[0].preview}</span>
              </span>
              <ChevronRight size={17} className="shrink-0 text-sub/70 dark:text-dsub/70" />
            </Card>
          </>
        )}
      </Page>

      {/* ── Clock-in overlay ── */}
      {overlay && (
        <div className="anim-fade-in absolute inset-0 z-[60] flex flex-col items-center justify-center bg-page/92 backdrop-blur-xl dark:bg-dpage/92">
          {overlay === "locating" ? (
            <div className="flex flex-col items-center">
              <Spinner size={44} />
              <p className="mt-6 text-[20px] font-semibold text-ink dark:text-white">Clocking you in…</p>
              <p className="mt-1.5 flex items-center gap-1.5 text-[15px] text-sub dark:text-dsub">
                <MapPin size={14} />
                {prefs.siteChecks ? `Confirming you're at ${SHIFT.site}` : "Saving to your timesheet"}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center px-10 text-center">
              <SuccessCheck size={88} />
              <p className="anim-rise mt-6 text-[26px] font-bold tracking-tight text-ink dark:text-white" style={{ animationDelay: "0.1s" }}>
                Clocked in at {att.clockInLabel}
              </p>
              <p className="anim-rise mt-1.5 text-[16px] leading-snug text-sub dark:text-dsub" style={{ animationDelay: "0.2s" }}>
                {SHIFT.site}
                {prefs.siteChecks ? " · Location verified" : " · Recorded without a location check"}
                {!online ? " · Saved on this phone, will sync when you're back online" : ""}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Sheets ── */}
      <Sheet open={sheet === "lunch"} onClose={() => setSheet(null)} title="Start Lunch">
        <div className="space-y-3">
          <div className="rounded-card bg-fill p-4 dark:bg-dfill">
            <SheetRow label="Scheduled break" value="1h 00m" />
            <SheetRow label="Expected return" value={fmtTime(Date.now() + 3600000)} />
          </div>
          <p className="px-1 text-[13px] leading-snug text-sub dark:text-dsub">
            Your lunch break is unpaid and pauses your working time.
          </p>
          <Button onClick={() => { app.startLunch(); setSheet(null); }}>Confirm Start Lunch</Button>
          <Button variant="plain" size="md" onClick={() => setSheet(null)}>Cancel</Button>
        </div>
      </Sheet>

      <Sheet open={sheet === "more"} onClose={() => setSheet(null)} title="More Options">
        <div className="space-y-2.5">
          <button
            onClick={() => { setSheet(null); setTimeout(() => setSheet("depart"), 280); }}
            className="press flex w-full items-center gap-3.5 rounded-card bg-fill p-4 text-left dark:bg-dfill"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-warn/15 text-[#C47608] dark:text-[#FFB340]">
              <DoorOpen size={19} />
            </span>
            <span className="flex-1">
              <span className="block text-[16px] font-semibold text-ink dark:text-white">Personal Departure</span>
              <span className="text-[13px] text-sub dark:text-dsub">Leave work temporarily</span>
            </span>
            <ChevronRight size={17} className="text-sub/70" />
          </button>
          <div className="rounded-card bg-fill p-4 dark:bg-dfill">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-sub dark:text-dsub">
              Leave for an assigned job
            </p>
            {openJobs.length === 0 ? (
              <p className="mt-2 text-[14px] leading-snug text-sub dark:text-dsub">
                No open jobs right now. Assigned jobs appear here as their time approaches.
              </p>
            ) : (
              openJobs.map((j) => (
                <button
                  key={j.id}
                  onClick={() => {
                    app.startJobAtt(j.id);
                    app.setJobStatus(j.id, "inprogress");
                    setSheet(null);
                    app.toast(`Departed for ${j.title}`);
                  }}
                  className="press mt-2 flex w-full items-center gap-3 rounded-xl bg-card px-3.5 py-3 text-left card-shadow dark:bg-dcard"
                >
                  <Briefcase size={17} className="shrink-0 text-brand" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ink dark:text-white">{j.title}</span>
                    <span className="block text-[12px] tabular-nums text-sub dark:text-dsub">
                      {j.time} · {j.site}
                    </span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-sub/70 dark:text-dsub/70" />
                </button>
              ))
            )}
            <button
              onClick={() => { setSheet(null); goTab("jobs"); }}
              className="press mt-2.5 w-full rounded-lg py-1 text-[13px] font-semibold text-brand"
            >
              See all jobs
            </button>
          </div>
          <Button variant="plain" size="md" onClick={() => setSheet(null)}>Cancel</Button>
        </div>
      </Sheet>

      <DepartSheet open={sheet === "depart"} onClose={() => setSheet(null)} />

      <Sheet open={sheet === "clockout"} onClose={() => setSheet(null)} title="Clock Out">
        <div className="space-y-3">
          <div className="rounded-card bg-fill p-4 dark:bg-dfill">
            <SheetRow label="Shift started" value={att.clockInLabel ?? "—"} />
            <SheetRow label="Clock-out time" value={fmtTime(now)} />
            <SheetRow label="Breaks" value={fmtDur(att.breakMs)} />
            <div className="my-2.5 border-t border-sep dark:border-dsep" />
            <SheetRow label="Total recorded" value={fmtDur(worked)} bold />
          </div>
          <Button
            onClick={() => {
              app.clockOut();
              setSheet(null);
              app.toast("Shift recorded · Nice work today");
            }}
          >
            Confirm Clock Out
          </Button>
          <Button variant="plain" size="md" onClick={() => setSheet(null)}>Keep Working</Button>
        </div>
      </Sheet>

      {/* ── End-of-day check ── */}
      <Sheet open={sheet === "endofday"} onClose={() => setSheet(null)} title="Before you clock out">
        <p className="px-1 text-[14px] leading-snug text-sub dark:text-dsub">
          {endOfDayChecks.length} thing{endOfDayChecks.length > 1 ? "s" : ""} still need{endOfDayChecks.length > 1 ? "" : "s"} your
          attention. You can still clock out — nothing here is lost.
        </p>
        <div className="mt-3.5 space-y-2">
          {endOfDayChecks.map((c) => (
            <div key={c.id} className="flex items-start gap-3 rounded-card bg-fill p-3.5 dark:bg-dfill">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warn/18 text-[#C47608] dark:text-[#FFB340]">
                <AlertTriangle size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-semibold leading-snug text-ink dark:text-white">{c.label}</span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-sub dark:text-dsub">{c.detail}</span>
                <button onClick={c.run} className="press mt-2 rounded-full bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white">
                  {c.action}
                </button>
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          <Button onClick={() => setSheet("clockout")}>
            <LogOut size={18} /> Continue to Clock Out
          </Button>
          <Button variant="plain" size="md" onClick={() => setSheet(null)}>Not yet</Button>
        </div>
      </Sheet>

      {/* ── Sync history ── */}
      <Sheet open={sheet === "sync"} onClose={() => setSheet(null)} title="Sync History">
        <div className="mb-3 flex items-center justify-between rounded-card bg-fill px-4 py-3 dark:bg-dfill">
          <span className="text-[13px] text-sub dark:text-dsub">Last synced</span>
          <span className="text-[14px] font-semibold tabular-nums text-ink dark:text-white">
            {relTime(now - app.lastSyncedAt)}
          </span>
        </div>
        <div className="no-scrollbar max-h-[300px] overflow-y-auto">
          {app.syncLog.map((s, i) => (
            <div
              key={s.id}
              className={cn(
                "relative flex gap-3 py-2.5 pl-7",
                i < app.syncLog.length - 1 && "border-b border-sep/60 dark:border-dsep/60"
              )}
            >
              {i < app.syncLog.length - 1 && (
                <span className="absolute left-[9px] top-8 bottom-0 w-px bg-sep dark:bg-dsep" />
              )}
              <span
                className={cn(
                  "absolute left-0 top-[13px] flex h-[19px] w-[19px] items-center justify-center rounded-full",
                  s.kind === "confirmed" && "bg-ok/15 text-ok",
                  s.kind === "saved" && "bg-warn/18 text-[#C47608] dark:text-[#FFB340]",
                  s.kind === "conflict" && "bg-bad/12 text-bad",
                  s.kind === "manual" && "bg-brand/12 text-brand"
                )}
              >
                {s.kind === "confirmed" && <CheckCircle2 size={12} strokeWidth={2.6} />}
                {s.kind === "saved" && <CloudOff size={11} />}
                {s.kind === "conflict" && <AlertTriangle size={11} />}
                {s.kind === "manual" && <RefreshCw size={11} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] leading-snug text-ink dark:text-white">{s.label}</span>
                <span className="mt-0.5 block text-[11.5px] tabular-nums text-sub dark:text-dsub">
                  {new Date(s.at).toLocaleString("en-GB", {
                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          <Button
            onClick={() => {
              const n = syncNow();
              app.toast(n ? `Syncing ${n} saved action${n > 1 ? "s" : ""}…` : "Already up to date", "info");
            }}
          >
            <RefreshCw size={18} /> Sync Now
          </Button>
          <p className="pb-1 text-center text-[12px] leading-snug text-sub dark:text-dsub">
            "Saved on this phone" means recorded but not yet confirmed. Only "Confirmed" counts as received.
          </p>
        </div>
      </Sheet>
    </>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────────
function relTime(ms: number) {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function SyncStrip({
  online, queued, needsReview, pendingSync, lastSyncedAt, now, onSync, onHistory,
}: {
  online: boolean;
  queued: number;
  needsReview: number;
  pendingSync: boolean;
  lastSyncedAt: number;
  now: number;
  onSync: () => void;
  onHistory: () => void;
}) {
  return (
    <div
      className={cn(
        "mt-4 rounded-xl px-3.5 py-2.5",
        !online ? "bg-warn/12 dark:bg-warn/16" : needsReview > 0 ? "bg-info/10 dark:bg-info/15" : "bg-fill dark:bg-dfill"
      )}
    >
      <div className="flex items-center gap-2.5">
        {!online ? (
          <CloudOff size={15} className="shrink-0 text-[#C47608] dark:text-[#FFB340]" />
        ) : queued > 0 ? (
          <RefreshCw size={15} className="anim-spin shrink-0 text-brand" />
        ) : needsReview > 0 ? (
          <CheckCircle2 size={15} className="shrink-0 text-info" />
        ) : (
          <CheckCircle2 size={15} className="shrink-0 text-ok" />
        )}
        <span
          className={cn(
            "flex-1 text-[13px] font-medium leading-snug",
            !online ? "text-[#C47608] dark:text-[#FFB340]" : needsReview > 0 ? "text-info" : "text-sub dark:text-dsub"
          )}
        >
          {!online
            ? `Offline — ${pendingSync ? "attendance saved on this phone" : "actions are saved locally"} and will sync later`
            : queued > 0
              ? `Syncing ${queued} action${queued > 1 ? "s" : ""}…`
              : needsReview > 0
                ? `${needsReview} action${needsReview > 1 ? "s" : ""} waiting for manager review`
                : "Connected · everything confirmed by the server"}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 border-t border-black/6 pt-2 dark:border-white/10">
        <span className="flex-1 text-[11.5px] font-medium tabular-nums text-sub dark:text-dsub">
          Last synced {relTime(now - lastSyncedAt)}
        </span>
        <button onClick={onHistory} className="press rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-brand">
          History
        </button>
        <button
          onClick={onSync}
          className="press flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-[11.5px] font-semibold text-white shadow-[0_2px_8px_rgba(91,77,216,0.35)]"
        >
          <RefreshCw size={11} className={queued > 0 ? "anim-spin" : ""} />
          {online ? "Sync now" : "Retry"}
        </button>
      </div>
    </div>
  );
}

/** Live worksite location-check indicator, shown only while it matters. */
function SiteCheckChip() {
  const { siteCheckState } = useApp();
  const active = siteCheckState.active;
  return (
    <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-fill px-3.5 py-3 dark:bg-dfill">
      {active ? (
        <ShieldCheck size={16} className="mt-px shrink-0 text-ok" />
      ) : (
        <ShieldOff size={16} className="mt-px shrink-0 text-sub dark:text-dsub" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink dark:text-white">
          Location checks · {siteCheckState.label}
        </p>
        <p className="mt-0.5 text-[12px] leading-snug text-sub dark:text-dsub">{siteCheckState.reason}</p>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-[15px] font-bold tabular-nums text-ink dark:text-white">{value}</p>
      <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-sub dark:text-dsub">{label}</p>
    </div>
  );
}

function SheetRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[15px] text-sub dark:text-dsub">{label}</span>
      <span className={cn("tabular-nums", bold ? "text-[17px] font-bold text-ink dark:text-white" : "text-[15px] font-medium text-ink dark:text-white")}>
        {value}
      </span>
    </div>
  );
}

function LunchBody({ now, onEnd }: { now: number; onEnd: () => void }) {
  const { att } = useApp();
  const elapsed = now - (att.lunchStartedAt ?? now);
  return (
    <>
      <p className="mt-4 text-[13px] font-medium uppercase tracking-wide text-sub dark:text-dsub">Lunch break</p>
      <p className="mt-0.5 text-[40px] font-bold tabular-nums leading-none tracking-tight text-ink dark:text-white">
        {fmtDur(elapsed)}
      </p>
      <p className="mt-2.5 text-[15px] text-sub dark:text-dsub">
        Started {fmtTime(att.lunchStartedAt ?? now)} · Back by {fmtTime((att.lunchStartedAt ?? now) + 3600000)}
      </p>
      <Button className="mt-5" onClick={onEnd}>
        <Coffee size={18} /> End Lunch
      </Button>
    </>
  );
}

function DepartSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp();
  const [reason, setReason] = useState("Personal errand");
  const [note, setNote] = useState("");
  const [back, setBack] = useState(() => {
    const d = new Date(Date.now() + 30 * 60000);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const reasons = ["Personal errand", "Emergency", "Medical appointment", "Family matter", "Other"];
  return (
    <Sheet open={open} onClose={onClose} title="Personal Departure">
      <div className="space-y-3">
        <div className="overflow-hidden rounded-card bg-fill dark:bg-dfill">
          {reasons.map((r, i) => (
            <button
              key={r}
              onClick={() => setReason(r)}
              className={cn(
                "press-row flex w-full items-center justify-between px-4 py-3 text-left text-[16px] text-ink dark:text-white",
                i < reasons.length - 1 && "border-b border-sep/80 dark:border-dsep/70"
              )}
            >
              {r}
              {reason === r && <CheckCircle2 size={19} className="text-brand" />}
            </button>
          ))}
        </div>
        {reason === "Emergency" && (
          <p className="anim-fade-in rounded-xl bg-bad/10 px-3.5 py-2.5 text-[13px] leading-snug text-bad dark:bg-bad/15 dark:text-[#FF6961]">
            Emergency departures are flagged to your manager right away. Add a short note if you can — you can update it when you're back.
          </p>
        )}
        <div>
          <label className="mb-1.5 block px-1 text-[13px] font-medium text-sub dark:text-dsub">Expected back</label>
          <input
            type="time"
            value={back}
            onChange={(e) => setBack(e.target.value)}
            className="w-full rounded-btn bg-fill px-4 py-3 text-[16px] tabular-nums text-ink outline-none focus:ring-2 focus:ring-brand/60 dark:bg-dfill dark:text-white"
          />
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={reason === "Emergency" ? "What happened? (optional, but it helps)" : "Add a note (optional)"}
          rows={2}
          className="w-full resize-none rounded-card bg-fill px-4 py-3 text-[16px] text-ink outline-none placeholder:text-sub/70 focus:ring-2 focus:ring-brand/60 dark:bg-dfill dark:text-white"
        />
        <Button onClick={() => { app.startAway(reason, note, back); onClose(); }}>Confirm Departure</Button>
        <Button variant="plain" size="md" onClick={onClose}>Cancel</Button>
      </div>
    </Sheet>
  );
}

const SYNC_LABEL: Record<SyncState, { text: string; cls: string }> = {
  pending: { text: "Pending", cls: "text-sub dark:text-dsub" },
  confirmed: { text: "Confirmed", cls: "text-ok" },
  review: { text: "Needs review", cls: "text-info" },
  unsynced: { text: "Saved on phone", cls: "text-[#C47608] dark:text-[#FFB340]" },
};

function SyncChip({ sync }: { sync: SyncState }) {
  const m = SYNC_LABEL[sync];
  return (
    <span className={cn("mt-[3px] flex shrink-0 items-center gap-1 text-[11px] font-semibold", m.cls)}>
      {sync === "pending" && <span className="anim-pulse-soft h-1.5 w-1.5 rounded-full bg-current" />}
      {sync === "confirmed" && <CheckCircle2 size={12} strokeWidth={2.6} />}
      {sync === "review" && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {sync === "unsynced" && <CloudOff size={12} />}
      {m.text}
    </span>
  );
}

function Timeline() {
  const { att } = useApp();
  const upcoming: { time: string; label: string }[] = [];
  if (att.status !== "done") {
    if (!att.timeline.some((t) => t.kind === "lunch")) upcoming.push({ time: "12:00", label: "Lunch scheduled" });
    if (!att.timeline.some((t) => t.label.includes("Site Inspection"))) upcoming.push({ time: "14:30", label: "Site Inspection · Main Warehouse" });
    if (!att.timeline.some((t) => t.label.includes("Equipment Delivery"))) upcoming.push({ time: "16:00", label: "Equipment Delivery · Loading Bay" });
    upcoming.push({ time: "17:00", label: "Shift ends" });
  }
  const recorded = att.timeline;
  if (recorded.length === 0 && upcoming.length === 0) return null;
  return (
    <div className="relative">
      <div className="absolute bottom-2 left-[5px] top-2 w-px bg-sep dark:bg-dsep" />
      {recorded.map((e) => (
        <div key={e.id} className="relative flex items-start gap-4 py-[7px] pl-6">
          <span className="absolute left-0 top-[13px] h-[11px] w-[11px] rounded-full border-2 border-page bg-brand dark:border-dcard" />
          <span className="w-12 shrink-0 pt-px text-[14px] font-semibold tabular-nums text-ink dark:text-white">{e.time}</span>
          <span className="min-w-0 flex-1 text-[15px] leading-snug text-ink dark:text-white">{e.label}</span>
          <SyncChip sync={e.sync} />
        </div>
      ))}
      {upcoming.map((e, i) => (
        <div key={`u${i}`} className="relative flex items-baseline gap-4 py-[7px] pl-6">
          <span className="absolute left-0 top-[13px] h-[11px] w-[11px] rounded-full border-2 border-sub/50 bg-card dark:border-dsub/50 dark:bg-dcard" />
          <span className="w-12 shrink-0 text-[14px] tabular-nums text-sub dark:text-dsub">{e.time}</span>
          <span className="text-[15px] text-sub dark:text-dsub">{e.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Today's plan and the next-action reminder ─────────────────────────────

interface PlanItem {
  at: number;
  time: string;
  label: string;
  sub?: string;
  kind: "start" | "lunch" | "job" | "finish";
  jobId?: string;
}

/** The shift laid out against today's real clock, so countdowns are truthful. */
function useTodayPlan(): PlanItem[] {
  return useMemo(() => {
    const at = (h: number, m: number) => {
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return d.getTime();
    };
    const hhmm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const items: PlanItem[] = [
      { at: at(8, 0), time: "08:00", label: "Shift starts", sub: SHIFT.site, kind: "start" },
      { at: at(12, 0), time: "12:00", label: "Lunch break", sub: "1h 00m · unpaid", kind: "lunch" },
    ];
    for (const j of JOBS.filter((x) => x.bucket === "today")) {
      const [h, m] = j.time.split(" – ")[0].split(":").map(Number);
      items.push({ at: at(h, m), time: hhmm(h, m), label: j.title, sub: j.site, kind: "job", jobId: j.id });
    }
    items.push({
      at: at(17, 0),
      time: "17:00",
      label: "Expected finish",
      sub: "Clock out to close the shift",
      kind: "finish",
    });
    return items.sort((a, b) => a.at - b.at);
  }, []);
}

function NextUp({
  now, clockInAt, status, onLunch, onJob,
}: {
  now: number;
  clockInAt?: number;
  status: string;
  onLunch: () => void;
  onJob: (id: string) => void;
}) {
  const plan = useTodayPlan();
  const next = plan.find((p) => p.at > now);
  if (!next || status === "off" || status === "done") return null;

  const diff = next.at - now;
  const shiftSpan = 9 * 3600000;
  const elapsed = clockInAt ? Math.min(Math.max(now - clockInAt, 0), shiftSpan) : 0;
  const r = 15;
  const circ = 2 * Math.PI * r;
  const soon = diff <= 30 * 60000;

  return (
    <div
      className={cn(
        "mt-3 flex items-center gap-3.5 rounded-card p-4 card-shadow transition-colors",
        soon ? "bg-brand-soft/70 dark:bg-brand/16" : "bg-card dark:bg-dcard"
      )}
    >
      <span className="relative shrink-0">
        <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90">
          <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" className="stroke-sep dark:stroke-dsep" />
          <circle
            cx="20" cy="20" r={r} fill="none" strokeWidth="4" strokeLinecap="round"
            className="stroke-brand transition-[stroke-dashoffset] duration-700"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - elapsed / shiftSpan)}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums text-brand">
          {Math.round((elapsed / shiftSpan) * 100)}%
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[11.5px] font-bold uppercase tracking-wide",
            soon ? "text-brand" : "text-sub dark:text-dsub"
          )}
        >
          {soon ? `Starts in ${Math.max(1, Math.round(diff / 60000))} min` : `In ${fmtDur(diff)}`}
        </span>
        <span className="mt-0.5 block truncate text-[16px] font-semibold text-ink dark:text-white">{next.label}</span>
        <span className="block truncate text-[12.5px] tabular-nums text-sub dark:text-dsub">
          {next.time}
          {next.sub ? ` · ${next.sub}` : ""}
        </span>
      </span>
      {next.kind === "lunch" ? (
        <button onClick={onLunch} className="press shrink-0 rounded-full bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white">
          Start lunch
        </button>
      ) : next.kind === "job" && next.jobId ? (
        <button
          onClick={() => onJob(next.jobId!)}
          className="press flex shrink-0 items-center gap-1 rounded-full bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white"
        >
          Open <ArrowRight size={13} />
        </button>
      ) : null}
    </div>
  );
}

function TodayPlan({
  now, clockInLabel, clockOutLabel, onOpenJob,
}: {
  now: number;
  clockInLabel?: string;
  clockOutLabel?: string;
  onOpenJob: (id: string) => void;
}) {
  const plan = useTodayPlan();
  const nextAt = plan.find((p) => p.at > now)?.at;
  return (
    <div className="relative">
      <div className="absolute bottom-[22px] left-[5px] top-[22px] w-px bg-sep dark:bg-dsep" />
      {plan.map((p) => {
        const passed = p.at <= now;
        const isNext = p.at === nextAt;
        const actual =
          p.kind === "start" && clockInLabel ? clockInLabel : p.kind === "finish" && clockOutLabel ? clockOutLabel : null;
        return (
          <div
            key={p.time + p.label}
            className={cn(
              "relative flex items-center gap-4 rounded-lg py-[9px] pl-6 pr-1",
              isNext && "-mx-2 bg-brand-soft/60 pl-8 pr-3 dark:bg-brand/14"
            )}
          >
            <span
              className={cn(
                "absolute top-1/2 h-[11px] w-[11px] -translate-y-1/2 rounded-full border-2",
                isNext
                  ? "left-[2px] border-brand bg-brand"
                  : passed
                    ? "left-[0px] border-ok bg-ok"
                    : "left-[0px] border-sub/45 bg-card dark:border-dsub/45 dark:bg-dcard"
              )}
            />
            <span
              className={cn(
                "w-11 shrink-0 text-[13.5px] font-bold tabular-nums",
                isNext ? "text-brand" : passed ? "text-ink dark:text-white" : "text-sub dark:text-dsub"
              )}
            >
              {actual ?? p.time}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate text-[14.5px]",
                  passed && !isNext ? "text-sub dark:text-dsub" : "font-medium text-ink dark:text-white"
                )}
              >
                {p.label}
                {actual && <span className="ml-1.5 text-[11.5px] font-semibold text-ok">recorded</span>}
              </span>
              {p.sub && <span className="block truncate text-[12px] text-sub dark:text-dsub">{p.sub}</span>}
            </span>
            {p.kind === "job" && p.jobId && (
              <button
                onClick={() => onOpenJob(p.jobId!)}
                className="press flex shrink-0 items-center gap-0.5 rounded-full bg-fill px-2.5 py-1 text-[11.5px] font-semibold text-brand dark:bg-dcard"
              >
                <ClipboardList size={12} /> Open
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
