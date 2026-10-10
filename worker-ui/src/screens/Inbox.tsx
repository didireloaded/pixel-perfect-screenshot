import { useEffect, useState } from "react";
import {
  Mail, Megaphone, CalendarDays, MapPin, CheckCircle2, BellOff,
  Briefcase, Clock, PartyPopper, ChevronRight, Wrench, DoorClosed,
  ShieldAlert, FileText, LogOut, AlertTriangle, RefreshCw,
} from "lucide-react";
import type { NoticeKind } from "../data";
import { useApp } from "../state";
import { Page, DetailPage, Card, Segmented, Pill, EmptyState, Button, Avatar } from "../ui";
import { MESSAGES, NOTICES, EVENTS, NOTIFICATIONS } from "../data";
import { cn } from "../utils/cn";

const NOTICE_KIND: Record<NoticeKind, { icon: React.ReactNode; bg: string; tone: string; pill: any }> = {
  safety: { icon: <ShieldAlert size={18} />, bg: "bg-bad/12 text-bad", tone: "Safety", pill: "red" },
  general: { icon: <Megaphone size={18} />, bg: "bg-brand-soft text-brand dark:bg-brand/20 dark:text-[#9D91F2]", tone: "General", pill: "purple" },
  policy: { icon: <FileText size={18} />, bg: "bg-info/12 text-info", tone: "Policy", pill: "blue" },
  holiday: { icon: <PartyPopper size={18} />, bg: "bg-ok/12 text-[#248A3D] dark:text-[#30D158]", tone: "Public Holiday", pill: "green" },
  closure: { icon: <DoorClosed size={18} />, bg: "bg-warn/14 text-[#C47608] dark:text-[#FFB340]", tone: "Closure", pill: "orange" },
  maintenance: { icon: <Wrench size={18} />, bg: "bg-[#AF52DE]/12 text-[#AF52DE] dark:text-[#DA8FFF]", tone: "Maintenance", pill: "purple" },
  earlyrelease: { icon: <LogOut size={18} />, bg: "bg-ok/12 text-[#248A3D] dark:text-[#30D158]", tone: "Early Release", pill: "green" },
};

export function NoticeIcon({ kind, size = 40 }: { kind: NoticeKind; size?: number }) {
  const m = NOTICE_KIND[kind];
  return (
    <span
      className={cn("mt-0.5 flex shrink-0 items-center justify-center rounded-full", m.bg)}
      style={{ width: size, height: size }}
    >
      {m.icon}
    </span>
  );
}

export function noticePill(kind: NoticeKind) {
  return NOTICE_KIND[kind].pill;
}

type Seg = "messages" | "notices" | "events";

export default function InboxScreen() {
  const { push, readMsgs, ackedNotices, markAllMsgsRead } = useApp();
  const [seg, setSeg] = useState<Seg>("messages");
  const unreadCount = MESSAGES.filter((m) => m.unread && !readMsgs.includes(m.id)).length;
  const pendingAck = NOTICES.filter((n) => n.requiresAck && !ackedNotices.includes(n.id)).length;

  return (
    <Page title="Inbox">
      <Segmented
        className="mt-4"
        value={seg}
        onChange={setSeg}
        options={[
          { value: "messages", label: "Messages" },
          { value: "notices", label: "Notices" },
          { value: "events", label: "Events" },
        ]}
      />

      {seg === "messages" && (
        <>
          <div className="mt-4 flex items-center justify-between px-1">
            <span className="text-[13px] font-medium text-sub dark:text-dsub">
              {unreadCount > 0 ? `${unreadCount} unread · one-way messages from your manager` : "All messages read"}
            </span>
            {unreadCount > 0 && (
              <button onClick={markAllMsgsRead} className="press rounded px-1 text-[13px] font-semibold text-brand">
                Mark all read
              </button>
            )}
          </div>
          <Card className="mt-2">
          {MESSAGES.map((m, i) => {
            const unread = m.unread && !readMsgs.includes(m.id);
            return (
              <button
                key={m.id}
                onClick={() => push("message", { id: m.id })}
                className={cn(
                  "press-row flex w-full items-start gap-3 px-4 py-3.5 text-left",
                  i < MESSAGES.length - 1 && "border-b border-sep/80 dark:border-dsep/70"
                )}
              >
                <span className="relative mt-0.5">
                  <Avatar initials={m.initials} size={40} />
                  {unread && <span className="absolute -left-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-brand dark:border-dcard" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate text-[16px]", unread ? "font-bold text-ink dark:text-white" : "font-medium text-ink dark:text-white")}>
                      {m.sender}
                    </span>
                    <span className="shrink-0 text-[13px] tabular-nums text-sub dark:text-dsub">{m.time}</span>
                  </span>
                  <span className={cn("mt-0.5 block truncate text-[14px]", unread ? "font-semibold text-ink dark:text-white" : "text-sub dark:text-dsub")}>
                    {m.subject}
                  </span>
                  <span className="mt-0.5 line-clamp-1 block text-[13px] text-sub dark:text-dsub">{m.preview}</span>
                </span>
              </button>
            );
          })}
          </Card>
        </>
      )}

      {seg === "notices" && (
        <>
          {pendingAck > 0 && (
            <div className="anim-rise mt-4 flex items-center gap-2.5 rounded-card bg-warn/12 px-4 py-3 dark:bg-warn/16">
              <ShieldAlert size={17} className="shrink-0 text-[#C47608] dark:text-[#FFB340]" />
              <span className="flex-1 text-[13px] font-medium leading-snug text-[#C47608] dark:text-[#FFB340]">
                {pendingAck} notice{pendingAck > 1 ? "s" : ""} need{pendingAck > 1 ? "" : "s"} your acknowledgement
              </span>
            </div>
          )}
          <Card className={cn(pendingAck > 0 ? "mt-3" : "mt-5")}>
          {NOTICES.map((n, i) => {
            const acked = ackedNotices.includes(n.id);
            return (
              <button
                key={n.id}
                onClick={() => push("notice", { id: n.id })}
                className={cn(
                  "press-row flex w-full items-start gap-3 px-4 py-3.5 text-left",
                  i < NOTICES.length - 1 && "border-b border-sep/80 dark:border-dsep/70"
                )}
              >
                <NoticeIcon kind={n.kind} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[16px] font-semibold text-ink dark:text-white">{n.title}</span>
                    {n.requiresAck && (
                      <Pill tone={acked ? "green" : "orange"}>{acked ? "Acknowledged" : "Action needed"}</Pill>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[13px] text-sub dark:text-dsub">
                    {n.category} · {n.date}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-[13px] leading-snug text-sub dark:text-dsub">{n.preview}</span>
                </span>
              </button>
            );
          })}
          </Card>
        </>
      )}

      {seg === "events" && (
        <Card className="mt-5">
          {EVENTS.map((e, i) => (
            <div
              key={e.id}
              className={cn("flex items-start gap-3 px-4 py-3.5", i < EVENTS.length - 1 && "border-b border-sep/80 dark:border-dsep/70")}
            >
              <span className="mt-0.5 flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-[10px] bg-brand-soft text-brand dark:bg-brand/20 dark:text-[#9D91F2]">
                <span className="text-[10px] font-bold uppercase leading-none">{e.date.split(" ")[2]}</span>
                <span className="text-[16px] font-bold leading-tight tabular-nums">{e.date.split(" ")[1]}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold text-ink dark:text-white">{e.name}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[13px] text-sub dark:text-dsub">
                  <span className="tabular-nums">{e.date}{e.time ? ` · ${e.time}` : ""}</span>
                  {e.location && (
                    <span className="flex items-center gap-1"><MapPin size={11} />{e.location}</span>
                  )}
                </span>
                <span className="mt-1 block text-[13px] leading-snug text-sub dark:text-dsub">{e.description}</span>
              </span>
            </div>
          ))}
        </Card>
      )}
    </Page>
  );
}

// ─── Message details ───────────────────────────────────────────────────────
export function MessageDetails({ params }: { params?: Record<string, any> }) {
  const { pop, markMsgRead } = useApp();
  const m = MESSAGES.find((x) => x.id === params?.id) ?? MESSAGES[0];
  useEffect(() => {
    markMsgRead(m.id);
  }, [m.id, markMsgRead]);
  return (
    <DetailPage title="Message" onBack={pop} backLabel="Inbox">
      <div className="flex items-center gap-3">
        <Avatar initials={m.initials} size={46} />
        <div className="min-w-0">
          <p className="text-[17px] font-semibold text-ink dark:text-white">{m.sender}</p>
          <p className="text-[13px] text-sub dark:text-dsub">{m.senderRole} · {m.dateLabel}</p>
        </div>
      </div>
      <h1 className="mt-5 text-[24px] font-bold leading-tight tracking-tight text-ink dark:text-white">{m.subject}</h1>
      <div className="mt-4 space-y-3.5">
        {m.body.map((p, i) => (
          <p key={i} className="text-[16px] leading-relaxed text-ink dark:text-white">{p}</p>
        ))}
      </div>
    </DetailPage>
  );
}

// ─── Notice details ────────────────────────────────────────────────────────
export function NoticeDetails({ params }: { params?: Record<string, any> }) {
  const { pop, ackedNotices, ackNotice, toast } = useApp();
  const n = NOTICES.find((x) => x.id === params?.id) ?? NOTICES[0];
  const acked = ackedNotices.includes(n.id);
  return (
    <DetailPage title="Company Notice" onBack={pop} backLabel="Back">
      <div className="flex items-center gap-3">
        <NoticeIcon kind={n.kind} size={38} />
        <div>
          <Pill tone={noticePill(n.kind)}>{n.category}</Pill>
          <p className="mt-1 text-[13px] text-sub dark:text-dsub">Published {n.date}</p>
        </div>
      </div>
      <h1 className="mt-3 text-[26px] font-bold leading-tight tracking-tight text-ink dark:text-white">{n.title}</h1>
      <div className="mt-4 space-y-3.5">
        {n.body.map((p, i) => (
          <p key={i} className="text-[16px] leading-relaxed text-ink dark:text-white">{p}</p>
        ))}
      </div>
      {n.requiresAck && (
        <div className="mt-8">
          {acked ? (
            <div className="flex items-center justify-center gap-2.5 rounded-btn bg-ok/10 py-4 dark:bg-ok/15">
              <CheckCircle2 size={20} className="text-[#248A3D] dark:text-[#30D158]" />
              <span className="text-[16px] font-semibold text-[#248A3D] dark:text-[#30D158]">Acknowledged</span>
            </div>
          ) : (
            <Button onClick={() => { ackNotice(n.id); toast("Notice acknowledged"); }}>Acknowledge Notice</Button>
          )}
          <p className="mt-2.5 text-center text-[13px] text-sub dark:text-dsub">
            Acknowledging confirms you've read and understood this notice.
          </p>
        </div>
      )}
    </DetailPage>
  );
}

// ─── Notification center ───────────────────────────────────────────────────
const NOTIF_ICON: Record<string, { icon: React.ReactNode; bg: string }> = {
  shift: { icon: <CalendarDays size={16} />, bg: "bg-brand" },
  job: { icon: <Briefcase size={16} />, bg: "bg-info" },
  leave: { icon: <PartyPopper size={16} />, bg: "bg-ok" },
  timesheet: { icon: <Clock size={16} />, bg: "bg-warn" },
  notice: { icon: <Megaphone size={16} />, bg: "bg-[#AF52DE]" },
  message: { icon: <Mail size={16} />, bg: "bg-[#5856D6]" },
  alert: { icon: <AlertTriangle size={16} />, bg: "bg-bad" },
  sync: { icon: <RefreshCw size={16} />, bg: "bg-[#C47608]" },
};

export function NotificationCenter() {
  const { pop, push, readNotifs, markNotifRead, markAllNotifs, goTab } = useApp();
  const groups = ["Today", "Yesterday", "Earlier"] as const;

  const openTarget = (t?: { kind: string; id?: string }) => {
    if (!t) return;
    if (t.kind === "job") push("jobDetails", { id: t.id });
    else if (t.kind === "notice") push("notice", { id: t.id });
    else if (t.kind === "message") push("message", { id: t.id });
    else if (t.kind === "request") push("requestDetails", { id: t.id });
    else if (t.kind === "hours") {
      goTab("hours");
      if (t.id) window.setTimeout(() => push("timesheet", { recordId: t.id }), 80);
    }
    else if (t.kind === "calendar") goTab("calendar");
  };

  const empty = NOTIFICATIONS.length === 0;

  return (
    <DetailPage
      title="Notifications"
      onBack={pop}
      right={
        <button onClick={markAllNotifs} className="press rounded px-1 text-[15px] font-medium text-brand">
          Read all
        </button>
      }
    >
      {empty ? (
        <EmptyState icon={<BellOff size={26} />} title="You're all caught up" message="New notifications about shifts, jobs and requests will appear here." className="pt-24" />
      ) : (
        groups.map((g) => {
          const items = NOTIFICATIONS.filter((n) => n.group === g);
          if (items.length === 0) return null;
          return (
            <div key={g} className="mb-6">
              <p className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-sub dark:text-dsub">{g}</p>
              <Card>
                {items.map((n, i) => {
                  const unread = !readNotifs.includes(n.id);
                  const meta = NOTIF_ICON[n.icon];
                  return (
                    <button
                      key={n.id}
                      onClick={() => { markNotifRead(n.id); openTarget(n.target); }}
                      className={cn(
                        "press-row flex w-full items-start gap-3 px-4 py-3 text-left",
                        i < items.length - 1 && "border-b border-sep/80 dark:border-dsep/70"
                      )}
                    >
                      <span className={cn("mt-0.5 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] text-white", meta.bg)}>
                        {meta.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-[15px] leading-snug", unread ? "font-semibold text-ink dark:text-white" : "text-ink dark:text-white")}>
                          {n.title}
                        </span>
                        <span className="mt-0.5 block text-[13px] leading-snug text-sub dark:text-dsub">{n.desc}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className="text-[12px] tabular-nums text-sub dark:text-dsub">{n.time}</span>
                        {unread ? <span className="h-2 w-2 rounded-full bg-brand" /> : <ChevronRight size={14} className="text-sub/60" />}
                      </span>
                    </button>
                  );
                })}
              </Card>
            </div>
          );
        })
      )}
    </DetailPage>
  );
}
