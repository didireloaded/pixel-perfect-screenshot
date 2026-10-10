import { useState } from "react";
import {
  ChevronLeft, ChevronRight, MapPin, Briefcase, Coffee, CalendarDays,
  PartyPopper, ArrowLeftRight,
} from "lucide-react";
import { useApp } from "../state";
import { Page, Card, DetailPage, Pill, Row, Group, SectionTitle } from "../ui";
import { getDayInfo, dayKey, TODAY, SHIFT, SHIFT_CHANGE } from "../data";
import { NoticeIcon } from "./Inbox";
import { cn } from "../utils/cn";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD = ["M", "T", "W", "T", "F", "S", "S"];

function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function CalendarScreen() {
  const { push } = useApp();
  const [ym, setYm] = useState({ y: 2026, m: 9 });
  const [selected, setSelected] = useState<Date>(TODAY);
  const [dir, setDir] = useState(0);

  const cells = monthGrid(ym.y, ym.m);
  const selLabel = selected.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  const move = (d: number) => {
    setDir(d);
    setYm(({ y, m }) => {
      const nm = m + d;
      return { y: y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 };
    });
  };

  return (
    <Page title="Calendar">
      <Card className="mt-5 p-4">
        <div className="flex items-center justify-between px-1">
          <span className="text-[17px] font-semibold text-ink dark:text-white">
            {MONTHS[ym.m]} {ym.y}
          </span>
          <div className="flex gap-1">
            <button onClick={() => move(-1)} className="press flex h-8 w-8 items-center justify-center rounded-full bg-fill text-brand dark:bg-dfill" aria-label="Previous month">
              <ChevronLeft size={18} strokeWidth={2.4} />
            </button>
            <button onClick={() => move(1)} className="press flex h-8 w-8 items-center justify-center rounded-full bg-fill text-brand dark:bg-dfill" aria-label="Next month">
              <ChevronRight size={18} strokeWidth={2.4} />
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-7 text-center">
          {WD.map((w, i) => (
            <span key={i} className="pb-1.5 text-[12px] font-semibold text-sub dark:text-dsub">{w}</span>
          ))}
        </div>
        <div key={`${ym.y}-${ym.m}`} className={cn("grid grid-cols-7", dir !== 0 && "anim-fade-in")}>
          {cells.map((d, i) => {
            if (!d) return <span key={i} className="h-[46px]" />;
            const di = getDayInfo(d);
            const isSel = dayKey(d) === dayKey(selected);
            const isToday = dayKey(d) === dayKey(TODAY);
            return (
              <button
                key={i}
                onClick={() => setSelected(d)}
                className="flex h-[46px] flex-col items-center justify-center"
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-[16px] tabular-nums transition-all",
                    isSel ? "bg-brand font-semibold text-white" : isToday ? "font-bold text-brand" : "text-ink dark:text-white"
                  )}
                >
                  {d.getDate()}
                </span>
                <span className="mt-[1px] flex h-[5px] items-center gap-[3px]">
                  {di.hasShift && <span className={cn("h-[4.5px] w-[4.5px] rounded-full", isSel ? "bg-brand/40" : "bg-brand/70")} />}
                  {di.jobs.length > 0 && <span className="h-[4.5px] w-[4.5px] rounded-full bg-info/80" />}
                  {di.leave && <span className="h-[4.5px] w-[4.5px] rounded-full bg-warn" />}
                  {di.notices.length > 0 && <span className="h-[4.5px] w-[4.5px] rounded-full bg-[#AF52DE]/80" />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-center gap-4 border-t border-sep/70 pt-3 text-[12px] text-sub dark:border-dsep/70 dark:text-dsub">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand/70" />Shift</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-info/80" />Job</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warn" />Leave</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#AF52DE]/80" />Notice</span>
        </div>
      </Card>

      <SectionTitle>{selLabel}</SectionTitle>
      <DayDetails date={selected} onOpenShift={() => push("shiftDetails", { date: selected.toISOString() })} />
    </Page>
  );
}

export function DayDetails({ date, onOpenShift }: { date: Date; onOpenShift?: () => void }) {
  const { push, ackedNotices: acked } = useApp();
  const info = getDayInfo(date);
  const rows: React.ReactNode[] = [];

  if (info.leave) {
    rows.push(
      <Row key="leave" icon={<PartyPopper size={16} />} iconBg="bg-warn" label="Annual Leave" sub="Approved · Full day" last />
    );
  } else if (info.hasShift) {
    rows.push(
      <Row
        key="shift"
        icon={<CalendarDays size={16} />}
        label={`Shift · ${info.shift}`}
        sub={`${info.site}${info.approved ? " · Attendance approved" : ""}`}
        chevron={!!onOpenShift}
        onClick={onOpenShift}
      />,
      <Row key="lunch" icon={<Coffee size={16} />} iconBg="bg-warn" label="Lunch break" sub={info.lunch} last={info.jobs.length === 0 && !info.event} />
    );
  }
  info.jobs.forEach((j, i) => {
    rows.push(
      <Row key={`j${i}`} icon={<Briefcase size={16} />} iconBg="bg-info" label={j.title} sub={`${j.time} · ${j.site}`} last={i === info.jobs.length - 1 && !info.event} />
    );
  });
  if (info.event) {
    rows.push(
      <Row
        key="ev"
        icon={<PartyPopper size={16} />}
        iconBg="bg-[#AF52DE]"
        label={info.event.split(" · ")[0]}
        sub={info.event.includes("·") ? info.event.split(" · ")[1] : undefined}
        last={info.notices.length === 0}
      />
    );
  }
  info.notices.forEach((n, i) => {
    rows.push(
      <Row
        key={`n${n.id}`}
        icon={<NoticeIcon kind={n.kind} size={30} />}
        label={n.title}
        sub={`${n.category}${n.requiresAck && !acked.includes(n.id) ? " · acknowledgement needed" : ""}`}
        chevron
        onClick={() => push("notice", { id: n.id })}
        last={i === info.notices.length - 1}
      />
    );
  });

  if (rows.length === 0) {
    return (
      <Card className="flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-fill text-sub dark:bg-dfill dark:text-dsub">
          <CalendarDays size={18} />
        </span>
        <div>
          <p className="text-[16px] font-semibold text-ink dark:text-white">No shift scheduled</p>
          <p className="text-[13px] text-sub dark:text-dsub">Enjoy your day off.</p>
        </div>
      </Card>
    );
  }
  return <Card>{rows}</Card>;
}

// ─── Shift details (pushed) ────────────────────────────────────────────────
export function ShiftDetails({ params }: { params?: Record<string, any> }) {
  const { pop, att } = useApp();
  const date = params?.date ? new Date(params.date) : TODAY;
  const info = getDayInfo(date);
  const isToday = dayKey(date) === dayKey(TODAY);
  const label = date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const attStatus = isToday
    ? att.status === "off"
      ? "Not clocked in yet"
      : att.status === "done"
        ? "Shift complete"
        : "In progress"
    : info.approved
      ? "Approved"
      : info.hasShift
        ? "Scheduled"
        : "—";

  return (
    <DetailPage title="Shift Details" onBack={pop}>
      <p className="text-[13px] font-semibold uppercase tracking-wide text-sub dark:text-dsub">{label}</p>
      {info.hasShift ? (
        <>
          <div className="mt-2 flex items-end justify-between">
            <h1 className="text-[28px] font-bold tabular-nums tracking-tight text-ink dark:text-white">{info.shift}</h1>
            <Pill tone={attStatus === "Approved" || attStatus === "Shift complete" ? "green" : attStatus === "In progress" ? "orange" : "blue"}>{attStatus}</Pill>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-[15px] text-sub dark:text-dsub">
            <MapPin size={14} /> {info.site}
          </p>

          {date.getMonth() === 9 && date.getDate() === 12 && (
            <div className="mt-4 rounded-card border-l-[3px] border-info bg-info/8 p-4 dark:bg-info/14">
              <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-info">
                <ArrowLeftRight size={14} /> This shift changed
              </p>
              <p className="mt-2.5 text-[14px] tabular-nums text-sub line-through dark:text-dsub">
                {SHIFT_CHANGE.before}
              </p>
              <p className="text-[17px] font-bold tabular-nums text-ink dark:text-white">{SHIFT_CHANGE.after}</p>
              <p className="mt-2 text-[13px] leading-snug text-sub dark:text-dsub">
                {SHIFT_CHANGE.reason} · changed by {SHIFT_CHANGE.changedBy}
              </p>
            </div>
          )}

          <Group header="Schedule" className="mt-7">
            <Row label="Shift hours" value={info.shift} />
            <Row label="Lunch break" value={info.lunch} />
            <Row label="Expected working time" value={SHIFT.expected} last />
          </Group>

          {info.jobs.length > 0 && (
            <Group header="Assigned jobs" className="mt-6">
              {info.jobs.map((j, i) => (
                <Row
                  key={i}
                  icon={<Briefcase size={16} />}
                  iconBg="bg-info"
                  label={j.title}
                  sub={`${j.time} · ${j.site}`}
                  last={i === info.jobs.length - 1}
                />
              ))}
            </Group>
          )}

          {info.event && (
            <Group header="Company events" className="mt-6">
              <Row icon={<PartyPopper size={16} />} iconBg="bg-[#AF52DE]" label={info.event} last />
            </Group>
          )}

          <Group header="Attendance" className="mt-6" footer={isToday ? "Attendance updates live as you clock in and out today." : undefined}>
            <Row label="Status" right={<Pill tone={attStatus === "Approved" || attStatus === "Shift complete" ? "green" : attStatus === "In progress" ? "orange" : "blue"}>{attStatus}</Pill>} last />
          </Group>
        </>
      ) : (
        <>
          <h1 className="mt-2 text-[28px] font-bold tracking-tight text-ink dark:text-white">
            {info.leave ? "Annual Leave" : "No shift"}
          </h1>
          <p className="mt-1 text-[15px] text-sub dark:text-dsub">
            {info.leave ? "Approved leave day — no attendance required." : "No shift has been assigned for this day."}
          </p>
          {info.event && (
            <Group header="Company events" className="mt-7">
              <Row icon={<PartyPopper size={16} />} iconBg="bg-[#AF52DE]" label={info.event} last />
            </Group>
          )}
        </>
      )}
    </DetailPage>
  );
}
