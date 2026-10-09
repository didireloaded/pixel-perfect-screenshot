import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Briefcase, ChevronRight, Clock3, MapPin, UserRound } from "lucide-react";
import { EmployeeShell, ConnectionBanner, StatusPill } from "@/components/app/EmployeeShell";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { useAttendance } from "@/lib/app-store";

export const Route = createFileRoute("/jobs")({ component: Jobs });

function Jobs() {
  const d = useAttendance();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const jobs = d.jobs
    .filter((job) => job.assignee === d.me)
    .sort((a, b) => b.date.localeCompare(a.date) || a.start.localeCompare(b.start));
  const selected = jobs.find((job) => job.id === selectedId);
  const todayJobs = jobs.filter((job) => job.date === d.today && job.status !== "completed");
  const canStart =
    selected?.date === d.today && selected.status === "assigned" && d.state === "working";
  const canReturn = selected?.status === "in_progress" && d.state === "on_job";

  const completeAction = async () => {
    if (!selected) return;
    const saved = canStart
      ? await d.act("start_job", { jobId: selected.id })
      : canReturn
        ? await d.act("end_job")
        : false;
    if (saved) setSelectedId(null);
  };

  return (
    <EmployeeShell title="Jobs">
      <section className="card-surface overflow-hidden p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Assigned work
            </p>
            <h2 className="mt-2 text-2xl font-bold">Your jobs</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Open a job for its location, instructions and work action.
            </p>
          </div>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
            <Briefcase />
          </span>
        </div>
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-tint-blue p-4">
          <span className="text-3xl font-bold">{todayJobs.length}</span>
          <span className="text-sm text-muted-foreground">
            {todayJobs.length === 1 ? "job" : "jobs"} remaining today
          </span>
        </div>
      </section>

      {!jobs.length && (
        <p className="card-surface p-5 text-sm text-muted-foreground">
          No jobs assigned yet. New assignments will appear here.
        </p>
      )}
      {jobs.length > 0 && <h2 className="px-1 text-lg font-bold">Schedule</h2>}
      {jobs.map((job) => (
        <button
          key={job.id}
          type="button"
          onClick={() => setSelectedId(job.id)}
          className="card-surface w-full p-4 text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`Open ${job.title}, ${job.date} at ${job.start}`}
        >
          <span className="flex items-start gap-3">
            <span
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${job.status === "completed" ? "bg-tint-mint text-success" : job.status === "in_progress" ? "bg-primary-soft text-primary" : "bg-tint-blue text-info"}`}
            >
              <Briefcase className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-muted-foreground">
                {job.date === d.today ? "Today" : job.date} · {job.start}–{job.end}
              </span>
              <span className="mt-1 block truncate text-base font-bold">{job.title}</span>
              <span className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                {job.destination}
              </span>
            </span>
            <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-muted-foreground" />
          </span>
          <span className="mt-3 inline-block">
            <StatusPill
              tone={
                job.status === "completed" ? "ok" : job.status === "in_progress" ? "warn" : "info"
              }
            >
              {job.status.replace("_", " ")}
            </StatusPill>
          </span>
        </button>
      ))}
      <ConnectionBanner />

      <Drawer open={!!selected} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DrawerContent className="mx-auto max-h-[88vh] max-w-[440px] overflow-y-auto rounded-t-[2rem] px-5 pb-8">
          {selected && (
            <>
              <div className="mt-5 flex items-center justify-between">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft text-primary">
                  <Briefcase />
                </span>
                <StatusPill
                  tone={
                    selected.status === "completed"
                      ? "ok"
                      : selected.status === "in_progress"
                        ? "warn"
                        : "info"
                  }
                >
                  {selected.status.replace("_", " ")}
                </StatusPill>
              </div>
              <DrawerTitle className="mt-5 text-2xl font-bold leading-tight">
                {selected.title}
              </DrawerTitle>
              <DrawerDescription className="mt-2">Your assigned job details</DrawerDescription>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-tint-blue p-4">
                  <Clock3 className="h-5 w-5 text-info" />
                  <p className="mt-3 text-xs text-muted-foreground">Scheduled</p>
                  <p className="mt-1 text-sm font-bold">{selected.date}</p>
                  <p className="text-sm">
                    {selected.start}–{selected.end}
                  </p>
                </div>
                <div className="rounded-2xl bg-tint-cream p-4">
                  <UserRound className="h-5 w-5 text-warning" />
                  <p className="mt-3 text-xs text-muted-foreground">Supervisor</p>
                  <p className="mt-1 text-sm font-bold">{selected.supervisor || "Not listed"}</p>
                </div>
              </div>
              <section className="mt-5 border-t border-border pt-5">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <MapPin className="h-4 w-4 text-primary" /> Destination
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">{selected.destination}</p>
              </section>
              <section className="mt-5 border-t border-border pt-5">
                <h3 className="text-sm font-bold">Instructions</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {selected.instructions || "No additional instructions."}
                </p>
              </section>
              {selected.status !== "completed" && (
                <div className="mt-6">
                  <Button
                    variant="hero"
                    size="xl"
                    className="w-full"
                    disabled={d.busy || !d.online || (!canStart && !canReturn)}
                    onClick={() => void completeAction()}
                  >
                    {selected.status === "in_progress" ? "Back from job" : "Start job"}
                  </Button>
                  {!canStart && !canReturn && (
                    <p className="mt-2 text-center text-xs text-muted-foreground">
                      {selected.date !== d.today
                        ? "This action is available on the scheduled day."
                        : selected.status === "assigned"
                          ? "Clock in before starting this job."
                          : "Return is available while you are on this job."}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </DrawerContent>
      </Drawer>
    </EmployeeShell>
  );
}
