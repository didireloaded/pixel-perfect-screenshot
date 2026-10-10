import { useState, type FormEvent } from "react";
import { CheckCircle2, Mail, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAttendance } from "@/lib/app-store";

export function ManagerMessages() {
  const d = useAttendance();
  const [recipientId, setRecipientId] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const roots = d.messages.filter((m) => m.id === m.threadId && m.senderId === d.me);
  const threads = roots
    .map((root) => ({
      root,
      messages: d.messages
        .filter((m) => m.threadId === root.id)
        .sort((a, b) => a.sentAt.localeCompare(b.sentAt)),
    }))
    .sort((a, b) => b.messages.at(-1)!.sentAt.localeCompare(a.messages.at(-1)!.sentAt));
  const active = threads.find((t) => t.root.id === selected) ?? threads[0];
  const worker = active && d.employees.find((e) => e.id === active.root.recipientId);
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
  const sendReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!active || !reply.trim()) return;
    if (await d.command("reply_message", { threadId: active.root.id, body: reply.trim() }))
      setReply("");
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_220px]">
      <section className="card-surface p-4">
        <h2 className="text-lg font-bold">Conversations</h2>
        <p className="text-sm text-muted-foreground">Manager and worker chat</p>
        <div className="mt-4 space-y-2">
          {threads.map(({ root, messages }) => {
            const unread = messages.filter((m) => m.recipientId === d.me && !m.readAt).length;
            return (
              <button
                key={root.id}
                type="button"
                onClick={() => {
                  setSelected(root.id);
                  messages
                    .filter((m) => m.recipientId === d.me && !m.readAt)
                    .forEach((m) => void d.command("read_message", { id: m.id }));
                }}
                className={`w-full rounded-2xl p-3 text-left ${active?.root.id === root.id ? "bg-tint-blue" : "bg-muted"}`}
              >
                <span className="flex justify-between gap-2 font-semibold">
                  <span>
                    {d.employees.find((e) => e.id === root.recipientId)?.name ?? "Employee"}
                  </span>
                  {unread > 0 && (
                    <span className="rounded-full bg-primary px-2 text-xs text-white">
                      {unread}
                    </span>
                  )}
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {messages.at(-1)?.body}
                </span>
              </button>
            );
          })}
          {!threads.length && (
            <p className="text-sm text-muted-foreground">No conversations yet.</p>
          )}
        </div>
      </section>
      <section className="card-surface flex min-h-[420px] flex-col p-4">
        {active ? (
          <>
            <div className="border-b pb-3">
              <h2 className="font-bold">{worker?.name ?? "Employee"}</h2>
              <p className="text-xs text-muted-foreground">{active.root.title}</p>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto py-4">
              {active.messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[85%] rounded-2xl p-3 text-sm ${m.senderId === d.me ? "ml-auto bg-primary text-white" : "bg-muted"}`}
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className="mt-1 text-[11px] opacity-70">
                    {new Date(m.sentAt).toLocaleString()}{" "}
                    {m.senderId === d.me && (m.readAt ? "· Read" : "· Sent")}
                  </p>
                </div>
              ))}
            </div>
            <form onSubmit={sendReply} className="flex gap-2">
              <Input
                aria-label="Reply"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                maxLength={2000}
                placeholder="Write a reply…"
              />
              <Button disabled={d.busy || !d.online || !reply.trim()}>Send</Button>
            </form>
          </>
        ) : (
          <p className="m-auto text-sm text-muted-foreground">
            Choose a conversation or start one.
          </p>
        )}
      </section>
      <form onSubmit={send} className="card-surface space-y-3 p-4">
        <h2 className="font-bold">New message</h2>
        <label className="block text-sm">
          Worker
          <select
            required
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl bg-muted px-2"
          >
            <option value="">Choose worker</option>
            {d.employees
              .filter((e) => e.role === "employee")
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </select>
        </label>
        <Input name="title" required maxLength={120} placeholder="Subject" />
        <Textarea name="body" required maxLength={2000} placeholder="Message" />
        <Button className="w-full" disabled={d.busy || !d.online || !recipientId}>
          Start conversation
        </Button>
      </form>
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
