import { useState, type FormEvent } from "react";
import { CheckCircle2, Mail, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAttendance } from "@/lib/app-store";

export function ManagerMessages() {
  const d = useAttendance();
  const [recipientId, setRecipientId] = useState("");
  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const result = await d.command("send_message", {
      recipientId,
      title: String(fields.get("title") || "").trim(),
      body: String(fields.get("body") || "").trim(),
    });
    if (result) {
      form.reset();
      setRecipientId("");
    }
  };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form onSubmit={send} className="card-surface space-y-4 p-5">
        <div className="flex items-center gap-3">
          <Mail className="text-primary" />
          <div>
            <h2 className="text-lg font-bold">Message an employee</h2>
            <p className="text-sm text-muted-foreground">
              Only managers can send. Employees can read and mark messages as read.
            </p>
          </div>
        </div>
        <label className="block text-sm font-medium">
          Recipient
          <select
            required
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
            className="mt-2 h-12 w-full rounded-2xl bg-muted px-3"
          >
            <option value="">Choose an employee</option>
            {d.employees
              .filter((e) => e.role === "employee")
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.no}
                </option>
              ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Subject
          <Input name="title" required maxLength={120} className="mt-2 h-12 rounded-2xl bg-muted" />
        </label>
        <label className="block text-sm font-medium">
          Message
          <Textarea
            name="body"
            required
            maxLength={2000}
            className="mt-2 min-h-28 rounded-2xl bg-muted"
          />
        </label>
        <Button
          variant="hero"
          size="xl"
          className="w-full"
          disabled={d.busy || !d.online || !recipientId}
        >
          Send message
        </Button>
      </form>
      <section className="card-surface p-5">
        <h2 className="text-lg font-bold">Sent messages</h2>
        <div className="mt-4 space-y-3">
          {!d.messages.length && (
            <p className="text-sm text-muted-foreground">No messages sent yet.</p>
          )}
          {d.messages.map((m) => (
            <article key={m.id} className="rounded-2xl bg-tint-blue p-4">
              <p className="text-xs text-muted-foreground">
                To {d.employees.find((e) => e.id === m.recipientId)?.name} ·{" "}
                {new Date(m.sentAt).toLocaleString()}
              </p>
              <h3 className="mt-1 font-bold">{m.title}</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
              <p className="mt-2 text-xs text-muted-foreground">{m.readAt ? "Read" : "Unread"}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ManagerJobTools() {
  const d = useAttendance();
  const [jobId, setJobId] = useState("");
  const [memberId, setMemberId] = useState("");
  const job = d.jobs.find((item) => item.id === jobId);
  const steps = d.jobSteps.filter((item) => item.jobId === jobId);
  const members = d.jobTeam.filter((item) => item.jobId === jobId);
  const addStep = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const label = String(new FormData(form).get("label") || "").trim();
    if (await d.command("add_job_step", { jobId, label })) form.reset();
  };
  const addMember = async () => {
    if (await d.command("add_job_member", { jobId, employeeId: memberId })) setMemberId("");
  };
  return (
    <section className="card-surface mt-5 p-5">
      <div className="flex items-center gap-3">
        <Users className="text-primary" />
        <div>
          <h2 className="text-lg font-bold">Job steps and team</h2>
          <p className="text-sm text-muted-foreground">
            Progress comes from completed steps. Team members are shown for coordination; the
            assigned worker records attendance for this job.
          </p>
        </div>
      </div>
      <label className="mt-5 block text-sm font-medium">
        Job
        <select
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          className="mt-2 h-12 w-full rounded-2xl bg-muted px-3"
        >
          <option value="">Choose a job</option>
          {d.jobs.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} · {item.date} · {d.employees.find((e) => e.id === item.assignee)?.name}
            </option>
          ))}
        </select>
      </label>
      {job && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl bg-tint-blue p-4">
            <h3 className="flex items-center gap-2 font-bold">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Task steps
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {steps.filter((s) => s.completedAt).length} of {steps.length} completed
            </p>
            <div className="mt-3 space-y-2">
              {steps.map((step) => (
                <div key={step.id} className="rounded-xl bg-white p-3 text-sm">
                  {step.completedAt ? "✓ " : "○ "}
                  {step.label}
                </div>
              ))}
            </div>
            <form onSubmit={addStep} className="mt-4 flex gap-2">
              <Input
                name="label"
                required
                maxLength={160}
                placeholder="Add a step"
                className="h-11 rounded-xl bg-white"
              />
              <Button disabled={d.busy || !d.online}>Add</Button>
            </form>
          </div>
          <div className="rounded-2xl bg-tint-mint p-4">
            <h3 className="font-bold">Working with</h3>
            <div className="mt-3 space-y-2">
              {members.map((member) => (
                <div
                  key={member.employeeId}
                  className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 text-sm"
                >
                  <span>
                    {member.name}
                    {member.employeeId === job.assignee ? " · assigned" : ""}
                  </span>
                  {member.employeeId !== job.assignee && (
                    <button
                      type="button"
                      disabled={d.busy || !d.online}
                      onClick={() =>
                        void d.command("remove_job_member", {
                          jobId,
                          employeeId: member.employeeId,
                        })
                      }
                      className="text-xs font-semibold text-destructive"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <select
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="h-11 min-w-0 flex-1 rounded-xl bg-white px-2 text-sm"
              >
                <option value="">Choose teammate</option>
                {d.employees
                  .filter(
                    (e) => e.role === "employee" && !members.some((m) => m.employeeId === e.id),
                  )
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
              </select>
              <Button disabled={!memberId || d.busy || !d.online} onClick={() => void addMember()}>
                Add
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
