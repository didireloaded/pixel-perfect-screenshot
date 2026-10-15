import { useState } from "react";
import { MapPin } from "lucide-react";
import { useAttendance } from "@/lib/app-store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ThemedSelect } from "../../../shared/ThemedSelect";
import type { Job } from "../../../shared/attendance";
import { CalendarJobForm } from "./CalendarJobForm";
import { JobPlanLocationForm } from "./JobPlanLocationForm";
import { jobPhase } from "../../../shared/calendar-jobs";
export function ManagerJobBrief({ job, onSaved }: { job?: Job; onSaved: () => void }) {
  const d = useAttendance();
  const [id] = useState(() => crypto.randomUUID());
  const shifts = d.shifts.filter((s) => s.employeeId !== d.me);
  const [shiftId] = useState(
    job?.shiftId || shifts.find((s) => s.date >= d.today)?.id || shifts[0]?.id || "",
  );
  const shift = d.shifts.find((s) => s.id === shiftId);
  const site = d.sites.find((s) => s.id === shift?.siteId);
  const [latitude, setLatitude] = useState(job?.latitude == null ? "" : String(job.latitude));
  const [longitude, setLongitude] = useState(job?.longitude == null ? "" : String(job.longitude));
  if (!job) return <CalendarJobForm date={d.today} onSaved={onSaved} />;
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const fd = new FormData(event.currentTarget);
        const payload = {
          ...Object.fromEntries(fd),
          shiftId,
          id,
          jobId: job?.id,
          latitude: latitude ? Number(latitude) : null,
          longitude: longitude ? Number(longitude) : null,
          radiusM: Number(fd.get("radiusM")),
          overtime: fd.get("overtime") === "on",
        };
        void d.command(job ? "configure_job" : "create_job", payload).then((saved) => {
          if (saved) onSaved();
        });
      }}
    >
      <p className="rounded-xl bg-muted p-3 text-sm">
        {job.title} · {job.destination}
        <br />
        <span className="text-xs text-muted-foreground">
          {job.date} · {job.start}–{job.end}
        </span>
      </p>
      <div className="rounded-2xl border border-border p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <MapPin size={16} />
          Job location
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Use the job’s exact coordinates so the map checks the job site.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-sm">
            Latitude
            <input
              className="mt-2 w-full rounded-xl border border-border bg-muted p-3"
              type="number"
              step="any"
              min={-90}
              max={90}
              required
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Longitude
            <input
              className="mt-2 w-full rounded-xl border border-border bg-muted p-3"
              type="number"
              step="any"
              min={-180}
              max={180}
              required
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
            />
          </label>
        </div>
        {site?.latitude != null && site.longitude != null && (
          <button
            type="button"
            className="mt-3 text-xs font-semibold underline"
            onClick={() => {
              setLatitude(String(site.latitude));
              setLongitude(String(site.longitude));
            }}
          >
            Use this shift’s workplace location
          </button>
        )}
        <label className="mt-4 block text-sm">
          Job boundary (metres)
          <input
            className="mt-2 w-full rounded-xl border border-border bg-muted p-3"
            type="number"
            name="radiusM"
            min={100}
            max={5000}
            step={1}
            defaultValue={job?.radiusM || 150}
            required
          />
        </label>
      </div>
      <label className="block text-sm">
        Lunch plan
        <ThemedSelect
          className="mt-2"
          name="lunchOption"
          defaultValue={job?.lunchOption || "scheduled"}
        >
          <option value="scheduled">Lunch follows the shift schedule</option>
          <option value="none">No lunch scheduled for this job</option>
        </ThemedSelect>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="overtime" defaultChecked={job?.overtime || false} />
        This is an overtime job
      </label>
      <p className="text-xs text-muted-foreground">
        Overtime hours are calculated from attendance and still need approval. Extend the assigned
        shift first if this job runs later.
      </p>
      <Button className="w-full" disabled={d.busy || !d.online || !shiftId}>
        {d.busy ? "Saving…" : job ? "Save job details" : "Assign job"}
      </Button>
    </form>
  );
}
export function ManagerJobBriefs({ onAdd }: { onAdd: () => void }) {
  const d = useAttendance();
  const [selected, setSelected] = useState("");
  const [phase, setPhase] = useState("all");
  const plans = d.calendarJobs ?? [];
  const job = d.jobs.find((j) => j.id === selected);
  const plan = d.calendarJobs?.find((item) => item.id === selected);
  return (
    <section className="project-panel">
      <div className="project-panel-head">
        <div>
          <h2>Project workspace</h2>
          <p className="project-panel-sub">
            Locations, lunch plans and instructions shared with workers.
          </p>
        </div>
        <Button onClick={onAdd}>New job</Button>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["all", "All projects"],
            ["assigned", "Upcoming"],
            ["in_progress", "Active"],
            ["completed", "Completed"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={`rounded-2xl border p-4 text-left ${phase === value ? "bg-primary-soft border-primary" : "bg-muted border-border"}`}
            aria-pressed={phase === value}
            onClick={() => setPhase(value)}
          >
            <span className="block text-sm">{label}</span>
            <b className="block text-2xl mt-2">
              {plans.filter((plan) => value === "all" || jobPhase(plan, d.today) === value).length}
            </b>
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {plans
          .filter((plan) => phase === "all" || jobPhase(plan, d.today) === phase)
          .map((plan) => (
            <article key={plan.id} className="rounded-2xl border border-border p-4">
              <h3 className="font-semibold">{plan.title}</h3>
              <p className="mt-2 text-xs font-semibold">
                {plan.completedAt
                  ? "Completed"
                  : plan.date > d.today
                    ? "Upcoming"
                    : (plan.endDate ?? plan.date) < d.today
                      ? "Past planned finish · review completion"
                      : "Active project"}
              </p>
              <p className="text-xs mt-1">
                {plan.date} · {plan.address || "Location needs confirmation"}
              </p>
              <p className="text-xs mt-2">
                {plan.assignedNames.length
                  ? plan.assignedNames.join(", ")
                  : "Open to company workers"}
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm">{plan.details}</p>
              <p className="mt-2 text-sm">
                Through {plan.endDate ?? plan.date} ·{" "}
                {plan.returnToOffice === false ? "Finish on site" : "Return to office"}
              </p>
              {plan.lunchGuidance && <p className="mt-2 text-sm">{plan.lunchGuidance}</p>}
              <p className="mt-3 text-xs text-muted-foreground">
                {
                  new Set(
                    d.jobs
                      .filter((job) => job.calendarJobId === plan.id)
                      .map((job) => job.assignee),
                  ).size
                }{" "}
                employees have recorded work on this project
              </p>
              <Button
                className="mt-3"
                variant="soft"
                disabled={d.jobs.some((job) => job.calendarJobId === plan.id)}
                onClick={() => setSelected(plan.id)}
              >
                Edit job location
              </Button>
              {!plan.completedAt && (
                <Button
                  variant="soft"
                  className="mt-3 ml-2"
                  disabled={d.busy || !d.online}
                  onClick={() => void d.command("complete_calendar_job", { id: plan.id })}
                >
                  Mark project completed
                </Button>
              )}
            </article>
          ))}
        {d.jobs
          .filter((j) => !j.calendarJobId)
          .map((j) => (
            <article key={j.id} className="rounded-2xl border border-border p-4">
              <h3 className="font-semibold">{j.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {j.destination} · {j.date} · {j.start}–{j.end}
              </p>
              <p className="mt-2 text-xs">
                {j.lunchOption === "none" ? "No scheduled lunch" : "Shift lunch schedule"}
                {j.overtime ? " · Overtime job" : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {j.latitude == null ? "Job location still needed" : `${j.latitude}, ${j.longitude}`}
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm">{j.instructions}</p>
              <Button
                className="mt-3"
                variant="soft"
                disabled={j.status !== "assigned"}
                onClick={() => setSelected(j.id)}
              >
                Edit job location & plan
              </Button>
            </article>
          ))}
      </div>
      {!d.jobs.length && !(d.calendarJobs ?? []).length && (
        <p className="mt-5 text-sm text-muted-foreground">
          Create a company job. Employee assignment is optional.
        </p>
      )}
      <Dialog
        open={!!job || !!plan}
        onOpenChange={(open) => {
          if (!open) setSelected("");
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogTitle>Edit job brief</DialogTitle>
          <DialogDescription>Change the location and plan before work starts.</DialogDescription>
          {job && <ManagerJobBrief key={job.id} job={job} onSaved={() => setSelected("")} />}
          {plan && (
            <JobPlanLocationForm key={plan.id} plan={plan} onSaved={() => setSelected("")} />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
