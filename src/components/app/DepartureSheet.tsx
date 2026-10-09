import { useState } from "react";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useDemo, uid } from "@/lib/demo-store";

type Reason = "job" | "personal" | "emergency";

export function DepartureSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const d = useDemo();
  const [reason, setReason] = useState<Reason>("job");
  const [jobId, setJobId] = useState("");
  const [ret, setRet] = useState("");
  const [note, setNote] = useState("");
  const jobs = d.jobs.filter((j) => j.assignee === d.me && j.status !== "completed");
  const needsApproval = reason === "personal";
  const valid = reason !== "job" || !!jobId;

  const submit = () => {
    if (!valid) return;
    if (reason === "job") {
      if (!d.act("start_job", { jobId, note })) return;
      d.update((x) => ({ ...x, jobs: x.jobs.map((j) => (j.id === jobId ? { ...j, status: "in_progress" } : j)) }));
    } else {
      if (!d.act("start_personal", { note: reason === "emergency" ? "Emergency" : note })) return;
      d.update((x) => ({
        ...x,
        requests: [
          {
            id: uid(), employeeId: x.me, kind: reason === "emergency" ? "emergency" : "personal_departure",
            summary: reason === "emergency" ? "Emergency departure" : "Personal departure",
            detail: reason === "emergency" ? undefined : note, expectedReturn: ret || undefined,
            submittedAt: Date.now(), status: "pending", approvalRequired: needsApproval,
          },
          ...x.requests,
        ],
      }));
    }
    onOpenChange(false);
    setNote(""); setRet(""); setJobId("");
  };

  const opt = (r: Reason, label: string, sub: string) => (
    <button
      type="button" role="radio" aria-checked={reason === r} onClick={() => setReason(r)}
      className={`rounded-2xl p-3 text-left transition-colors ${reason === r ? "bg-primary text-primary-foreground" : "bg-muted"}`}
    >
      <span className="block text-sm font-semibold">{label}</span>
      <span className="block text-[11px] opacity-80">{sub}</span>
    </button>
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-[440px] rounded-t-[2rem] px-5 pb-8">
        <DrawerTitle className="pt-4 text-xl font-bold">Leave / Go on a job</DrawerTitle>
        <DrawerDescription>Choose a reason. Your request is recorded separately from your manager's decision.</DrawerDescription>
        <div role="radiogroup" aria-label="Reason" className="mt-5 grid grid-cols-3 gap-2">
          {opt("job", "Assigned job", "Paid work")}
          {opt("personal", "Personal", "Unpaid")}
          {opt("emergency", "Emergency", "No details needed")}
        </div>

        {reason === "job" && (
          <fieldset className="mt-5">
            <legend className="mb-2 text-sm text-muted-foreground">Assigned job (required)</legend>
            {jobs.length === 0 && <p className="text-sm">No assigned jobs today.</p>}
            <div className="space-y-2">
              {jobs.map((j) => (
                <label key={j.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl p-3 ${jobId === j.id ? "bg-primary-soft" : "bg-muted"}`}>
                  <input type="radio" name="job" className="accent-primary" checked={jobId === j.id} onChange={() => setJobId(j.id)} />
                  <span className="min-w-0 text-sm"><b>{j.title}</b><br /><span className="text-muted-foreground">{j.start}–{j.end} · {j.destination}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {reason !== "job" && (
          <label className="mt-5 block text-sm text-muted-foreground">
            Expected return (optional)
            <Input type="time" value={ret} onChange={(e) => setRet(e.target.value)} className="mt-2 h-12 rounded-2xl border-0 bg-muted" />
          </label>
        )}
        {reason !== "emergency" && (
          <label className="mt-4 block text-sm text-muted-foreground">
            Short note (optional)
            <Textarea maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} className="mt-2 rounded-2xl border-0 bg-muted" />
          </label>
        )}

        <p className="mt-4 rounded-2xl bg-tint-cream p-3 text-sm">
          {reason === "job" && "No approval needed — the job is already authorised. Location tracking continues."}
          {reason === "personal" && "Manager approval required. Location tracking pauses until you return."}
          {reason === "emergency" && "Your manager is notified. Location tracking pauses. You don't need to share details."}
        </p>
        <Button variant="hero" size="xl" className="mt-5 w-full" disabled={!valid} onClick={submit}>
          {reason === "job" ? "Start job" : "Leave now"}
        </Button>
      </DrawerContent>
    </Drawer>
  );
}
