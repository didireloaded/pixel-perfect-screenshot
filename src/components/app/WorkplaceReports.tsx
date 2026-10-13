import { useRef, useState, type FormEvent } from "react";
import { useAttendance } from "@/lib/app-store";
import * as backend from "@/lib/backend";
import { ThemedSelect } from "../../../shared/ThemedSelect";
import { Button } from "@/components/ui/button";

export function WorkplaceReports() {
  const data = useAttendance();
  const [scope, setScope] = useState("company");
  const [target, setTarget] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const id = useRef(crypto.randomUUID());
  const fileId = useRef<string>(crypto.randomUUID());
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [documentLink, setDocumentLink] = useState<{ id: string; url: string } | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const incidents = data.incidents ?? [];
  const incident = incidents.find((item) => item.id === selected);
  const people = data.employees.filter(
    (employee) =>
      employee.role === "employee" &&
      employee.accessStatus !== "pending" &&
      employee.accessStatus !== "rejected",
  );
  const options =
    scope === "employee"
      ? people.map((employee) => ({ value: employee.id, label: employee.name }))
      : scope === "site"
        ? data.sites.map((site) => ({ value: site.id, label: site.name }))
        : [...new Set(people.map((employee) => employee.team).filter(Boolean))].map((team) => ({
            value: team,
            label: team,
          }));
  const time = (value: string) =>
    new Date(value).toLocaleString([], { timeZone: data.company.timezone });
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const reportId = id.current;
    const result = await data.command("create_incident", {
      id: reportId,
      kind: fields.get("kind"),
      title: fields.get("title"),
      description: fields.get("description"),
      startsLocal: fields.get("startsLocal"),
      endsLocal: fields.get("endsLocal"),
      scope,
      target: scope === "company" ? "" : target,
    });
    if (result) {
      id.current = crypto.randomUUID();
      form.reset();
      setSelected(reportId);
      setFile(null);
      setError("");
    }
  };
  const upload = async () => {
    if (!file || !incident) return;
    setUploading(true);
    setError("");
    try {
      await backend.uploadReport(incident.id, fileId.current, file);
      await data.refresh();
      setFile(null);
      fileId.current = crypto.randomUUID();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not upload document. Retry with the same file.",
      );
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Reports explain disruptions. Linking or confirming an explanation never changes attendance
        hours or pay. Use Corrections for attendance changes.
      </p>
      <form onSubmit={save} className="project-panel project-note-form">
        <h2>New workplace report</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            Report type
            <ThemedSelect name="kind" defaultValue="power_outage">
              {[
                { value: "power_outage", label: "Power outage" },
                { value: "disruption", label: "Weather or site disruption" },
                { value: "early_release", label: "Authorized early release" },
                { value: "emergency", label: "Workplace emergency" },
                { value: "other", label: "Other incident" },
              ].map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </ThemedSelect>
          </label>
          <label>
            Affected employees
            <ThemedSelect
              value={scope}
              onValueChange={(value) => {
                setScope(value);
                setTarget("");
              }}
            >
              {[
                { value: "company", label: "Entire company" },
                { value: "site", label: "Worksite" },
                { value: "department", label: "Department" },
                { value: "employee", label: "Employee" },
              ].map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </ThemedSelect>
          </label>
          {scope !== "company" && (
            <label>
              Select {scope}
              <ThemedSelect value={target} onValueChange={setTarget}>
                <option value="">Choose affected group</option>
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </ThemedSelect>
            </label>
          )}
          <label>
            From
            <input
              name="startsLocal"
              type="datetime-local"
              required
              defaultValue={`${data.today}T08:00`}
            />
          </label>
          <label>
            Until
            <input
              name="endsLocal"
              type="datetime-local"
              required
              defaultValue={`${data.today}T17:00`}
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Times use {data.company.timezone}. Affected employees are recorded when the report is
          submitted.
        </p>
        <label>
          Title
          <input name="title" required maxLength={200} />
        </label>
        <label>
          What happened?
          <textarea name="description" required maxLength={4000} />
        </label>
        <Button disabled={data.busy || !data.online || (scope !== "company" && !target)}>
          Submit official report
        </Button>
      </form>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="project-panel">
          <h2>Company reports</h2>
          {incidents.map((item) => (
            <button
              key={item.id}
              className="overview-list-row w-full text-left"
              onClick={() => {
                setSelected(item.id);
                setFile(null);
                fileId.current = crypto.randomUUID();
                setError("");
              }}
            >
              <b>{item.title}</b>
              <span>
                {time(item.starts_at)} – {time(item.ends_at)}
              </span>
              <small>
                {
                  (data.incidentExceptions ?? []).filter((link) => link.incident_id === item.id)
                    .length
                }{" "}
                linked workday(s)
              </small>
            </button>
          ))}
          {!incidents.length && <p className="project-empty">No workplace reports yet.</p>}
        </section>
        <section className="project-panel">
          <h2>{incident?.title ?? "Report details"}</h2>
          {!incident && (
            <p className="project-empty">
              Select a report to see its evidence and affected workdays.
            </p>
          )}
          {incident && (
            <div className="space-y-4 mt-4">
              <p className="whitespace-pre-wrap">{incident.description}</p>
              <p className="text-sm">
                {time(incident.starts_at)} – {time(incident.ends_at)}
              </p>
              <h3 className="font-semibold">Supporting documents</h3>
              <p className="text-xs text-muted-foreground">
                Operational PDF or TXT files, up to 5 MB. Private to company managers. Do not upload
                medical documents here.
              </p>
              <input
                aria-label="Supporting document"
                type="file"
                accept=".pdf,.txt"
                disabled={uploading}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  fileId.current = crypto.randomUUID();
                }}
              />
              <Button
                type="button"
                disabled={!file || uploading || !data.online}
                onClick={() => void upload()}
              >
                {uploading ? "Uploading…" : "Upload document"}
              </Button>
              {(data.reportDocuments ?? [])
                .filter((doc) => doc.incident_id === incident.id)
                .map((doc) => (
                  <div key={doc.id} className="flex flex-wrap items-center gap-3">
                    <span>
                      {doc.filename} · {doc.status === "ready" ? "Uploaded" : "Upload incomplete"}
                    </span>
                    {doc.status === "pending" && (
                      <>
                        <Button
                          variant="outline"
                          disabled={uploading || !data.online}
                          onClick={() =>
                            void data.command("finish_report_document", { id: doc.id })
                          }
                        >
                          Confirm uploaded file
                        </Button>
                        <Button
                          variant="outline"
                          disabled={!file || uploading || !data.online}
                          onClick={() => {
                            fileId.current = doc.id;
                            void upload();
                          }}
                        >
                          Retry with selected file
                        </Button>
                      </>
                    )}
                    {doc.status === "ready" && (
                      <Button
                        variant="outline"
                        disabled={uploading || !data.online}
                        onClick={() => {
                          setError("");
                          void backend
                            .reportDocumentUrl(doc.object_path)
                            .then((url) => setDocumentLink({ id: doc.id, url }))
                            .catch((cause) =>
                              setError(
                                cause instanceof Error ? cause.message : "Document unavailable",
                              ),
                            );
                        }}
                      >
                        Prepare document
                      </Button>
                    )}
                    {documentLink?.id === doc.id && (
                      <a
                        className="underline"
                        href={documentLink.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View document
                      </a>
                    )}
                  </div>
                ))}
              {error && (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              )}
              <h3 className="font-semibold">Attendance impact</h3>
              {(data.incidentExceptions ?? [])
                .filter((link) => link.incident_id === incident.id)
                .map((link) => (
                  <div key={link.id} className="border rounded-xl p-4 space-y-3">
                    <b>
                      {data.employees.find((employee) => employee.id === link.employee_id)?.name ??
                        "Employee"}
                    </b>
                    <p>
                      {data.shifts.find((shift) => shift.id === link.shift_id)?.date} ·{" "}
                      {link.status === "pending"
                        ? "Attendance impact awaiting review"
                        : link.status === "explained"
                          ? "Explanation confirmed · hours unchanged"
                          : "Connection dismissed"}
                    </p>
                    {link.review_reason && <p>{link.review_reason}</p>}
                    {link.status === "pending" && (
                      <>
                        <label className="block text-sm">
                          Review reason
                          <textarea
                            className="w-full border rounded-lg p-2 mt-1"
                            value={reasons[link.id] ?? ""}
                            maxLength={1000}
                            onChange={(event) =>
                              setReasons({ ...reasons, [link.id]: event.target.value })
                            }
                          />
                        </label>
                        <div className="flex gap-2">
                          {(["explained", "dismissed"] as const).map((decision) => (
                            <Button
                              key={decision}
                              variant={decision === "dismissed" ? "outline" : "default"}
                              disabled={data.busy || !data.online || !reasons[link.id]?.trim()}
                              onClick={() =>
                                void data.command("review_incident_exception", {
                                  id: link.id,
                                  decision,
                                  reason: reasons[link.id]?.trim(),
                                })
                              }
                            >
                              {decision === "explained"
                                ? "Confirm explanation"
                                : "Dismiss connection"}
                            </Button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              {!(data.incidentExceptions ?? []).some(
                (link) => link.incident_id === incident.id,
              ) && (
                <p className="text-sm text-muted-foreground">
                  No overlapping recorded workdays. Planned schedules alone do not establish
                  attendance.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
      <section className="project-panel">
        <h2>Worker activities</h2>
        {(data.workActivities ?? []).slice(0, 30).map((activity) => (
          <article className="overview-list-row" key={activity.id}>
            <b>
              {data.employees.find((employee) => employee.id === activity.employee_id)?.name ??
                "Employee"}{" "}
              · {activity.kind.replaceAll("_", " ")}
            </b>
            <span>{activity.description}</span>
            <small>
              {time(activity.recorded_at)}
              {activity.job_id
                ? ` · ${data.jobs.find((job) => job.id === activity.job_id)?.title ?? "Assigned job"}`
                : ""}
            </small>
          </article>
        ))}
        {!(data.workActivities ?? []).length && (
          <p className="project-empty">Confirmed worker activities will appear here.</p>
        )}
      </section>
    </div>
  );
}
