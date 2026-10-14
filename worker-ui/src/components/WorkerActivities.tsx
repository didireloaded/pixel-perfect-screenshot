import { useRef, useState, type FormEvent } from "react";
import type { AttendanceSnapshot, AttendanceState } from "../../../shared/attendance";
import { ThemedSelect } from "../../../shared/ThemedSelect";
import { WorkerCard } from "./WorkerUI";
import { displayInstant } from "../../../shared/display-date";
import { currentWorkday } from "../../../shared/workday";

export function WorkerActivities({
  data,
  state,
  busy,
  online,
  run,
}: {
  data: AttendanceSnapshot;
  state: AttendanceState;
  busy: boolean;
  online: boolean;
  run: (action: string, payload: Record<string, unknown>, success: string) => Promise<boolean>;
}) {
  const [kind, setKind] = useState("other");
  const [jobId, setJobId] = useState("");
  const id = useRef(crypto.randomUUID());
  const shift = currentWorkday(data);
  const jobs = data.jobs.filter(
    (item) =>
      item.assignee === data.me && item.shiftId === shift?.id && item.status !== "completed",
  );
  const labels: Record<string, string> = {
    leaving_site: "Leaving for site",
    arrived_site: "Arrived at site",
    inspection: "Site inspection",
    returning_office: "Returned to office",
    other: "Other work activity",
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (
      await run(
        "record_work_activity",
        {
          id: id.current,
          shiftId: shift?.id,
          kind,
          description: new FormData(form).get("description"),
          jobId: jobId || null,
        },
        "Work activity recorded",
      )
    ) {
      id.current = crypto.randomUUID();
      form.reset();
    }
  };
  const time = (value: string) => displayInstant(value, data.company.timezone);
  return (
    <div className="space-y-4 mt-5">
      {shift && ["working", "on_job"].includes(state) && (
        <WorkerCard>
          <h2 className="font-semibold">Record work activity</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Leaving for an assigned job records your departure. Returning finishes that job. Lunch
            remains a separate action.
          </p>
          <form onSubmit={save} className="mt-4 space-y-3">
            <label className="block">
              Activity
              <ThemedSelect value={kind} onValueChange={setKind}>
                {Object.entries(labels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </ThemedSelect>
            </label>
            <label className="block">
              Assigned job
              <ThemedSelect
                value={jobId || "none"}
                onValueChange={(value) => setJobId(value === "none" ? "" : value)}
              >
                {[
                  { value: "none", label: "No job · other activity only" },
                  ...jobs.map((job) => ({ value: job.id, label: job.title })),
                ].map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </ThemedSelect>
            </label>
            <label className="block">
              Short explanation
              <textarea
                name="description"
                required
                maxLength={1000}
                className="w-full border rounded-xl p-3 mt-1 bg-transparent"
              />
            </label>
            <button
              type="submit"
              className="worker-action press"
              disabled={busy || !online || (kind !== "other" && !jobId)}
            >
              Record activity
            </button>
          </form>
        </WorkerCard>
      )}
      {(data.workActivities ?? []).filter((activity) => activity.shift_id === shift?.id).length >
        0 && (
        <WorkerCard>
          <h2 className="font-semibold">Workday activities</h2>
          {(data.workActivities ?? [])
            .filter((activity) => activity.shift_id === shift?.id)
            .map((activity) => (
              <article className="py-3 border-b last:border-0" key={activity.id}>
                <b>{labels[activity.kind]}</b>
                <p className="text-sm whitespace-pre-wrap">{activity.description}</p>
                <small>{time(activity.recorded_at)}</small>
              </article>
            ))}
        </WorkerCard>
      )}
      {(data.incidents ?? []).map((incident) => (
        <WorkerCard key={incident.id}>
          <h2 className="font-semibold">{incident.title}</h2>
          <p className="text-sm mt-2">
            {time(incident.starts_at)} – {time(incident.ends_at)}
          </p>
          <p className="whitespace-pre-wrap mt-3">{incident.description}</p>
          {(data.incidentExceptions ?? [])
            .filter((link) => link.incident_id === incident.id)
            .map((link) => (
              <p key={link.id} className="text-sm mt-3">
                {link.status === "pending"
                  ? "Attendance impact awaiting review"
                  : link.status === "explained"
                    ? "Explanation confirmed · recorded hours unchanged"
                    : "Attendance connection dismissed"}
                {link.review_reason ? ` · ${link.review_reason}` : ""}
              </p>
            ))}
          <p className="text-xs text-muted-foreground mt-3">
            This report does not automatically change your hours or pay.
          </p>
        </WorkerCard>
      ))}
    </div>
  );
}
