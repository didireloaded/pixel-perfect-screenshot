import { createFileRoute } from "@tanstack/react-router";
import { Briefcase, MapPin } from "lucide-react";
import { EmployeeShell, ConnectionBanner, StatusPill } from "@/components/app/EmployeeShell";
import { Button } from "@/components/ui/button";
import { useAttendance } from "@/lib/app-store";
export const Route = createFileRoute("/jobs")({ component: Jobs });
function Jobs() {
  const d = useAttendance();
  const jobs = d.jobs
    .filter((j) => j.assignee === d.me)
    .sort((a, b) => b.date.localeCompare(a.date) || a.start.localeCompare(b.start));
  return (
    <EmployeeShell title="Jobs">
      <ConnectionBanner />
      <section className="card-surface p-5">
        <Briefcase className="mb-3 h-6 w-6 text-primary" />
        <h2 className="text-xl font-bold">Your assigned work</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Where to go, what to do, and who to contact.
        </p>
      </section>
      {!jobs.length && (
        <p className="card-surface p-5 text-sm text-muted-foreground">No jobs assigned yet.</p>
      )}
      {jobs.map((j) => (
        <article key={j.id} className="card-surface space-y-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {j.date} · {j.start}–{j.end}
            </p>
            <StatusPill tone={j.status === "completed" ? "ok" : "info"}>
              {j.status.replace("_", " ")}
            </StatusPill>
          </div>
          <h2 className="text-lg font-bold">{j.title}</h2>
          <p className="flex gap-2 text-sm">
            <MapPin className="h-4 w-4 shrink-0" />
            {j.destination}
          </p>
          <p className="text-sm text-muted-foreground">
            {j.instructions || "No additional instructions."}
          </p>
          <p className="text-xs text-muted-foreground">Supervisor · {j.supervisor}</p>
          {j.date === d.today && j.status === "assigned" && (
            <Button
              variant="hero"
              size="xl"
              className="w-full"
              disabled={d.busy || !d.online || d.state !== "working"}
              onClick={() => void d.act("start_job", { jobId: j.id })}
            >
              Start job
            </Button>
          )}
          {j.status === "in_progress" && d.state === "on_job" && (
            <Button
              variant="hero"
              size="xl"
              className="w-full"
              disabled={d.busy || !d.online}
              onClick={() => void d.act("end_job")}
            >
              Back from job
            </Button>
          )}
        </article>
      ))}
    </EmployeeShell>
  );
}
