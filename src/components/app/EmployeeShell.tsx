import { Link } from "@tanstack/react-router";
import {
  Bell,
  CalendarClock,
  CalendarDays,
  Briefcase,
  Clock3,
  Inbox,
  Mail,
  LayoutDashboard,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { backendMode } from "@/lib/backend";
import { useAttendance } from "@/lib/app-store";

const NAV = [
  { to: "/", label: "Today", icon: CalendarClock },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/inbox", label: "Inbox", icon: Mail },
  { to: "/hours", label: "Hours", icon: Clock3 },
] as const;

export function ConnectionBanner() {
  return (
    <p className="rounded-full bg-tint-cream px-3 py-1 text-center text-[11px] font-medium text-foreground">
      {backendMode === "local"
        ? "Local server · records saved on this computer"
        : "Connected · attendance saved to your company"}
    </p>
  );
}

export function EmployeeShell({ title, children }: { title: string; children: ReactNode }) {
  const d = useAttendance();
  const me = d.employees.find((e) => e.id === d.me)!;
  const [profile, setProfile] = useState(false);
  const [notices, setNotices] = useState(false);
  const unacked =
    d.requests.filter((r) => r.employeeId === d.me && r.status !== "pending").length +
    d.notices.filter((n) => n.requiresAck && !n.acknowledged && n.endsOn >= d.today).length +
    d.messages.filter((m) => m.recipientId === d.me && !m.readAt).length;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[440px] flex-col bg-background sm:my-6 sm:min-h-[860px] sm:rounded-[2.5rem] sm:shadow-card">
      <header className="sticky top-0 z-20 px-5 pt-5">
        <div className="card-surface flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => setProfile(true)}
            aria-label="Open profile, settings and privacy"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-accent-foreground"
          >
            {me.name
              .split(" ")
              .map((p) => p[0])
              .join("")}
          </button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h1>
          <button
            onClick={() => setNotices(true)}
            aria-label={`Notifications${unacked ? `, ${unacked} need acknowledgement` : ""}`}
            className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-muted"
          >
            <Bell className="h-5 w-5" strokeWidth={1.8} />
            {unacked > 0 && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive" />
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 space-y-4 px-5 pb-28 pt-4">{children}</main>

      <nav
        aria-label="Main"
        className="pb-safe fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[440px] border-t border-border bg-card px-3 pt-2 sm:rounded-b-[2.5rem]"
      >
        <ul className="grid grid-cols-5">
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
          <DrawerDescription>
            Employee no. {me.no} · {me.role} · {me.team}
          </DrawerDescription>
          <section className="mt-5 space-y-3 rounded-2xl bg-tint-blue p-4 text-sm">
            <h3 className="font-bold">Location privacy</h3>
            <p>
              Worksite checks run only while this app is open, you are working, and your shift is
              active. They pause for lunch, jobs and personal departures.
            </p>
            <p>
              The server keeps only exit and return alerts with distance and accuracy. It does not
              store a route or coordinates from these checks.
            </p>
            <Button
              variant="chip"
              size="sm"
              onClick={() => d.setLocationMonitoringEnabled(!d.locationMonitoringEnabled)}
            >
              {d.locationMonitoringEnabled ? "Turn off site checks" : "Enable site checks"}
            </Button>
          </section>
          <div className="mt-4 flex flex-col gap-2">
            <Button variant="pill" size="xl" asChild>
              <Link to="/requests">
                <Inbox /> Requests and corrections
              </Link>
            </Button>
            <Button variant="pill" size="xl" asChild>
              <Link to="/inbox">
                <Mail /> Messages and company news
              </Link>
            </Button>
            {d.role === "manager" && (
              <Button variant="pill" size="xl" asChild>
                <Link to="/manager">
                  <LayoutDashboard /> Open manager dashboard
                </Link>
              </Button>
            )}
            <Button variant="chip" size="xl" onClick={() => void d.logout()}>
              Sign out
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={notices} onOpenChange={setNotices}>
        <DrawerContent className="mx-auto max-w-[440px] rounded-t-[2rem] px-5 pb-8">
          <DrawerTitle className="pt-4 text-xl font-bold">Notifications</DrawerTitle>
          <DrawerDescription>
            Company notices, request decisions and upcoming shifts
          </DrawerDescription>
          <div className="mt-4 space-y-3">
            {d.messages
              .filter((m) => m.recipientId === d.me && !m.readAt)
              .map((m) => (
                <Link
                  key={m.id}
                  to="/inbox"
                  className="block rounded-2xl bg-primary-soft p-4 text-sm"
                >
                  <p className="text-xs font-semibold uppercase text-primary">
                    Message from {m.senderName}
                  </p>
                  <h3 className="mt-1 font-bold">{m.title}</h3>
                  <p className="mt-1 line-clamp-2 text-muted-foreground">{m.body}</p>
                </Link>
              ))}
            {d.notices
              .filter((n) => n.endsOn >= d.today)
              .map((n) => (
                <article key={n.id} className="rounded-2xl bg-tint-pink p-4 text-sm">
                  <p className="text-xs font-semibold uppercase text-primary">
                    {n.kind.replaceAll("_", " ")} · {n.startsOn}
                  </p>
                  <h3 className="mt-1 font-bold">{n.title}</h3>
                  <p className="mt-1 text-muted-foreground">{n.body}</p>
                  {n.requiresAck && (
                    <Button
                      variant="pill"
                      size="sm"
                      className="mt-3"
                      disabled={n.acknowledged || d.busy}
                      onClick={() => void d.command("ack_notice", { id: n.id })}
                    >
                      {n.acknowledged ? "Acknowledged" : "Acknowledge"}
                    </Button>
                  )}
                </article>
              ))}
            {d.requests
              .filter((r) => r.employeeId === d.me && r.status !== "pending")
              .map((r) => (
                <article key={r.id} className="rounded-2xl bg-tint-blue p-4 text-sm">
                  <h3 className="font-bold">{r.summary}</h3>
                  <p className="mt-1 capitalize">
                    {r.status} · {r.reviewer}
                  </p>
                  <p className="mt-1 text-muted-foreground">{r.reason}</p>
                </article>
              ))}
            {d.shifts
              .filter((s) => s.employeeId === d.me && s.date >= d.today)
              .map((s) => (
                <article key={s.id} className="rounded-2xl bg-tint-cream p-4 text-sm">
                  <h3 className="font-bold">Shift · {s.date}</h3>
                  <p>
                    {s.start}–{s.end} · {d.sites.find((site) => site.id === s.siteId)?.name}
                  </p>
                </article>
              ))}
            {!unacked && !d.shifts.some((s) => s.employeeId === d.me && s.date >= d.today) && (
              <p className="text-sm text-muted-foreground">You're up to date.</p>
            )}
          </div>
          <Button variant="ghost" className="mt-3" onClick={() => setNotices(false)}>
            <X /> Close
          </Button>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

export function StatusPill({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "bad" | "info" | "muted";
  children: ReactNode;
}) {
  const cls = {
    ok: "bg-tint-mint text-foreground",
    warn: "bg-tint-cream text-foreground",
    bad: "bg-tint-pink text-destructive",
    info: "bg-primary-soft text-accent-foreground",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  const dot = {
    ok: "bg-success",
    warn: "bg-warning",
    bad: "bg-destructive",
    info: "bg-primary",
    muted: "bg-muted-foreground",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {children}
    </span>
  );
}
