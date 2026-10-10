import { useState } from "react";
import {
  ChevronLeft, ChevronRight, Clock, FilePen, Send, AlertTriangle,
  Coffee, Briefcase, History, CheckCircle2, Info, ShieldAlert,
  Lock as LockIcon, Download,
} from "lucide-react";
import { useApp, LIVE_SHIFT_ID } from "../state";
import {
  Page, DetailPage, Card, Pill, SectionTitle, Group, Row, Button,
  statusTone, EmptyState, Sheet,
} from "../ui";
import { PAY_PERIODS, PAY_RATES, EMPLOYEE } from "../data";
import { DEMO_DISCLAIMER, DEMO_TOTALS_SOURCE } from "../demo/shiftRecords";
import { EVENT_LABEL, fmtClock, fmtMinutes, overtimeChips } from "../calc/overtime";
import type { DayView, Interval } from "../calc/overtime";
import { cn } from "../utils/cn";

// ─── shared bits ───────────────────────────────────────────────────────────

function Stat({ label, value, tone }: { label: string; value: string; tone?: "brand" | "warn" | "ok" | "muted" }) {
  return (
    <div>
      <p
        className={cn(
          "text-[17px] font-bold tabular-nums leading-tight",
          tone === "brand" && "text-brand",
          tone === "warn" && "text-[#C47608] dark:text-[#FFB340]",
          tone === "ok" && "text-[#248A3D] dark:text-[#30D158]",
          (!tone || tone === "muted") && "text-ink dark:text-white"
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11.5px] font-medium uppercase tracking-wide text-sub dark:text-dsub">{label}</p>
    </div>
  );
}

function DemoChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warn/14 px-2 py-[3px] text-[11px] font-semibold text-[#C47608] dark:bg-warn/18 dark:text-[#FFB340]">
      <Info size={11} /> Demo data
    </span>
  );
}

/** Why these numbers may still change — shown verbatim from the calculation. */
function ProvisionalNote({ day, compact }: { day: DayView; compact?: boolean }) {
  if (!day.provisional) return null;
  return (
    <div
      className={cn(
        "rounded-xl border-l-[3px] border-warn bg-warn/10 px-3.5 py-3 dark:bg-warn/14",
        compact ? "mt-2" : "mt-4"
      )}
    >
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[#C47608] dark:text-[#FFB340]">
        <AlertTriangle size={14} /> Provisional calculation
      </p>
      <ul className="mt-1.5 space-y-1">
        {day.provisionalReasons.map((r, i) => (
          <li key={i} className="text-[12.5px] leading-snug text-[#8A5407] dark:text-[#FFCE8A]">
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── My hours ──────────────────────────────────────────────────────────────

export default function HoursScreen() {
  const { push, dayViews, submittedTs, toast } = useApp();
  const [pi, setPi] = useState(0);
  const period = PAY_PERIODS[pi];
  const isCurrent = pi === 0;

  // Weekly summary for the current period, derived from the event logs.
  const week = dayViews;
  const sum = (fn: (d: DayView) => number) => week.reduce((a, d) => a + fn(d), 0);
  const worked = sum((d) => d.totals.workedMinutes);
  const regular = sum((d) => d.totals.regularMinutes);
  const unpaid = sum((d) => d.totals.unpaidMinutes);
  const eligible = sum((d) => d.eligibleMinutes);
  const pending = sum((d) => d.pendingMinutes);
  const approved = sum((d) => d.approvedMinutes);
  const provisionalDays = week.filter((d) => d.provisional);
  const barTotal = Math.max(regular + eligible, 1);

  // Pay estimate — approved overtime only. Pending overtime is never included.
  const money = (n: number) =>
    `${PAY_RATES.currency}${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const grossRegular = (regular / 60) * PAY_RATES.regular;
  const grossOt = (approved / 60) * PAY_RATES.overtime;
  const gross = grossRegular + grossOt;
  const pendingValue = (pending / 60) * PAY_RATES.overtime;

  /** A plain-text statement of the worker's own hours, generated on device. */
  const downloadStatement = () => {
    const L: string[] = [];
    const rule = "=".repeat(58);
    L.push("SHIFTLINE — HOURS STATEMENT (ESTIMATE)", rule);
    L.push(`Employee:     ${EMPLOYEE.name} (${EMPLOYEE.number})`);
    L.push(`Company:      Northstar Operations`);
    L.push(`Pay period:   ${period.label}`);
    L.push(`Generated:    ${new Date().toLocaleString("en-GB")}`, "");
    L.push("SHIFT DETAIL", "-".repeat(58));
    for (const d of week) {
      const t = d.totals;
      const tz = d.record.policy.timezone;
      L.push(`${d.record.label} · ${d.record.site}`);
      L.push(`  Scheduled     ${fmtClock(d.record.policy.scheduledStart, tz)} – ${fmtClock(d.record.policy.scheduledEnd, tz)}`);
      L.push(`  Actual        ${fmtClock(t.clockIn, tz)} -> ${fmtClock(t.clockOut, tz)}`);
      L.push(`  Clocked       ${fmtMinutes(t.clockedMinutes)}`);
      L.push(`  Unpaid        - ${fmtMinutes(t.unpaidMinutes)}`);
      L.push(`  Worked        ${fmtMinutes(t.workedMinutes)}`);
      L.push(`  Regular       ${fmtMinutes(t.regularMinutes)}`);
      L.push(`  OT eligible   ${fmtMinutes(d.eligibleMinutes)}`);
      L.push(`  OT pending    ${fmtMinutes(d.pendingMinutes)}    OT approved  ${fmtMinutes(d.approvedMinutes)}`);
      L.push(`  Timesheet     ${d.record.timesheetStatus}${d.provisional ? "  [PROVISIONAL]" : ""}`);
      for (const r of d.provisionalReasons) L.push(`     ! ${r}`);
      if (d.decisionReason) L.push(`     decision: ${d.decisionReason}`);
      L.push("");
    }
    L.push("PERIOD TOTALS", "-".repeat(58));
    L.push(`  Clocked        ${fmtMinutes(sum((d) => d.totals.clockedMinutes))}`);
    L.push(`  Unpaid breaks  ${fmtMinutes(unpaid)}`);
    L.push(`  Worked         ${fmtMinutes(worked)}`);
    L.push(`  Regular        ${fmtMinutes(regular)}`);
    L.push(`  OT eligible    ${fmtMinutes(eligible)}`);
    L.push(`  OT pending     ${fmtMinutes(pending)}   (excluded from the estimate)`);
    L.push(`  OT approved    ${fmtMinutes(approved)}`, "");
    L.push(`ESTIMATED GROSS  ${money(gross)}`);
    L.push(`  Regular        ${money(grossRegular)} @ ${PAY_RATES.currency}${PAY_RATES.regular.toFixed(2)}/h`);
    L.push(`  Overtime       ${money(grossOt)} @ ${PAY_RATES.currency}${PAY_RATES.overtime.toFixed(2)}/h`, "");
    L.push("ESTIMATE ONLY - not a payslip. Payroll is final when the period locks.");
    L.push("Overtime counts only once a manager has approved it.");

    const blob = new Blob([L.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shiftline-hours-${period.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast("Statement saved to this device");
  };

  return (
    <Page title="Hours">
      {/* period selector */}
      <div className="mt-4 flex items-center justify-between rounded-card bg-card px-2 py-1.5 card-shadow dark:bg-dcard">
        <button
          onClick={() => setPi((i) => Math.min(i + 1, PAY_PERIODS.length - 1))}
          disabled={pi === PAY_PERIODS.length - 1}
          className="press flex h-9 w-9 items-center justify-center rounded-full text-brand disabled:opacity-30"
          aria-label="Earlier period"
        >
          <ChevronLeft size={20} strokeWidth={2.4} />
        </button>
        <div className="text-center">
          <p className="text-[16px] font-semibold tabular-nums text-ink dark:text-white">{period.label}</p>
          <p className="text-[12px] text-sub dark:text-dsub">Pay period · {period.status}</p>
        </div>
        <button
          onClick={() => setPi((i) => Math.max(i - 1, 0))}
          disabled={pi === 0}
          className="press flex h-9 w-9 items-center justify-center rounded-full text-brand disabled:opacity-30"
          aria-label="Later period"
        >
          <ChevronRight size={20} strokeWidth={2.4} />
        </button>
      </div>

      {/* period summary */}
      <Card className="hero-shadow mt-4 p-5">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium uppercase tracking-wide text-sub dark:text-dsub">
            {isCurrent ? "Worked this week" : "Worked this period"}
          </p>
          <DemoChip />
        </div>
        <p className="mt-1 text-[44px] font-bold tabular-nums leading-none tracking-tight text-ink dark:text-white">
          {isCurrent ? fmtMinutes(worked) : period.total}
        </p>
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-sep/70 pt-4 dark:border-dsep/70">
          <Stat label="Regular" value={isCurrent ? fmtMinutes(regular) : period.regular} />
          <Stat
            label="Overtime"
            value={isCurrent ? fmtMinutes(eligible) : period.overtime}
            tone={eligible > 0 ? "warn" : undefined}
          />
          <Stat label="Unpaid breaks" value={isCurrent ? fmtMinutes(unpaid) : period.breaks} tone="muted" />
        </div>
      </Card>

      {isCurrent && (
        <>
          {/* ── weekly summary, above the daily entries ── */}
          <SectionTitle>Weekly summary</SectionTitle>
          <Card className="p-5">
            <div className="flex h-[10px] w-full overflow-hidden rounded-full bg-fill dark:bg-dfill">
              <span
                className="h-full bg-brand transition-all duration-700"
                style={{ width: `${(regular / barTotal) * 100}%` }}
              />
              <span
                className="h-full bg-warn transition-all duration-700"
                style={{ width: `${(eligible / barTotal) * 100}%` }}
              />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-sub dark:text-dsub">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-brand" /> Regular {fmtMinutes(regular)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-warn" /> Overtime eligible {fmtMinutes(eligible)}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3.5 border-t border-sep/70 pt-4 dark:border-dsep/70">
              <Stat label="Shifts recorded" value={`${week.filter((d) => d.totals.clockOut).length} of ${week.length}`} />
              <Stat label="Clocked time" value={fmtMinutes(sum((d) => d.totals.clockedMinutes))} />
              <Stat label="Overtime pending" value={fmtMinutes(pending)} tone={pending > 0 ? "warn" : "muted"} />
              <Stat label="Overtime approved" value={fmtMinutes(approved)} tone={approved > 0 ? "ok" : "muted"} />
            </div>

            {provisionalDays.length > 0 && (
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-fill px-3.5 py-2.5 text-[12.5px] leading-snug text-sub dark:bg-dfill dark:text-dsub">
                <AlertTriangle size={14} className="mt-px shrink-0 text-warn" />
                <span>
                  {provisionalDays.map((d) => d.record.label).join(", ")}{" "}
                  {provisionalDays.length === 1 ? "is" : "are"} provisional and excluded from confirmed totals.
                </span>
              </p>
            )}
            <p className="mt-3 text-[12.5px] leading-snug text-sub dark:text-dsub">
              Overtime pending is requested, not approved. It only counts toward pay once a manager approves it.
            </p>
          </Card>

          {/* ── pay estimate ── */}
          <SectionTitle>Pay estimate</SectionTitle>
          <Card className="overflow-hidden">
            <div className="bg-brand px-5 py-4">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-white/70">
                  Estimated gross · this period
                </p>
                <span className="flex items-center gap-1 rounded-full bg-white/18 px-2.5 py-1 text-[11px] font-semibold text-white">
                  <LockIcon size={11} /> {PAY_RATES.periodLocked ? "Locked" : "Estimate"}
                </span>
              </div>
              <p className="mt-1.5 text-[38px] font-bold tabular-nums leading-none tracking-tight text-white">
                {money(gross)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 px-5 py-4">
              <Stat label={`Regular · ${fmtMinutes(regular)}`} value={money(grossRegular)} />
              <Stat label={`Approved OT · ${fmtMinutes(approved)}`} value={money(grossOt)} tone="ok" />
            </div>
            <div className="border-t border-sep/70 px-5 py-3.5 dark:border-dsep/70">
              <p className="flex items-start gap-2 text-[12.5px] leading-snug text-sub dark:text-dsub">
                <Info size={14} className="mt-px shrink-0 text-warn" />
                <span>
                  {pending > 0 ? (
                    <>
                      <strong className="font-semibold text-[#C47608] dark:text-[#FFB340]">
                        {fmtMinutes(pending)} of pending overtime ({money(pendingValue)}) is excluded.
                      </strong>{" "}
                      It only counts once approved.
                    </>
                  ) : (
                    "No overtime is pending, so nothing is excluded from this figure."
                  )}
                </span>
              </p>
              <p className="mt-2 text-[12px] leading-snug text-sub dark:text-dsub">
                Rates: {PAY_RATES.currency}
                {PAY_RATES.regular.toFixed(2)}/h regular, {PAY_RATES.currency}
                {PAY_RATES.overtime.toFixed(2)}/h overtime. This is an estimate from your recorded hours — payroll is
                final when the period locks.
              </p>
            </div>
            <div className="border-t border-sep/70 px-5 py-3.5 dark:border-dsep/70">
              <Button variant="secondary" size="md" onClick={downloadStatement}>
                <Download size={17} /> Download Hours Statement
              </Button>
            </div>
          </Card>

          {/* ── daily entries ── */}
          <SectionTitle>Shifts</SectionTitle>
          <Card>
            {week.map((d, i) => (
              <DayRow key={d.record.id} day={d} last={i === week.length - 1} onOpen={() => push("timesheet", { recordId: d.record.id })} />
            ))}
          </Card>

          <p className="mt-4 px-1 text-[12.5px] leading-relaxed text-sub dark:text-dsub">{DEMO_DISCLAIMER}</p>
        </>
      )}

      {!isCurrent && (
        <Card className="mt-5">
          <EmptyState
            icon={<History size={26} />}
            title="Closed period"
            message={`Day-level records for ${period.label} are held by payroll. Only the period totals are shown here.`}
          />
        </Card>
      )}

      {isCurrent && submittedTs.length === 0 && (
        <p className="mt-3 px-1 text-center text-[12.5px] text-sub dark:text-dsub">
          Open a shift to see how its totals were derived.
        </p>
      )}
    </Page>
  );
}

function DayRow({ day, last, onOpen }: { day: DayView; last: boolean; onOpen: () => void }) {
  const t = day.totals;
  const isLive = day.record.id === LIVE_SHIFT_ID;
  return (
    <button
      onClick={onOpen}
      className={cn(
        "press-row w-full px-4 py-3.5 text-left",
        !last && "border-b border-sep/80 dark:border-dsep/70"
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className={cn("text-[16px] font-semibold", isLive ? "text-brand" : "text-ink dark:text-white")}>
            {day.record.label}
          </span>
          {day.provisional && <Pill tone="orange" dot>Provisional</Pill>}
        </span>
        <span className="flex items-center gap-2">
          <Pill tone={statusTone(day.record.timesheetStatus)}>{day.record.timesheetStatus}</Pill>
          <ChevronRight size={16} className="text-sub/70 dark:text-dsub/70" />
        </span>
      </span>

      <span className="mt-1.5 block text-[12.5px] tabular-nums text-sub dark:text-dsub">
        Scheduled {fmtClock(day.record.policy.scheduledStart, day.record.policy.timezone)} –{" "}
        {fmtClock(day.record.policy.scheduledEnd, day.record.policy.timezone)}
        {"  ·  "}Actual {fmtClock(t.clockIn, day.record.policy.timezone)} → {fmtClock(t.clockOut, day.record.policy.timezone)}
      </span>

      <span className="mt-2.5 grid grid-cols-5 gap-2">
        <MiniCell label="Worked" value={t.clockOut ? fmtMinutes(t.workedMinutes) : "—"} />
        <MiniCell label="Unpaid" value={fmtMinutes(t.unpaidMinutes)} />
        <MiniCell label="Regular" value={fmtMinutes(t.regularMinutes)} />
        <MiniCell
          label="OT pending"
          value={fmtMinutes(day.pendingMinutes)}
          tone={day.pendingMinutes > 0 ? "warn" : undefined}
        />
        <MiniCell
          label="OT approved"
          value={fmtMinutes(day.approvedMinutes)}
          tone={day.approvedMinutes > 0 ? "ok" : undefined}
        />
      </span>
    </button>
  );
}

function MiniCell({ label, value, tone }: { label: string; value: string; tone?: "warn" | "ok" }) {
  return (
    <span className="block">
      <span
        className={cn(
          "block text-[13.5px] font-bold tabular-nums",
          tone === "warn" && "text-[#C47608] dark:text-[#FFB340]",
          tone === "ok" && "text-[#248A3D] dark:text-[#30D158]",
          !tone && "text-ink dark:text-white"
        )}
      >
        {value}
      </span>
      <span className="mt-px block truncate text-[10.5px] font-medium uppercase tracking-wide text-sub dark:text-dsub">
        {label}
      </span>
    </span>
  );
}

// ─── Day detail: recorded events and how the totals were derived ───────────

export function TimesheetDetails({ params }: { params?: Record<string, any> }) {
  const { pop, push, dayViews, submitTimesheet, submittedTs, toast, requestOvertimeForShift } = useApp();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [includeOt, setIncludeOt] = useState(false);
  const [otMinutes, setOtMinutes] = useState(0);
  const [otReason, setOtReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const day =
    dayViews.find((d) => d.record.id === params?.recordId) ??
    dayViews.find((d) => d.record.id === params?.id) ??
    dayViews[0];

  if (!day) {
    return (
      <DetailPage title="Timesheet" onBack={pop} backLabel="Hours">
        <EmptyState icon={<Clock size={26} />} title="No record" message="This shift has no recorded attendance yet." />
      </DetailPage>
    );
  }

  const t = day.totals;
  const tz = day.record.policy.timezone;
  const isLive = day.record.id === LIVE_SHIFT_ID;
  const submitted = submittedTs.includes(day.record.id);
  const status = submitted && day.record.timesheetStatus === "Open" ? "Submitted" : day.record.timesheetStatus;
  const canSubmit = !!t.clockOut && status !== "Submitted" && status !== "Approved" && status !== "Locked";
  const otChips = overtimeChips(t.overtimeEligibleMinutes, day.record.policy.roundingMinutes);

  const doSubmit = () => {
    setSubmitting(true);
    setTimeout(() => {
      if (includeOt && otMinutes > 0) {
        const v = requestOvertimeForShift(day.record.id, otMinutes, otReason);
        if (!v.ok) {
          setSubmitting(false);
          toast(v.errors[0] ?? "Overtime could not be requested", "error");
          return;
        }
      }
      submitTimesheet(day.record.id);
      setSubmitting(false);
      setSubmitOpen(false);
      toast(includeOt && otMinutes > 0 ? "Timesheet submitted with overtime request" : "Timesheet submitted for approval");
    }, 800);
  };

  return (
    <>
      <DetailPage title={isLive ? "Today's Shift" : "Timesheet"} onBack={pop} backLabel="Hours">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-sub dark:text-dsub">
              {day.record.label} · {day.record.site}
            </p>
            <h1 className="mt-1 text-[34px] font-bold tabular-nums leading-none tracking-tight text-ink dark:text-white">
              {t.clockOut ? fmtMinutes(t.workedMinutes) : "—"}
            </h1>
            <p className="mt-1 text-[13px] text-sub dark:text-dsub">
              {t.clockOut ? "Worked time" : "Shift still open"}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Pill tone={statusTone(status)} dot>{status}</Pill>
            {day.provisional && <Pill tone="orange">Provisional</Pill>}
            <DemoChip />
          </div>
        </div>

        <ProvisionalNote day={day} />

        {/* ── scheduled vs actual ── */}
        <Group header="Scheduled and actual" className="mt-6">
          <Row label="Scheduled start" value={fmtClock(day.record.policy.scheduledStart, tz)} />
          <Row label="Scheduled end" value={fmtClock(day.record.policy.scheduledEnd, tz)} />
          <Row label="Actual clock-in" value={fmtClock(t.clockIn, tz)} />
          <Row label="Actual clock-out" value={fmtClock(t.clockOut, tz)} last />
        </Group>

        {/* ── derivation ── */}
        <Group header="How this was calculated" className="mt-6">
          <div className="space-y-2.5 bg-brand-soft/45 px-4 py-4 dark:bg-brand/10">
            {t.breakdown.map((line, i) => (
              <p key={i} className="text-[13.5px] font-medium leading-snug tabular-nums text-brand dark:text-[#A99FF5]">
                {line}
              </p>
            ))}
          </div>
          <div className="border-t border-sep/70 dark:border-dsep/70">
            <Row label="Clocked time" value={fmtMinutes(t.clockedMinutes)} />
            <Row label="Unpaid breaks and departures" value={`− ${fmtMinutes(t.unpaidMinutes)}`} />
            <Row label="Worked time" value={fmtMinutes(t.workedMinutes)} />
            <Row label="Regular hours" value={fmtMinutes(t.regularMinutes)} />
            <Row label="Overtime eligible for review" value={fmtMinutes(t.overtimeEligibleMinutes)} last />
          </div>
        </Group>

        {/* ── unpaid intervals ── */}
        <Group
          header="Unpaid time"
          className="mt-6"
          footer={
            t.unpaidIntervals.length === 0
              ? "No unpaid breaks were recorded on this shift."
              : "Unpaid intervals are deducted from clocked time and never count as worked time."
          }
        >
          {t.unpaidIntervals.length === 0 ? (
            <Row label="None recorded" last />
          ) : (
            t.unpaidIntervals.map((iv, i) => (
              <IntervalRow key={i} iv={iv} tz={tz} last={i === t.unpaidIntervals.length - 1} />
            ))
          )}
        </Group>

        {/* ── paid job time ── */}
        {t.jobIntervals.length > 0 && (
          <Group
            header="Assigned job time"
            className="mt-6"
            footer="Time on assigned jobs is working time. It is paid and is not deducted from your total."
          >
            {t.jobIntervals.map((iv, i) => (
              <IntervalRow key={i} iv={iv} tz={tz} icon={<Briefcase size={15} />} last={i === t.jobIntervals.length - 1} />
            ))}
          </Group>
        )}

        {/* ── overtime approval state, kept separate from the request ── */}
        <Group header="Overtime" className="mt-6">
          <Row label="Eligible for review" value={fmtMinutes(day.eligibleMinutes)} />
          <Row label="Requested" value={day.requestedMinutes ? fmtMinutes(day.requestedMinutes) : "—"} />
          <Row
            label="Pending approval"
            right={
              <span className="flex items-center gap-2">
                <span className="tabular-nums text-[#C47608] dark:text-[#FFB340]">
                  {day.pendingMinutes ? fmtMinutes(day.pendingMinutes) : "—"}
                </span>
                {day.approvalState === "requested_pending" && <Pill tone="orange">Pending</Pill>}
              </span>
            }
          />
          <Row
            label="Approved"
            right={
              <span className="flex items-center gap-2">
                <span className="tabular-nums text-[#248A3D] dark:text-[#30D158]">
                  {day.approvedMinutes ? fmtMinutes(day.approvedMinutes) : "—"}
                </span>
                {day.approvalState === "approved" && <Pill tone="green">Approved</Pill>}
              </span>
            }
          />
          {day.approvalState === "declined" && (
            <Row label="Declined" value={fmtMinutes(day.declinedMinutes)} last={!day.decisionReason} />
          )}
          {day.decisionReason && (
            <div className="border-t border-sep/70 px-4 py-3.5 dark:border-dsep/70">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-sub dark:text-dsub">
                <CheckCircle2 size={13} className={day.approvalState === "declined" ? "text-bad" : "text-ok"} />
                Manager decision{day.decidedBy ? ` · ${day.decidedBy}` : ""}
              </p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink dark:text-white">{day.decisionReason}</p>
            </div>
          )}
          {!day.decisionReason && day.approvalState === "requested_pending" && (
            <div className="border-t border-sep/70 px-4 py-3 dark:border-dsep/70">
              <p className="text-[13px] leading-snug text-sub dark:text-dsub">
                Awaiting a decision. Pending overtime is not approved and is not guaranteed pay.
              </p>
            </div>
          )}
          {day.approvalState === "none" && (
            <div className="border-t border-sep/70 px-4 py-3 dark:border-dsep/70">
              <p className="text-[13px] leading-snug text-sub dark:text-dsub">
                {day.eligibleMinutes > 0
                  ? "Recorded time supports an overtime request for this shift."
                  : "Recorded time supports no overtime for this shift."}
              </p>
            </div>
          )}
        </Group>

        {/* ── audit: the original events, preserved ── */}
        <Group
          header={`Recorded events · ${t.countedEvents.length} counted`}
          className="mt-6"
          footer={
            t.excludedEventIds.length > 0
              ? `${t.excludedEventIds.length} event(s) excluded from the calculation are still preserved in the audit history.`
              : "Original events are never overwritten. Corrections are added alongside them."
          }
        >
          {t.countedEvents.map((e, i) => (
            <div
              key={e.id}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5",
                i < t.countedEvents.length - 1 && "border-b border-sep/60 dark:border-dsep/60"
              )}
            >
              <span className="w-[52px] shrink-0 text-[14px] font-semibold tabular-nums text-ink dark:text-white">
                {fmtClock(e.at, tz)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-ink dark:text-white">
                  {EVENT_LABEL[e.type]}
                  {e.note ? ` · ${e.note}` : ""}
                </span>
                <span className="block text-[11.5px] text-sub dark:text-dsub">
                  {e.source === "correction" ? "Correction" : e.source === "kiosk" ? "Kiosk" : e.source === "import" ? "Imported" : "This device"} · {e.actor}
                </span>
              </span>
              <EventSyncChip sync={e.sync} />
            </div>
          ))}
          {t.excludedEventIds.length > 0 && (
            <div className="border-t border-sep/70 bg-fill/60 px-4 py-3 dark:border-dsep/70 dark:bg-dfill/50">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-sub dark:text-dsub">
                Excluded from the maths
              </p>
              <ul className="mt-1.5 space-y-1">
                {t.issues
                  .filter((i) => i.code === "duplicate_event" || i.code === "superseded_event")
                  .map((i, k) => (
                    <li key={k} className="text-[12.5px] leading-snug text-sub dark:text-dsub">
                      {i.message}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </Group>

        {/* ── actions ── */}
        <div className="mt-7 space-y-2.5 pb-4">
          {canSubmit && (
            <Button onClick={() => { setIncludeOt(false); setOtMinutes(0); setSubmitOpen(true); }}>
              <Send size={18} /> Submit Timesheet
            </Button>
          )}
          {status === "Submitted" && (
            <div className="flex items-center justify-center gap-2.5 rounded-btn bg-info/10 py-3.5 dark:bg-info/15">
              <Clock size={18} className="text-info" />
              <span className="text-[15px] font-semibold text-info">Submitted · awaiting approval</span>
            </div>
          )}
          {day.eligibleMinutes > 0 && day.approvalState === "none" && t.clockOut && (
            <Button variant="tinted" onClick={() => push("overtime", { shiftId: day.record.id })}>
              <Clock size={18} /> Request Overtime · up to {fmtMinutes(day.eligibleMinutes)}
            </Button>
          )}
          {day.eligibleMinutes > 0 && day.provisional && (
            <p className="flex items-start gap-2 px-1 text-[12.5px] leading-snug text-sub dark:text-dsub">
              <ShieldAlert size={14} className="mt-px shrink-0 text-warn" />
              Overtime cannot be requested while this calculation is provisional.
            </p>
          )}
          <Button
            variant="secondary"
            onClick={() =>
              push("correction", {
                tsId: day.record.id,
                date: day.record.label,
                clockIn: fmtClock(t.clockIn, tz),
                clockOut: fmtClock(t.clockOut, tz),
              })
            }
          >
            <FilePen size={18} /> Report a Missing or Wrong Clocking
          </Button>
        </div>

        <p className="pb-2 text-center text-[12px] leading-relaxed text-sub dark:text-dsub">
          Totals source: {DEMO_TOTALS_SOURCE === "backend" ? "Shiftline backend" : "derived on device from the recorded event log"}.
          Shift policy: overtime after {fmtMinutes(day.record.policy.overtimeAfterMinutes)}, rounded down to{" "}
          {day.record.policy.roundingMinutes} minutes, {fmtMinutes(day.record.policy.overtimeGraceMinutes)} grace.
        </p>
      </DetailPage>

      {/* ── submit sheet with a policy-bounded overtime request ── */}
      <Sheet open={submitOpen} onClose={() => setSubmitOpen(false)} title="Submit Timesheet">
        <div className="space-y-3.5">
          {/* preview of exactly what is being submitted */}
          <div className="rounded-card bg-fill p-4 dark:bg-dfill">
            <SheetRow
              label="Scheduled"
              value={`${fmtClock(day.record.policy.scheduledStart, tz)} – ${fmtClock(day.record.policy.scheduledEnd, tz)}`}
            />
            <SheetRow label="Actual" value={`${fmtClock(t.clockIn, tz)} → ${fmtClock(t.clockOut, tz)}`} />
            <SheetRow label="Clocked time" value={fmtMinutes(t.clockedMinutes)} />
            <SheetRow label="Unpaid breaks" value={`− ${fmtMinutes(t.unpaidMinutes)}`} />
            <div className="my-2 border-t border-sep dark:border-dsep" />
            <SheetRow label="Worked time" value={fmtMinutes(t.workedMinutes)} bold />
            <SheetRow label="Regular hours" value={fmtMinutes(t.regularMinutes)} />
            <SheetRow label="Overtime eligible" value={fmtMinutes(t.overtimeEligibleMinutes)} bold />
          </div>

          {day.provisional && (
            <div className="rounded-card border-l-[3px] border-warn bg-warn/10 px-3.5 py-3 dark:bg-warn/14">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[#C47608] dark:text-[#FFB340]">
                <AlertTriangle size={14} /> This day is incomplete
              </p>
              <ul className="mt-1.5 space-y-1">
                {day.provisionalReasons.map((r, i) => (
                  <li key={i} className="text-[12.5px] leading-snug text-[#8A5407] dark:text-[#FFCE8A]">{r}</li>
                ))}
              </ul>
              <p className="mt-2 text-[12.5px] leading-snug text-[#8A5407] dark:text-[#FFCE8A]">
                You can still submit, but the hours stay provisional until a correction resolves this.
              </p>
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-3 rounded-card bg-fill p-4 dark:bg-dfill">
            <input
              type="checkbox"
              checked={includeOt}
              disabled={day.provisional || t.overtimeEligibleMinutes <= 0}
              onChange={(e) => {
                setIncludeOt(e.target.checked);
                if (e.target.checked) setOtMinutes(t.overtimeEligibleMinutes);
              }}
              className="mt-0.5 h-[20px] w-[20px] shrink-0 accent-[#5B4DD8]"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-ink dark:text-white">
                Request overtime with this timesheet
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-sub dark:text-dsub">
                {day.provisional
                  ? "Unavailable — this calculation is provisional."
                  : t.overtimeEligibleMinutes <= 0
                    ? "Unavailable — recorded time supports no overtime."
                    : `Up to ${fmtMinutes(t.overtimeEligibleMinutes)}, which is what your recorded time supports.`}
              </span>
            </span>
          </label>

          {includeOt && !day.provisional && t.overtimeEligibleMinutes > 0 && (
            <div className="anim-fade-in space-y-3 rounded-card bg-fill p-4 dark:bg-dfill">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-sub dark:text-dsub">Amount</p>
              <div className="flex flex-wrap gap-2">
                {otChips.map((m) => (
                  <button
                    key={m}
                    onClick={() => setOtMinutes(m)}
                    className={cn(
                      "press rounded-full px-3.5 py-2 text-[14px] font-semibold tabular-nums transition-all",
                      otMinutes === m
                        ? "bg-brand text-white shadow-[0_4px_12px_rgba(91,77,216,0.3)]"
                        : "bg-card text-ink card-shadow dark:bg-dcard dark:text-white"
                    )}
                  >
                    {fmtMinutes(m)}
                  </button>
                ))}
              </div>
              <input
                value={otReason}
                onChange={(e) => setOtReason(e.target.value)}
                placeholder="Reason for the overtime"
                className="w-full rounded-btn bg-card px-3.5 py-3 text-[15px] text-ink outline-none placeholder:text-sub/70 focus:ring-2 focus:ring-brand/60 dark:bg-dcard dark:text-white"
              />
              <p className="text-[12px] leading-snug text-sub dark:text-dsub">
                Submitting creates a <strong className="font-semibold text-[#C47608] dark:text-[#FFB340]">pending</strong>{" "}
                request. It is not approved and is not guaranteed pay until a manager decides.
              </p>
            </div>
          )}

          <Button onClick={doSubmit} loading={submitting}>
            {submitting ? "Submitting…" : includeOt ? "Submit with Overtime Request" : "Submit Timesheet"}
          </Button>
          <Button variant="plain" size="md" onClick={() => setSubmitOpen(false)}>Cancel</Button>
        </div>
      </Sheet>
    </>
  );
}

function SheetRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[14px] text-sub dark:text-dsub">{label}</span>
      <span className={cn("tabular-nums", bold ? "text-[17px] font-bold text-ink dark:text-white" : "text-[15px] font-medium text-ink dark:text-white")}>
        {value}
      </span>
    </div>
  );
}

function IntervalRow({ iv, tz, last, icon }: { iv: Interval; tz: string; last?: boolean; icon?: React.ReactNode }) {
  return (
    <div className={cn("flex items-center gap-3 px-4 py-3", !last && "border-b border-sep/70 dark:border-dsep/70")}>
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]",
          iv.unpaid ? "bg-warn/14 text-[#C47608] dark:text-[#FFB340]" : "bg-info/12 text-info"
        )}
      >
        {icon ?? <Coffee size={15} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-ink dark:text-white">{iv.label}</span>
        <span className="block text-[12.5px] tabular-nums text-sub dark:text-dsub">
          {fmtClock(iv.start, tz)} → {iv.end ? fmtClock(iv.end, tz) : "no end recorded"}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[14px] font-semibold tabular-nums text-ink dark:text-white">
          {iv.resolved ? fmtMinutes(iv.minutes) : "—"}
        </span>
        <span className="block text-[11px] font-medium uppercase tracking-wide text-sub dark:text-dsub">
          {iv.resolved ? (iv.unpaid ? "Unpaid" : "Paid") : "Unresolved"}
        </span>
      </span>
    </div>
  );
}

function EventSyncChip({ sync }: { sync: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    confirmed: { label: "Confirmed", cls: "text-ok" },
    pending: { label: "Pending", cls: "text-sub dark:text-dsub" },
    unsynced: { label: "Saved offline", cls: "text-[#C47608] dark:text-[#FFB340]" },
    superseded: { label: "Superseded", cls: "text-sub/70 dark:text-dsub/70" },
  };
  const m = map[sync] ?? map.pending;
  return <span className={cn("shrink-0 text-[11px] font-semibold", m.cls)}>{m.label}</span>;
}
