import { Link } from "@tanstack/react-router";
import { Bell, CalendarClock, Briefcase, Clock3, Inbox, LayoutDashboard, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useDemo } from "@/lib/demo-store";

const NAV = [
  { to: "/", label: "Today", icon: CalendarClock },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/hours", label: "My hours", icon: Clock3 },
  { to: "/requests", label: "Requests", icon: Inbox },
] as const;

export function DemoBanner() {
  return (
    <p className="rounded-full bg-tint-cream px-3 py-1 text-center text-[11px] font-medium text-foreground">
      Demo mode · fictional data · location, approvals and payroll are simulated
    </p>
  );
}

export function EmployeeShell({ title, children }: { title: string; children: ReactNode }) {
  const d = useDemo();
  const me = d.employees.find((e) => e.id === d.me)!;
  const [profile, setProfile] = useState(false);
  const [notices, setNotices] = useState(false);
  const unacked = d.notices.filter((n) => n.requiresAck && !n.acked).length;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col bg-background sm:my-6 sm:min-h-[860px] sm:rounded-[2.5rem] sm:shadow-card">
      <header className="sticky top-0 z-20 px-5 pt-5">
        <div className="card-surface flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => setProfile(true)}
            aria-label="Open profile, settings and privacy"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-accent-foreground"
          >
            {me.name.split(" ").map((p) => p[0]).join("")}
          </button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h1>
          <button
            onClick={() => setNotices(true)}
            aria-label={`Notifications${unacked ? `, ${unacked} need acknowledgement` : ""}`}
            className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-muted"
          >
            <Bell className="h-5 w-5" strokeWidth={1.8} />
            {unacked > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive" />}
          </button>
        </div>
      </header>

      <main className="flex-1 space-y-4 px-5 pb-28 pt-4">{children}</main>

      <nav
        aria-label="Main"
        className="pb-safe fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[440px] border-t border-border bg-card px-3 pt-2 sm:rounded-b-[2.5rem]"
      >
        <ul className="grid grid-cols-4">
          {NAV.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                activeOptions={{ exact: true }}
                className="flex min-h-12 flex-col items-center gap-1 rounded-xl py-1 text-[11px] font-medium text-muted-foreground data-[status=active]:text-primary"
              >
                <Icon className="h-[22px] w-[22px]" strokeWidth={1.8} />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Drawer open={profile} onOpenChange={setProfile}>
        <DrawerContent className="mx-auto max-w-[440px] rounded-t-[2rem] px-5 pb-8">
          <DrawerTitle className="pt-4 text-xl font-bold">{me.name}</DrawerTitle>
          <DrawerDescription>Employee no. {me.no} · {me.role} · {me.team}</DrawerDescription>
          <section className="mt-5 space-y-3 rounded-2xl bg-tint-blue p-4 text-sm">
            <h3 className="font-bold">Location privacy</h3>
            <p><b>When:</b> tracking starts only after you clock in, pauses during lunch and personal departures, and stops at clock-out or {d.shift.trackingStop} — whichever is first. Overtime needs an approved extension.</p>
            <p><b>What:</b> whether you are inside the approved work area, with accuracy and time captured. No detailed routes.</p>
            <p><b>Who:</b> your authorised managers only.</p>
            <p><b>How long:</b> 90 days, then deleted. Hours records are kept for payroll.</p>
          </section>
          <div className="mt-4 flex flex-col gap-2">
            <Button variant="pill" size="xl" asChild>
              <Link to="/manager"><LayoutDashboard /> Open manager dashboard (demo)</Link>
            </Button>
            <Button variant="chip" size="xl" onClick={() => { d.reset(); setProfile(false); }}>Reset demo data</Button>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={notices} onOpenChange={setNotices}>
        <DrawerContent className="mx-auto max-w-[440px] rounded-t-[2rem] px-5 pb-8">
          <DrawerTitle className="pt-4 text-xl font-bold">Notifications</DrawerTitle>
          <DrawerDescription>Closures, holidays and shift changes</DrawerDescription>
          <div className="mt-4 space-y-3">
            {d.notices.length === 0 && <p className="text-sm text-muted-foreground">No notices.</p>}
            {d.notices.map((n) => (
              <article key={n.id} className="rounded-2xl bg-tint-pink p-4 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{n.kind.replace("_", " ")} · {n.date}</p>
                <h3 className="mt-1 font-bold">{n.title}</h3>
                <p className="mt-1">{n.body}</p>
                <p className="mt-2"><b>Attendance:</b> {n.attendance} · <b>Pay:</b> {n.paid}</p>
                {n.requiresAck && (
                  <Button
                    variant={n.acked ? "chip" : "hero"} size="sm" className="mt-3 h-10 px-4" disabled={n.acked}
                    onClick={() => d.update((x) => ({ ...x, notices: x.notices.map((m) => (m.id === n.id ? { ...m, acked: true } : m)) }))}
                  >
                    {n.acked ? "Acknowledged" : "Acknowledge"}
                  </Button>
                )}
              </article>
            ))}
          </div>
          <Button variant="ghost" className="mt-3" onClick={() => setNotices(false)}><X /> Close</Button>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

export function StatusPill({ tone, children }: { tone: "ok" | "warn" | "bad" | "info" | "muted"; children: ReactNode }) {
  const cls = {
    ok: "bg-tint-mint text-foreground",
    warn: "bg-tint-cream text-foreground",
    bad: "bg-tint-pink text-destructive",
    info: "bg-primary-soft text-accent-foreground",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  const dot = { ok: "bg-success", warn: "bg-warning", bad: "bg-destructive", info: "bg-primary", muted: "bg-muted-foreground" }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {children}
    </span>
  );
}
