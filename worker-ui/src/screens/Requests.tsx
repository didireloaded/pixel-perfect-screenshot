import { useState } from "react";
import {
  PartyPopper, FilePen, ChevronRight, Inbox, CheckCircle2, ArrowRight, Clock, Send,
  AlertTriangle, ShieldAlert, Info, CircleHelp, Briefcase, CalendarDays,
} from "lucide-react";
import { useApp } from "../state";
import { fmtMinutes, overtimeChips, validateOvertimeRequest } from "../calc/overtime";
import { DetailPage, Card, Segmented, Pill, Button, EmptyState, Field, inputCls, SuccessCheck, statusTone, Toggle } from "../ui";
import { JOBS, LEAVE_BALANCE, RequestItem } from "../data";
import { cn } from "../utils/cn";

type Filter = "all" | "pending" | "completed";

interface UniRow {
  id: string;
  icon: React.ReactNode;
  iconCls: string;
  title: string;
  desc: string;
  status: string;
  open: () => void;
}

const isPendingStatus = (s: string) => s === "Pending" || s === "Sent" || s === "In review";

export function RequestsOverview() {
  const { pop, push, requests, dayViews, helpRequests } = useApp();
  const [filter, setFilter] = useState<Filter>("all");

  // One inbox: leave, corrections, overtime and help requests together.
  const reqRows: UniRow[] = requests.map((r) => ({
    id: r.id,
    icon: REQ_ICON[r.type].icon,
    iconCls: REQ_ICON[r.type].cls,
    title: r.title,
    desc: `${r.desc} · ${r.submitted}`,
    status: r.status,
    open: () => push("requestDetails", { id: r.id }),
  }));

  const otRows: UniRow[] = dayViews
    .filter((d) => d.approvalState !== "none")
    .map((d) => ({
      id: `ot-${d.record.id}`,
      icon: REQ_ICON["Overtime Request"].icon,
      iconCls: REQ_ICON["Overtime Request"].cls,
      title: `${fmtMinutes(d.requestedMinutes)} overtime · ${d.record.label}`,
      desc:
        d.approvalState === "approved"
          ? `${fmtMinutes(d.approvedMinutes)} approved${d.decisionReason ? ` · ${d.decisionReason}` : ""}`
          : d.approvalState === "declined"
            ? `Declined${d.decisionReason ? ` · ${d.decisionReason}` : ""}`
            : "Awaiting a decision · not approved, not guaranteed pay",
      status: d.approvalState === "approved" ? "Approved" : d.approvalState === "declined" ? "Declined" : "Pending",
      open: () => push("timesheet", { recordId: d.record.id }),
    }));

  const helpRows: UniRow[] = helpRequests.map((h) => ({
    id: h.id,
    icon: <CircleHelp size={17} />,
    iconCls: "bg-info/12 text-info",
    title: h.subject,
    desc: h.status === "Answered" ? `${h.answeredBy}: ${h.answer}` : `About ${h.about} · awaiting a reply`,
    status: h.status === "Answered" ? "Answered" : "Sent",
    open: () => push("askHelp"),
  }));

  const all = [...otRows, ...reqRows, ...helpRows];
  const list =
    filter === "all"
      ? all
      : filter === "pending"
        ? all.filter((r) => isPendingStatus(r.status))
        : all.filter((r) => !isPendingStatus(r.status));

  return (
    <DetailPage title="Requests" onBack={pop} backLabel="Profile">
      {/* leave balance */}
      <Card className="p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-sub dark:text-dsub">
              Annual leave remaining
            </p>
            <p className="mt-1 text-[32px] font-bold tabular-nums leading-none text-ink dark:text-white">
              {LEAVE_BALANCE.remainingDays}
              <span className="ml-1 text-[15px] font-semibold text-sub dark:text-dsub">
                of {LEAVE_BALANCE.entitlementDays} days
              </span>
            </p>
          </div>
          <button
            onClick={() => push("leave")}
            className="press shrink-0 rounded-full bg-brand px-3.5 py-2 text-[13px] font-semibold text-white shadow-[0_4px_14px_rgba(91,77,216,0.3)]"
          >
            Request
          </button>
        </div>
        <div className="mt-3.5 flex h-[8px] overflow-hidden rounded-full bg-fill dark:bg-dfill">
          <span
            className="h-full bg-ok transition-all duration-700"
            style={{ width: `${(LEAVE_BALANCE.takenDays / LEAVE_BALANCE.entitlementDays) * 100}%` }}
          />
          <span
            className="h-full bg-warn transition-all duration-700"
            style={{ width: `${(LEAVE_BALANCE.pendingDays / LEAVE_BALANCE.entitlementDays) * 100}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-sub dark:text-dsub">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ok" /> Taken {LEAVE_BALANCE.takenDays}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-warn" /> Pending {LEAVE_BALANCE.pendingDays}
          </span>
        </div>
        {LEAVE_BALANCE.upcoming.map((u) => (
          <div key={u.id} className="mt-3.5 flex items-center gap-2.5 border-t border-sep/70 pt-3 dark:border-dsep/70">
            <PartyPopper size={15} className="shrink-0 text-ok" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-ink dark:text-white">{u.label}</span>
              <span className="block text-[12px] text-sub dark:text-dsub">
                {u.type} · {u.days} day{u.days > 1 ? "s" : ""}
              </span>
            </span>
            <Pill tone="green">{u.status}</Pill>
          </div>
        ))}
        <p className="mt-3 text-[11.5px] leading-snug text-sub dark:text-dsub">{LEAVE_BALANCE.note}</p>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button onClick={() => push("leave")} className="press rounded-card bg-card p-4 text-left card-shadow dark:bg-dcard">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ok/12 text-[#248A3D] dark:text-[#30D158]">
            <PartyPopper size={19} />
          </span>
          <span className="mt-3 block text-[16px] font-semibold text-ink dark:text-white">Request Leave</span>
          <span className="mt-0.5 block text-[13px] text-sub dark:text-dsub">Time off & holidays</span>
        </button>
        <button onClick={() => push("correction")} className="press rounded-card bg-card p-4 text-left card-shadow dark:bg-dcard">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand dark:bg-brand/20 dark:text-[#9D91F2]">
            <FilePen size={19} />
          </span>
          <span className="mt-3 block text-[16px] font-semibold text-ink dark:text-white">Fix a Clocking</span>
          <span className="mt-0.5 block text-[13px] text-sub dark:text-dsub">Correct attendance</span>
        </button>
      </div>

      <button
        onClick={() => push("askHelp")}
        className="press mt-3 flex w-full items-center gap-3 rounded-card bg-card p-4 text-left card-shadow dark:bg-dcard"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info/12 text-info">
          <CircleHelp size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold text-ink dark:text-white">Ask about a job or shift</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-sub dark:text-dsub">
            A structured question to your manager — not a group chat.
          </span>
        </span>
        <ChevronRight size={17} className="shrink-0 text-sub/70 dark:text-dsub/70" />
      </button>

      <Segmented
        className="mt-6"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "pending", label: "Pending" },
          { value: "completed", label: "Completed" },
        ]}
      />

      {list.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            icon={<Inbox size={26} />}
            title="Nothing here"
            message={
              filter === "pending"
                ? "No requests are waiting on a decision right now."
                : "Leave, corrections, overtime and help requests all land here with their decision."
            }
          />
        </Card>
      ) : (
        <Card className="mt-4">
          {list.map((r, i) => (
            <button
              key={r.id}
              onClick={r.open}
              className={cn(
                "press-row flex w-full items-center gap-3 px-4 py-3.5 text-left",
                i < list.length - 1 && "border-b border-sep/80 dark:border-dsep/70"
              )}
            >
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]", r.iconCls)}>
                {r.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-ink dark:text-white">{r.title}</span>
                <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-sub dark:text-dsub">{r.desc}</span>
              </span>
              <Pill tone={statusTone(r.status)}>{r.status}</Pill>
              <ChevronRight size={16} className="shrink-0 text-sub/70 dark:text-dsub/70" />
            </button>
          ))}
        </Card>
      )}
    </DetailPage>
  );
}

// ─── Leave request ─────────────────────────────────────────────────────────
export function LeaveRequest() {
  const { pop, addRequest, toast } = useApp();
  const [type, setType] = useState("Annual leave");
  const [from, setFrom] = useState("2026-11-16");
  const [to, setTo] = useState("2026-11-17");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const types = ["Annual leave", "Sick leave", "Unpaid leave", "Other"];

  const submit = () => {
    setSubmitting(true);
    setTimeout(() => {
      addRequest({
        id: `r${Date.now()}`,
        type: "Leave Request",
        title: `${type} · ${fmtRange(from, to)}`,
        desc: reason || "No reason given",
        submitted: "Fri 9 Oct 2026",
        status: "Pending",
        detail: [
          `Leave type: ${type}`,
          `Dates: ${fmtRange(from, to)}`,
          `Reason: ${reason || "—"}`,
        ],
      });
      setSubmitting(false);
      setDone(true);
      toast("Leave request submitted");
    }, 900);
  };

  if (done) {
    return (
      <DetailPage title="Request Leave" onBack={pop} backLabel="Requests">
        <div className="flex flex-col items-center pt-16 text-center">
          <SuccessCheck />
          <h2 className="anim-rise mt-6 text-[24px] font-bold tracking-tight text-ink dark:text-white" style={{ animationDelay: "0.1s" }}>
            Request submitted
          </h2>
          <p className="anim-rise mt-2 max-w-[260px] text-[15px] leading-relaxed text-sub dark:text-dsub" style={{ animationDelay: "0.2s" }}>
            Your {type.toLowerCase()} request for {fmtRange(from, to)} is pending review by Sarah Chen.
          </p>
          <Button className="mt-8" variant="tinted" onClick={pop}>Back to Requests</Button>
        </div>
      </DetailPage>
    );
  }

  return (
    <DetailPage title="Request Leave" onBack={pop} backLabel="Requests">
      <div className="space-y-5">
        <Field label="Leave type">
          <div className="overflow-hidden rounded-card bg-card card-shadow dark:bg-dcard">
            {types.map((t, i) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  "press-row flex w-full items-center justify-between px-4 py-3 text-left text-[16px] text-ink dark:text-white",
                  i < types.length - 1 && "border-b border-sep/80 dark:border-dsep/70"
                )}
              >
                {t}
                {type === t && <CheckCircle2 size={19} className="text-brand" />}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="End date">
            <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <Field label="Reason (optional)">
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Add a short reason for your manager"
            className={cn(inputCls, "resize-none leading-relaxed")}
          />
        </Field>
        <Button onClick={submit} loading={submitting}>
          {submitting ? "Submitting…" : "Submit Request"}
        </Button>
        <p className="pb-4 text-center text-[13px] text-sub dark:text-dsub">
          Your manager is notified immediately and you'll hear back in Shiftline.
        </p>
      </div>
    </DetailPage>
  );
}

function fmtRange(from: string, to: string) {
  const f = new Date(from);
  const t = new Date(to);
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return f.getTime() === t.getTime() ? fmt(f) : `${fmt(f)} – ${fmt(t)}`;
}

// ─── Attendance correction ─────────────────────────────────────────────────
export function CorrectionForm({ params }: { params?: Record<string, any> }) {
  const { pop, addRequest, toast } = useApp();
  const [shift, setShift] = useState(params?.date ?? "Thu 8 Oct");
  const [event, setEvent] = useState<"Clock in" | "Clock out">("Clock out");
  const [missing, setMissing] = useState(false);
  const original = missing
    ? "Not recorded"
    : event === "Clock in"
      ? (params?.clockIn ?? "08:00")
      : (params?.clockOut ?? "17:00");
  const [proposed, setProposed] = useState("17:45");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const shifts = ["Thu 8 Oct", "Wed 7 Oct", "Tue 6 Oct", "Mon 5 Oct"];

  const submit = () => {
    if (!reason.trim()) {
      toast("Please add a correction reason", "error");
      return;
    }
    setSubmitting(true);
    setTimeout(() => {
      addRequest({
        id: `r${Date.now()}`,
        type: "Attendance Correction",
        title: missing ? `Missing ${event.toLowerCase()} · ${shift}` : `${event} fix · ${shift}`,
        desc: missing ? `Not recorded → ${proposed}` : `${original} → ${proposed}`,
        submitted: "Fri 9 Oct 2026",
        status: "Pending",
        detail: [
          `Shift: ${shift} · 08:00 – 17:00`,
          `Event: ${event}${missing ? " (never recorded)" : ""}`,
          `${missing ? "Missing" : "Recorded"}: ${original} · Proposed: ${proposed}`,
          `Reason: ${reason}`,
        ],
      });
      setSubmitting(false);
      setDone(true);
      toast("Correction submitted for review");
    }, 900);
  };

  if (done) {
    return (
      <DetailPage title="Fix a Clocking" onBack={pop}>
        <div className="flex flex-col items-center pt-16 text-center">
          <SuccessCheck />
          <h2 className="anim-rise mt-6 text-[24px] font-bold tracking-tight text-ink dark:text-white" style={{ animationDelay: "0.1s" }}>
            Sent for review
          </h2>
          <p className="anim-rise mt-2 max-w-[270px] text-[15px] leading-relaxed text-sub dark:text-dsub" style={{ animationDelay: "0.2s" }}>
            Your proposed change ({missing ? `no ${event.toLowerCase()} recorded` : original} → {proposed}) was sent to your manager. The timesheet stays unchanged until it's approved.
          </p>
          <Button className="mt-8" variant="tinted" onClick={pop}>Done</Button>
        </div>
      </DetailPage>
    );
  }

  return (
    <DetailPage title="Fix a Clocking" onBack={pop}>
      <div className="space-y-5">
        <Field label="Shift">
          <select className={cn(inputCls, "appearance-none")} value={shift} onChange={(e) => setShift(e.target.value)}>
            {[shift, ...shifts.filter((s) => s !== shift)].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Attendance event">
          <Segmented
            value={event}
            onChange={(v) => setEvent(v as any)}
            options={[
              { value: "Clock in", label: "Clock in" },
              { value: "Clock out", label: "Clock out" },
            ]}
          />
        </Field>
        <div className="flex items-center gap-3 rounded-card bg-card px-4 py-3.5 card-shadow dark:bg-dcard">
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] text-ink dark:text-white">This clocking is missing</span>
            <span className="mt-0.5 block text-[13px] leading-snug text-sub dark:text-dsub">
              I forgot to clock {event === "Clock in" ? "in" : "out"} and nothing was recorded
            </span>
          </span>
          <Toggle on={missing} onChange={setMissing} />
        </div>

        <Field label={missing ? "Time to add" : "Time change"}>
          <div className="flex items-center gap-3 rounded-card bg-card p-4 card-shadow dark:bg-dcard">
            <div className="flex-1 text-center">
              <p className={cn("text-[12px] font-medium uppercase tracking-wide", missing ? "text-bad" : "text-sub dark:text-dsub")}>
                {missing ? "Missing" : "Recorded"}
              </p>
              <p
                className={cn(
                  "mt-1 font-bold tabular-nums",
                  missing ? "text-[17px] text-bad" : "text-[24px] text-sub line-through dark:text-dsub"
                )}
              >
                {original}
              </p>
            </div>
            <ArrowRight size={18} className="shrink-0 text-brand" />
            <div className="flex-1 text-center">
              <p className="text-[12px] font-medium uppercase tracking-wide text-brand">Proposed</p>
              <input
                type="time"
                value={proposed}
                onChange={(e) => setProposed(e.target.value)}
                className="mt-1 w-full rounded-lg bg-brand-soft/70 text-center text-[24px] font-bold tabular-nums text-brand outline-none focus:ring-2 focus:ring-brand/60 dark:bg-brand/20 dark:text-[#9D91F2]"
              />
            </div>
          </div>
        </Field>
        <Field label="Correction reason">
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain what happened, e.g. stayed late for a delivery"
            className={cn(inputCls, "resize-none leading-relaxed")}
          />
        </Field>
        <Button onClick={submit} loading={submitting}>
          {submitting ? "Submitting…" : "Submit for Review"}
        </Button>
        <p className="pb-4 text-center text-[13px] text-sub dark:text-dsub">
          Corrections must be submitted within 5 working days of the shift.
        </p>
      </div>
    </DetailPage>
  );
}

// ─── Request details ───────────────────────────────────────────────────────
export function RequestDetails({ params }: { params?: Record<string, any> }) {
  const { pop, requests } = useApp();
  const r: RequestItem = requests.find((x) => x.id === params?.id) ?? requests[0];
  const steps = [
    { label: "Submitted", desc: r.submitted, done: true },
    { label: "In review", desc: "Reviewed by Sarah Chen", done: r.status !== "Pending" },
    {
      label: r.status === "Declined" ? "Declined" : "Approved",
      desc: r.decision ?? "Awaiting decision",
      done: r.status !== "Pending",
    },
  ];

  return (
    <DetailPage title="Request" onBack={pop} backLabel="Requests">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-wide text-sub dark:text-dsub">{r.type}</p>
          <h1 className="mt-1 text-[24px] font-bold leading-tight tracking-tight text-ink dark:text-white">{r.title}</h1>
          <p className="mt-1 text-[14px] text-sub dark:text-dsub">Submitted {r.submitted}</p>
        </div>
        <Pill tone={statusTone(r.status)} dot>{r.status}</Pill>
      </div>

      <Card className="mt-6 px-4 py-2">
        {r.detail.map((d, i) => (
          <p key={i} className={cn("py-2.5 text-[15px] text-ink dark:text-white", i < r.detail.length - 1 && "border-b border-sep/70 dark:border-dsep/70")}>
            {d}
          </p>
        ))}
      </Card>

      <p className="mb-2.5 mt-7 px-1 text-[13px] font-semibold uppercase tracking-wide text-sub dark:text-dsub">Status</p>
      <Card className="px-5 py-4">
        <div className="relative">
          <div className="absolute bottom-3 left-[9px] top-3 w-px bg-sep dark:bg-dsep" />
          {steps.map((s, i) => (
            <div key={i} className="relative flex items-start gap-4 py-2.5 pl-8">
              <span
                className={cn(
                  "absolute left-0 top-[13px] flex h-[19px] w-[19px] items-center justify-center rounded-full",
                  s.done
                    ? s.label === "Declined"
                      ? "bg-bad"
                      : "bg-ok"
                    : "border-2 border-sub/40 bg-card dark:border-dsub/40 dark:bg-dcard"
                )}
              >
                {s.done && <CheckCircle2 size={13} className="text-white" />}
              </span>
              <span>
                <span className={cn("block text-[15px] font-semibold", s.done ? "text-ink dark:text-white" : "text-sub dark:text-dsub")}>
                  {s.label}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-sub dark:text-dsub">{s.desc}</span>
              </span>
            </div>
          ))}
        </div>
      </Card>
    </DetailPage>
  );
}

const REQ_ICON: Record<RequestItem["type"], { icon: React.ReactNode; cls: string }> = {
  "Leave Request": { icon: <PartyPopper size={17} />, cls: "bg-ok/12 text-[#248A3D] dark:text-[#30D158]" },
  "Attendance Correction": { icon: <FilePen size={17} />, cls: "bg-brand-soft text-brand dark:bg-brand/20 dark:text-[#9D91F2]" },
  "Overtime Request": { icon: <Clock size={17} />, cls: "bg-warn/14 text-[#C47608] dark:text-[#FFB340]" },
  "Timesheet Submission": { icon: <Send size={17} />, cls: "bg-info/12 text-info" },
};

// ─── Overtime request ──────────────────────────────────────────────────────
// The amount a worker may request is bounded by the calculation layer: only
// overtime supported by recorded events and the shift policy can be submitted,
// and a provisional calculation cannot be submitted at all.
export function OvertimeRequest({ params }: { params?: Record<string, any> }) {
  const { pop, dayViews, requestOvertimeForShift, toast } = useApp();

  const claimable = dayViews.filter((d) => d.totals.clockOut && d.approvalState === "none");
  const [shiftId, setShiftId] = useState(
    params?.shiftId && dayViews.some((d) => d.record.id === params.shiftId)
      ? params.shiftId
      : claimable[0]?.record.id ?? dayViews[0]?.record.id ?? ""
  );
  const day = dayViews.find((d) => d.record.id === shiftId);
  const [minutes, setMinutes] = useState(0);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!day) {
    return (
      <DetailPage title="Request Overtime" onBack={pop} backLabel="Hours">
        <EmptyState
          icon={<Clock size={26} />}
          title="Nothing to claim"
          message="Overtime can only be requested for a shift that has a recorded clock-out."
        />
      </DetailPage>
    );
  }

  const t = day.totals;
  const eligible = t.overtimeEligibleMinutes;
  const unit = day.record.policy.roundingMinutes || 5;
  const chips = overtimeChips(eligible, unit);
  const chosen = minutes || eligible;
  const validation = validateOvertimeRequest(chosen, t, day.record.policy);
  const blocked = day.provisional || eligible <= 0;

  const submit = () => {
    setSubmitting(true);
    setTimeout(() => {
      const v = requestOvertimeForShift(day.record.id, chosen, reason);
      setSubmitting(false);
      if (!v.ok) {
        toast(v.errors[0] ?? "Overtime could not be requested", "error");
        return;
      }
      setDone(true);
      toast("Overtime requested · pending approval");
    }, 800);
  };

  if (done) {
    return (
      <DetailPage title="Request Overtime" onBack={pop} backLabel="Hours">
        <div className="flex flex-col items-center pt-14 text-center">
          <SuccessCheck />
          <h2 className="anim-rise mt-6 text-[24px] font-bold tracking-tight text-ink dark:text-white" style={{ animationDelay: "0.1s" }}>
            Requested, not approved
          </h2>
          <p className="anim-rise mt-2 max-w-[290px] text-[15px] leading-relaxed text-sub dark:text-dsub" style={{ animationDelay: "0.2s" }}>
            {fmtMinutes(validation.cappedMinutes)} on {day.record.label} is now{" "}
            <strong className="font-semibold text-[#C47608] dark:text-[#FFB340]">pending approval</strong>. It is not
            approved and is not guaranteed pay until your manager decides.
          </p>
          <div className="anim-rise mt-6 w-full rounded-card bg-fill p-4 text-left dark:bg-dfill" style={{ animationDelay: "0.3s" }}>
            <p className="text-[13px] text-sub dark:text-dsub">Eligible from recorded time</p>
            <p className="text-[16px] font-bold tabular-nums text-ink dark:text-white">{fmtMinutes(eligible)}</p>
            <p className="mt-2.5 text-[13px] text-sub dark:text-dsub">Requested</p>
            <p className="text-[16px] font-bold tabular-nums text-[#C47608] dark:text-[#FFB340]">
              {fmtMinutes(validation.cappedMinutes)}
            </p>
          </div>
          <Button className="mt-7" variant="tinted" onClick={pop}>Back to Hours</Button>
        </div>
      </DetailPage>
    );
  }

  return (
    <DetailPage title="Request Overtime" onBack={pop} backLabel="Hours">
      <p className="px-1 text-[15px] leading-relaxed text-sub dark:text-dsub">
        You can only request overtime your recorded time and the shift policy support. Nothing here is approved until a
        manager decides.
      </p>

      <Field label="Shift" >
        <div className="mt-2 overflow-hidden rounded-card bg-card card-shadow dark:bg-dcard">
          {dayViews.map((d, i) => {
            const selectable = !!d.totals.clockOut && d.approvalState === "none";
            const selected = d.record.id === shiftId;
            return (
              <button
                key={d.record.id}
                disabled={!selectable}
                onClick={() => { setShiftId(d.record.id); setMinutes(0); }}
                className={cn(
                  "press-row flex w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-45",
                  i < dayViews.length - 1 && "border-b border-sep/80 dark:border-dsep/70",
                  selected && "bg-brand-soft/60 dark:bg-brand/15"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-ink dark:text-white">{d.record.label}</span>
                  <span className="block text-[12.5px] tabular-nums text-sub dark:text-dsub">
                    Worked {d.totals.clockOut ? fmtMinutes(d.totals.workedMinutes) : "—"} · eligible{" "}
                    {fmtMinutes(d.eligibleMinutes)}
                  </span>
                </span>
                {!selectable && (
                  <Pill tone={d.approvalState === "none" ? "gray" : statusTone(d.approvalState === "approved" ? "Approved" : "Pending")}>
                    {d.totals.clockOut ? "Already claimed" : "No clock-out"}
                  </Pill>
                )}
                {selectable && selected && <CheckCircle2 size={19} className="shrink-0 text-brand" />}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="mt-5 rounded-card bg-brand-soft/50 p-4 dark:bg-brand/12">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-brand dark:text-[#A99FF5]">
          Derived from your recorded events
        </p>
        {t.breakdown.map((line, i) => (
          <p key={i} className="mt-1.5 text-[13.5px] font-medium leading-snug tabular-nums text-brand dark:text-[#A99FF5]">
            {line}
          </p>
        ))}
      </div>

      {day.provisional && (
        <div className="mt-4 rounded-xl border-l-[3px] border-warn bg-warn/10 px-3.5 py-3 dark:bg-warn/14">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[#C47608] dark:text-[#FFB340]">
            <AlertTriangle size={14} /> Cannot be submitted yet
          </p>
          <ul className="mt-1.5 space-y-1">
            {day.provisionalReasons.map((r, i) => (
              <li key={i} className="text-[12.5px] leading-snug text-[#8A5407] dark:text-[#FFCE8A]">{r}</li>
            ))}
          </ul>
        </div>
      )}

      {!day.provisional && eligible <= 0 && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-fill px-3.5 py-3 dark:bg-dfill">
          <ShieldAlert size={15} className="mt-px shrink-0 text-sub dark:text-dsub" />
          <p className="text-[13px] leading-snug text-sub dark:text-dsub">
            Recorded time supports no overtime for this shift. Worked {fmtMinutes(t.workedMinutes)} against a{" "}
            {fmtMinutes(day.record.policy.overtimeAfterMinutes)} threshold.
          </p>
        </div>
      )}

      {!blocked && (
        <>
          <Field label={`Amount · up to ${fmtMinutes(eligible)}`}>
            <div className="mt-2 flex flex-wrap gap-2">
              {chips.map((m) => (
                <button
                  key={m}
                  onClick={() => setMinutes(m)}
                  className={cn(
                    "press rounded-full px-3.5 py-2 text-[14px] font-semibold tabular-nums transition-all",
                    chosen === m
                      ? "bg-brand text-white shadow-[0_4px_14px_rgba(91,77,216,0.3)]"
                      : "bg-card text-ink card-shadow dark:bg-dcard dark:text-white"
                  )}
                >
                  {fmtMinutes(m)}
                </button>
              ))}
            </div>
          </Field>

          {validation.warnings.map((w, i) => (
            <p key={i} className="mt-2.5 flex items-start gap-2 text-[12.5px] leading-snug text-sub dark:text-dsub">
              <Info size={13} className="mt-px shrink-0" /> {w}
            </p>
          ))}

          <div className="mt-5">
            <Field label="Reason">
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. stayed to finish the equipment delivery"
                className={cn(inputCls, "resize-none leading-relaxed")}
              />
            </Field>
          </div>

          <div className="mt-5">
            <Button onClick={submit} loading={submitting} disabled={!validation.ok}>
              {submitting ? "Submitting…" : `Request ${fmtMinutes(validation.cappedMinutes)} Overtime`}
            </Button>
            <p className="mt-2.5 text-center text-[12.5px] leading-snug text-sub dark:text-dsub">
              Creates a pending request. Approval, part-approval and declines are decided by your manager and shown on
              the shift in Hours.
            </p>
          </div>
        </>
      )}
    </DetailPage>
  );
}

// ─── Ask about a job or shift ──────────────────────────────────────────────
const ASK_TOPICS = [
  { id: "job", label: "A job", icon: <Briefcase size={15} /> },
  { id: "shift", label: "My shift", icon: <CalendarDays size={15} /> },
  { id: "hours", label: "My hours", icon: <Clock size={15} /> },
  { id: "other", label: "Something else", icon: <CircleHelp size={15} /> },
] as const;

export function AskHelp() {
  const { pop, askForHelp, helpRequests, dayViews, toast } = useApp();
  const [topic, setTopic] = useState<string>("job");
  const [context, setContext] = useState("Site Inspection · Today 14:30");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const contexts =
    topic === "hours"
      ? dayViews.map((d) => `${d.record.label} · ${d.record.site}`)
      : topic === "shift"
        ? dayViews.slice(0, 4).map((d) => `${d.record.label} · ${d.record.site}`)
        : JOBS.filter((j) => j.bucket !== "completed").map((j) => `${j.title} · ${j.dateLabel.split(" · ")[0]} ${j.time}`);

  const submit = () => {
    if (!subject.trim() || !message.trim()) {
      toast("Add a subject and a short message", "error");
      return;
    }
    askForHelp(context, subject.trim(), message.trim());
    setSent(true);
    toast("Question sent to your manager");
  };

  return (
    <DetailPage title="Ask for Help" onBack={pop} backLabel="Requests">
      {sent ? (
        <div className="flex flex-col items-center pt-14 text-center">
          <SuccessCheck tone="purple" />
          <h2 className="anim-rise mt-6 text-[24px] font-bold tracking-tight text-ink dark:text-white" style={{ animationDelay: "0.1s" }}>
            Question sent
          </h2>
          <p className="anim-rise mt-2 max-w-[290px] text-[15px] leading-relaxed text-sub dark:text-dsub" style={{ animationDelay: "0.2s" }}>
            Your manager sees it against <strong className="font-semibold text-ink dark:text-white">{context}</strong>.
            The reply appears here and in your notifications.
          </p>
          <Button className="mt-8" variant="tinted" onClick={pop}>Back to Requests</Button>
        </div>
      ) : (
        <>
          <p className="px-1 text-[15px] leading-relaxed text-sub dark:text-dsub">
            One question, sent to the person who can answer it. This is not a chat — you'll get a single reply.
          </p>

          <p className="mb-2 mt-6 px-1 text-[13px] font-medium text-sub dark:text-dsub">What is it about?</p>
          <div className="grid grid-cols-2 gap-2">
            {ASK_TOPICS.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTopic(t.id);
                  const next =
                    t.id === "hours" || t.id === "shift"
                      ? dayViews[0]
                        ? `${dayViews[0].record.label} · ${dayViews[0].record.site}`
                        : context
                      : contexts[0] ?? context;
                  setContext(next);
                }}
                className={cn(
                  "press flex items-center gap-2 rounded-btn px-3.5 py-3 text-[14.5px] font-semibold transition-all",
                  topic === t.id
                    ? "bg-brand text-white shadow-[0_4px_14px_rgba(91,77,216,0.3)]"
                    : "bg-card text-ink card-shadow dark:bg-dcard dark:text-white"
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-5">
            <Field label={topic === "job" ? "Which job" : topic === "other" ? "Context" : "Which shift"}>
              <select className={cn(inputCls, "appearance-none")} value={context} onChange={(e) => setContext(e.target.value)}>
                {Array.from(new Set([context, ...contexts])).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Subject">
              <input
                className={inputCls}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Loading bay access code"
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Your question">
              <textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What do you need to know, and by when?"
                className={cn(inputCls, "resize-none leading-relaxed")}
              />
            </Field>
          </div>

          <div className="mt-5">
            <Button onClick={submit}>
              <Send size={18} /> Send Question
            </Button>
          </div>

          {helpRequests.length > 0 && (
            <>
              <p className="mb-2 mt-8 px-1 text-[13px] font-semibold uppercase tracking-wide text-sub dark:text-dsub">
                Previous questions
              </p>
              <Card>
                {helpRequests.map((h, i) => (
                  <div
                    key={h.id}
                    className={cn("px-4 py-3.5", i < helpRequests.length - 1 && "border-b border-sep/80 dark:border-dsep/70")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink dark:text-white">{h.subject}</p>
                      <Pill tone={h.status === "Answered" ? "green" : "orange"}>{h.status}</Pill>
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-sub dark:text-dsub">{h.about}</p>
                    <p className="mt-2 text-[14px] leading-snug text-ink dark:text-white">{h.message}</p>
                    {h.answer && (
                      <p className="mt-2.5 rounded-xl bg-ok/10 px-3.5 py-2.5 text-[13.5px] leading-snug text-[#248A3D] dark:bg-ok/14 dark:text-[#30D158]">
                        <strong className="font-semibold">{h.answeredBy}: </strong>
                        {h.answer}
                      </p>
                    )}
                  </div>
                ))}
              </Card>
            </>
          )}
        </>
      )}
    </DetailPage>
  );
}
