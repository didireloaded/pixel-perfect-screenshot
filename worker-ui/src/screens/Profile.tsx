import { useState } from "react";
import {
  FileText, CalendarDays, History, User, Lock, ShieldCheck, Bell,
  Paintbrush, CircleHelp, Info, MapPin, ChevronDown, Smartphone, Sun, Moon, CheckCircle2,
  MonitorSmartphone, Pause, Radio, Trash2, ShieldOff, Accessibility, Type,
} from "lucide-react";
import { useApp } from "../state";
import { DetailPage, Group, Row, Avatar, Button, Sheet, Toggle, Pill, Logo } from "../ui";
import { EMPLOYEE, COMPANY, FAQ } from "../data";
import { cn } from "../utils/cn";

export function ProfileScreen() {
  const { pop, push, goTab, signOut, devices } = useApp();
  const [confirmOut, setConfirmOut] = useState(false);

  return (
    <>
      <DetailPage title="Profile" onBack={pop} backLabel="Today">
        <div className="flex flex-col items-center pb-2 pt-3 text-center">
          <Avatar initials={EMPLOYEE.initials} size={84} className="text-[30px]" />
          <h1 className="mt-4 text-[24px] font-bold tracking-tight text-ink dark:text-white">{EMPLOYEE.name}</h1>
          <p className="mt-0.5 text-[15px] text-sub dark:text-dsub">
            {EMPLOYEE.role} · {EMPLOYEE.number}
          </p>
          <p className="mt-0.5 text-[14px] text-sub dark:text-dsub">
            {EMPLOYEE.team} · {EMPLOYEE.site}
          </p>
        </div>

        <Group header="Work" className="mt-6">
          <Row icon={<FileText size={16} />} label="My Requests" chevron onClick={() => push("requests")} />
          <Row icon={<CalendarDays size={16} />} iconBg="bg-info" label="My Schedule" chevron onClick={() => goTab("calendar")} />
          <Row icon={<History size={16} />} iconBg="bg-warn" label="Attendance History" chevron onClick={() => goTab("hours")} last />
        </Group>

        <Group header="Account" className="mt-6">
          <Row icon={<User size={16} />} iconBg="bg-[#5856D6]" label="Account Details" chevron onClick={() => push("account")} />
          <Row icon={<MonitorSmartphone size={16} />} iconBg="bg-[#32ADE6]" label="Registered Devices" sub={`${devices.length} device${devices.length > 1 ? "s" : ""}`} chevron onClick={() => push("devices")} />
          <Row icon={<ShieldCheck size={16} />} iconBg="bg-ok" label="Location & Privacy" chevron onClick={() => push("privacy")} />
          <Row icon={<Lock size={16} />} iconBg="bg-sub" label="Security" sub="Face ID & password" chevron onClick={() => push("account")} last />
        </Group>

        <Group header="Preferences" className="mt-6">
          <Row icon={<Bell size={16} />} iconBg="bg-bad" label="Notifications" chevron onClick={() => push("notifSettings")} />
          <Row icon={<Paintbrush size={16} />} iconBg="bg-[#AF52DE]" label="Appearance" chevron onClick={() => push("appearance")} />
          <Row icon={<Accessibility size={16} />} iconBg="bg-info" label="Accessibility" sub="Text size, motion" chevron onClick={() => push("accessibility")} last />
        </Group>

        <Group header="Support" className="mt-6">
          <Row icon={<CircleHelp size={16} />} iconBg="bg-info" label="Help" chevron onClick={() => push("help")} />
          <Row icon={<Info size={16} />} iconBg="bg-sub" label="About Shiftline" chevron onClick={() => push("about")} last />
        </Group>

        <div className="mt-6 overflow-hidden rounded-card bg-card card-shadow dark:bg-dcard">
          <button onClick={() => setConfirmOut(true)} className="press-row w-full py-3.5 text-center text-[17px] font-medium text-bad">
            Sign Out
          </button>
        </div>
        <p className="mt-4 pb-4 text-center text-[13px] text-sub dark:text-dsub">
          Signed in as {EMPLOYEE.email}
        </p>
      </DetailPage>

      <Sheet open={confirmOut} onClose={() => setConfirmOut(false)} title="Sign out of Shiftline?">
        <p className="px-2 text-center text-[15px] leading-relaxed text-sub dark:text-dsub">
          Your recorded attendance stays safe. You'll need your email and password to sign back in.
        </p>
        <div className="mt-5 space-y-2.5">
          <Button variant="destructive" onClick={signOut}>Sign Out</Button>
          <Button variant="plain" size="md" onClick={() => setConfirmOut(false)}>Cancel</Button>
        </div>
      </Sheet>
    </>
  );
}

// ─── Account details ───────────────────────────────────────────────────────
export function AccountDetails() {
  const { pop } = useApp();
  return (
    <DetailPage title="Account Details" onBack={pop} backLabel="Profile">
      <Group header="Personal">
        <Row label="Full name" value={EMPLOYEE.name} />
        <Row label="Email" value={EMPLOYEE.email} last />
      </Group>
      <Group header="Employment" className="mt-6" footer="Employment details are managed by your employer. Contact HR to request a change.">
        <Row label="Employee number" value={EMPLOYEE.number} />
        <Row label="Company" value={COMPANY} />
        <Row label="Department" value={EMPLOYEE.dept} />
        <Row label="Team" value="Day Team" />
        <Row label="Assigned worksite" value={EMPLOYEE.site} />
        <Row label="Account status" right={<Pill tone="green" dot>Active</Pill>} last />
      </Group>
    </DetailPage>
  );
}

// ─── Notification settings ─────────────────────────────────────────────────
export function NotifSettings() {
  const { pop, prefs, setPref } = useApp();
  const items: { key: string; label: string; sub: string }[] = [
    { key: "shiftReminders", label: "Shift reminders", sub: "30 minutes before your shift starts" },
    { key: "jobAssignments", label: "Job assignments", sub: "New and updated jobs" },
    { key: "companyMessages", label: "Company messages", sub: "Direct messages from your team" },
    { key: "leaveDecisions", label: "Leave decisions", sub: "Approvals and declines" },
    { key: "timesheetUpdates", label: "Timesheet updates", sub: "Approvals and review requests" },
    { key: "announcements", label: "Company announcements", sub: "Notices and events" },
  ];
  return (
    <DetailPage title="Notifications" onBack={pop} backLabel="Profile">
      <Group footer="These preferences describe how Shiftline would notify you on this device.">
        {items.map((it, i) => (
          <Row
            key={it.key}
            label={it.label}
            sub={it.sub}
            last={i === items.length - 1}
            right={<Toggle on={prefs[it.key]} onChange={(v) => setPref(it.key, v)} />}
          />
        ))}
      </Group>
    </DetailPage>
  );
}

// ─── Location & privacy ────────────────────────────────────────────────────
const PAUSE_REASONS = [
  { key: "lunch", icon: <Pause size={15} />, label: "During your break", detail: "Paused while lunch is running" },
  { key: "away", icon: <MapPin size={15} />, label: "During a departure", detail: "Paused while you're away from site" },
  { key: "offline", icon: <Radio size={15} />, label: "While offline", detail: "Nothing is checked or stored" },
  { key: "done", icon: <ShieldOff size={15} />, label: "After the shift cutoff", detail: "Stopped once you clock out" },
];

export function PrivacyScreen() {
  const { pop, prefs, setPref, siteCheckState, att, online, triggerSiteExitAlert, toast, goTab } = useApp();
  return (
    <DetailPage title="Location & Privacy" onBack={pop} backLabel="Profile">
      <div
        className={cn(
          "flex items-start gap-3.5 rounded-card p-4",
          siteCheckState.active ? "bg-ok/10 dark:bg-ok/14" : "bg-fill dark:bg-dfill"
        )}
      >
        <span
          className={cn(
            "flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full",
            siteCheckState.active ? "bg-ok/16 text-[#248A3D] dark:text-[#30D158]" : "bg-card text-sub card-shadow dark:bg-dcard dark:text-dsub"
          )}
        >
          {siteCheckState.active ? <ShieldCheck size={22} /> : <ShieldOff size={22} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold text-ink dark:text-white">
            Worksite checks · {siteCheckState.label}
          </span>
          <span className="mt-1 block text-[14px] leading-snug text-sub dark:text-dsub">
            {siteCheckState.reason}
          </span>
        </span>
      </div>

      <Group header="Status" className="mt-6">
        <Row label="Location permission" right={<Pill tone="green">While Using the App</Pill>} />
        <Row label="Company policy" sub="Northstar Operations requires verification" value="Required" />
        <Row label="Assigned worksite" value={EMPLOYEE.site} />
        <Row label="Location history stored" value="None" last />
      </Group>

      <Group
        header="Controls"
        className="mt-6"
        footer="Checks run only while a shift is on the clock. Turning checks off where company policy allows it means clock-ins are recorded without verification and are flagged for your manager."
      >
        <Row
          label="Worksite checks"
          sub="Confirm you're on site when clocking in and out"
          right={<Toggle on={prefs.siteChecks} onChange={(v) => setPref("siteChecks", v)} />}
        />
        <Row
          label="Exit & return alerts"
          sub="Notify me if I leave the site during active work"
          right={<Toggle on={prefs.exitAlerts} onChange={(v) => setPref("exitAlerts", v)} />}
          last
        />
      </Group>

      <Group
        header="When checks pause automatically"
        className="mt-6"
        footer="Pausing is automatic — you never have to remember to switch anything off."
      >
        {PAUSE_REASONS.map((r, i) => {
          const live =
            (r.key === "lunch" && att.status === "lunch") ||
            (r.key === "away" && att.status === "away") ||
            (r.key === "offline" && !online) ||
            (r.key === "done" && att.status === "done");
          return (
            <Row
              key={r.key}
              icon={r.icon}
              iconBg={live ? "bg-warn" : "bg-sub/60"}
              label={r.label}
              sub={r.detail}
              right={<Pill tone={live ? "orange" : "gray"}>{live ? "Paused now" : "Automatic"}</Pill>}
              last={i === PAUSE_REASONS.length - 1}
            />
          );
        })}
      </Group>

      {prefs.exitAlerts && att.status === "working" && (
        <div className="mt-6">
          <Button
            variant="secondary"
            onClick={() => {
              triggerSiteExitAlert();
              toast("Exit alert raised on Today");
              goTab("today");
            }}
          >
            <Radio size={18} /> Preview an Exit Alert
          </Button>
          <p className="mt-2.5 text-center text-[13px] leading-snug text-sub dark:text-dsub">
            Shows exactly what appears on Today if you leave the worksite during your shift.
          </p>
        </div>
      )}

      <Group header="Your data" className="mt-6" footer="Attendance records are visible to you and your direct manager, and are used only for scheduling and payroll.">
        <Row label="Who can see my attendance" value="You & manager" />
        <Row label="Shared with third parties" value="Never" last />
      </Group>
    </DetailPage>
  );
}

// ─── Registered devices ────────────────────────────────────────────────────
export function DevicesScreen() {
  const { pop, devices, removeDevice, toast } = useApp();
  return (
    <DetailPage title="Registered Devices" onBack={pop} backLabel="Profile">
      <p className="px-1 text-[15px] leading-relaxed text-sub dark:text-dsub">
        Attendance can only be recorded from a device registered to your employee number.
      </p>

      <Group header="This account" className="mt-5">
        <Row label="Signed in as" value={EMPLOYEE.email} />
        <Row label="Employee number" value={EMPLOYEE.number} />
        <Row label="Account status" right={<Pill tone="green" dot>Active</Pill>} last />
      </Group>

      <Group header="Devices" className="mt-6" footer="Removing a device signs Shiftline out on it. Your recorded hours are unaffected.">
        {devices.map((d, i) => (
          <div
            key={d.id}
            className={cn("flex items-center gap-3 px-4 py-3.5", i < devices.length - 1 && "border-b border-sep/80 dark:border-dsep/70")}
          >
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]",
                d.current ? "bg-brand-soft text-brand dark:bg-brand/20 dark:text-[#9D91F2]" : "bg-fill text-sub dark:bg-dfill dark:text-dsub"
              )}
            >
              <MonitorSmartphone size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-[16px] font-semibold text-ink dark:text-white">{d.name}</span>
                {d.current && <Pill tone="purple">This device</Pill>}
              </span>
              <span className="mt-0.5 block text-[13px] text-sub dark:text-dsub">{d.detail}</span>
              <span className="mt-0.5 block text-[12px] text-sub dark:text-dsub">Last seen {d.lastSeen}</span>
            </span>
            {!d.current && (
              <button
                onClick={() => {
                  removeDevice(d.id);
                  toast(`${d.name} removed`);
                }}
                className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bad/10 text-bad"
                aria-label={`Remove ${d.name}`}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
      </Group>

      {devices.length === 1 && (
        <p className="mt-4 text-center text-[13px] text-sub dark:text-dsub">
          Only this device is registered. Ask your manager to add a shared floor device if you need one.
        </p>
      )}
    </DetailPage>
  );
}

// ─── Appearance ────────────────────────────────────────────────────────────
export function AppearanceScreen() {
  const { pop, appearance, setAppearance } = useApp();
  const options = [
    { v: "system" as const, label: "System", sub: "Match iPhone setting", icon: <Smartphone size={16} /> },
    { v: "light" as const, label: "Light", sub: "Always light", icon: <Sun size={16} /> },
    { v: "dark" as const, label: "Dark", sub: "Always dark", icon: <Moon size={16} /> },
  ];
  return (
    <DetailPage title="Appearance" onBack={pop} backLabel="Profile">
      <div className="mb-6 flex justify-center gap-4 pt-2">
        <ThemePreview dark={false} active={appearance === "light" || (appearance === "system" && !window.matchMedia("(prefers-color-scheme: dark)").matches)} />
        <ThemePreview dark active={appearance === "dark" || (appearance === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)} />
      </div>
      <Group footer="System follows your iPhone's light and dark setting automatically.">
        {options.map((o, i) => (
          <Row
            key={o.v}
            icon={o.icon}
            iconBg={o.v === "dark" ? "bg-[#5856D6]" : o.v === "light" ? "bg-warn" : "bg-sub"}
            label={o.label}
            sub={o.sub}
            last={i === options.length - 1}
            onClick={() => setAppearance(o.v)}
            right={appearance === o.v ? <CheckCircle2 size={21} className="text-brand" /> : <span className="h-[21px] w-[21px] rounded-full border-2 border-sep dark:border-dsep" />}
          />
        ))}
      </Group>
    </DetailPage>
  );
}

function ThemePreview({ dark, active }: { dark: boolean; active: boolean }) {
  return (
    <div
      className={cn(
        "w-[108px] overflow-hidden rounded-2xl border-2 p-2.5 transition-all",
        dark ? "bg-black" : "bg-[#F5F5F7]",
        active ? "border-brand shadow-[0_6px_18px_rgba(91,77,216,0.25)]" : "border-sep dark:border-dsep"
      )}
    >
      <div className={cn("h-2 w-10 rounded-full", dark ? "bg-white/80" : "bg-[#1C1C1E]")} />
      <div className={cn("mt-2 space-y-1.5 rounded-lg p-2", dark ? "bg-[#1C1C1E]" : "bg-white")}>
        <div className="h-1.5 w-full rounded-full bg-brand/80" />
        <div className={cn("h-1.5 w-2/3 rounded-full", dark ? "bg-white/25" : "bg-black/15")} />
      </div>
      <div className={cn("mt-2 h-4 rounded-md", dark ? "bg-[#1C1C1E]" : "bg-white")} />
    </div>
  );
}

// ─── Help ──────────────────────────────────────────────────────────────────
export function HelpScreen() {
  const { pop, toast } = useApp();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <DetailPage title="Help" onBack={pop} backLabel="Profile">
      <p className="px-1 text-[15px] leading-relaxed text-sub dark:text-dsub">
        Quick answers to the most common questions about attendance, jobs and requests.
      </p>
      <div className="mt-5 overflow-hidden rounded-card bg-card card-shadow dark:bg-dcard">
        {FAQ.map((f, i) => (
          <div key={i} className={cn(i < FAQ.length - 1 && "border-b border-sep/80 dark:border-dsep/70")}>
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="press-row flex w-full items-center gap-3 px-4 py-3.5 text-left"
            >
              <span className="flex-1 text-[15px] font-semibold leading-snug text-ink dark:text-white">{f.q}</span>
              <ChevronDown size={17} className={cn("shrink-0 text-sub transition-transform duration-200", open === i && "rotate-180")} />
            </button>
            {open === i && (
              <p className="anim-fade-in px-4 pb-4 text-[14px] leading-relaxed text-sub dark:text-dsub">{f.a}</p>
            )}
          </div>
        ))}
      </div>
      <div className="mt-6">
        <Button variant="tinted" onClick={() => toast("Support request started", "info")}>Contact Support</Button>
        <p className="mt-2.5 text-center text-[13px] text-sub dark:text-dsub">
          Typical response time: under 1 business day.
        </p>
      </div>
    </DetailPage>
  );
}

// ─── About ─────────────────────────────────────────────────────────────────
export function AboutScreen() {
  const { pop } = useApp();
  return (
    <DetailPage title="About Shiftline" onBack={pop} backLabel="Profile">
      <div className="flex flex-col items-center pt-6 text-center">
        <Logo size={76} />
        <h1 className="mt-4 text-[24px] font-bold tracking-tight text-ink dark:text-white">Shiftline</h1>
        <p className="mt-1 text-[14px] text-sub dark:text-dsub">Version 2.4.1 (Build 3082)</p>
        <p className="mt-4 max-w-[280px] text-[15px] leading-relaxed text-sub dark:text-dsub">
          Shiftline keeps your shifts, jobs and working hours in one calm, simple place — so workdays run smoothly.
        </p>
      </div>
      <Group className="mt-8">
        <Row label="Terms of Service" chevron onClick={() => {}} />
        <Row label="Privacy Policy" chevron onClick={() => {}} />
        <Row label="Open-source licences" chevron onClick={() => {}} last />
      </Group>
      <p className="mt-6 text-center text-[12px] text-sub dark:text-dsub">
        © 2026 Shiftline · Made for teams that keep things moving.
      </p>
    </DetailPage>
  );
}

// ─── Accessibility ─────────────────────────────────────────────────────────
export function AccessibilityScreen() {
  const { pop, textScale, setTextScale, reduceMotion, setReduceMotion } = useApp();
  const pct = Math.round((textScale - 1) * 100);
  return (
    <DetailPage title="Accessibility" onBack={pop} backLabel="Profile">
      <Group
        header="Text size"
        footer="Scales the content of every screen. Navigation, the clock button and the tab bar keep their size so nothing gets pushed off screen."
      >
        <div className="px-4 py-4">
          <div className="flex items-end justify-between">
            <span className="text-[13px] font-semibold text-sub dark:text-dsub" style={{ fontSize: 13 }}>
              Aa
            </span>
            <span className="text-[15px] font-bold text-ink dark:text-white" style={{ fontSize: 15 * textScale }}>
              Clocked in at 08:02
            </span>
            <span className="text-[19px] font-semibold text-sub dark:text-dsub" style={{ fontSize: 19 * textScale }}>
              Aa
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={1.35}
            step={0.05}
            value={textScale}
            onChange={(e) => setTextScale(Number(e.target.value))}
            className="mt-4 w-full accent-[#5B4DD8]"
            aria-label="Text size"
          />
          <div className="mt-1.5 flex justify-between text-[11.5px] font-medium text-sub dark:text-dsub">
            <span>Standard</span>
            <span className="tabular-nums text-brand">{pct > 0 ? `+${pct}%` : "Standard"}</span>
            <span>Largest</span>
          </div>
          <div className="mt-3 flex gap-2">
            {[
              { label: "Standard", v: 1 },
              { label: "Large", v: 1.15 },
              { label: "Largest", v: 1.35 },
            ].map((o) => (
              <button
                key={o.label}
                onClick={() => setTextScale(o.v)}
                className={cn(
                  "press flex-1 rounded-btn py-2.5 text-[13.5px] font-semibold transition-all",
                  Math.abs(textScale - o.v) < 0.001
                    ? "bg-brand text-white"
                    : "bg-fill text-ink dark:bg-dfill dark:text-white"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </Group>

      <Group header="Motion" className="mt-6" footer="Follows your iPhone's Reduce Motion setting by default.">
        <Row
          icon={<Type size={16} />}
          iconBg="bg-[#5856D6]"
          label="Reduce motion"
          sub="Replace slide and spring animations with instant changes"
          right={<Toggle on={reduceMotion} onChange={setReduceMotion} />}
          last
        />
      </Group>

      <Group header="Built in" className="mt-6" footer="These are always on and cannot be turned off.">
        <Row label="Minimum tap target" value="44 × 44 pt" />
        <Row label="Screen-reader labels" value="On all controls" />
        <Row label="Status without colour" value="Text + icons" />
        <Row label="Tabular numbers" value="Timers & totals" last />
      </Group>

      {textScale > 1 && (
        <p className="mt-5 rounded-xl bg-brand-soft/70 px-4 py-3 text-[13px] leading-snug text-brand dark:bg-brand/15 dark:text-[#9D91F2]">
          Larger text is on. If a screen ever feels cramped outdoors or with gloves, this is the setting to reach for
          first.
        </p>
      )}
    </DetailPage>
  );
}
