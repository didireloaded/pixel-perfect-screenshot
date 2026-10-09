import { useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAttendance } from "@/lib/app-store";
import type { EventType } from "../../../shared/attendance";

const ACTIONS: { value: EventType; label: string }[] = [
  { value: "clock_in", label: "Clock in" },
  { value: "start_lunch", label: "Start lunch" },
  { value: "end_lunch", label: "End lunch" },
  { value: "start_job", label: "Go on a job" },
  { value: "end_job", label: "Return from job" },
  { value: "start_personal", label: "Personal departure" },
  { value: "end_personal", label: "Return to work" },
  { value: "clock_out", label: "Clock out" },
];
export function KioskDesk() {
  const d = useAttendance();
  const [selected, setSelected] = useState("");
  const [issued, setIssued] = useState<{ number: string; code: string } | null>(null);
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [action, setAction] = useState<EventType>("clock_in");
  const [jobId, setJobId] = useState("");
  const [message, setMessage] = useState("");
  const employee = d.employees.find((e) => e.no === number);
  const jobs = d.jobs.filter(
    (j) => j.assignee === employee?.id && j.date === d.today && j.status === "assigned",
  );
  async function issue() {
    if (!selected) return;
    const result = await d.command("issue_kiosk_code", { employeeId: selected });
    if (result?.kioskCode && result.employeeNumber)
      setIssued({ number: result.employeeNumber, code: result.kioskCode });
  }
  async function revoke() {
    if (!selected) return;
    const result = await d.command("revoke_kiosk_code", { employeeId: selected });
    if (result) {
      setIssued(null);
      setMessage("Serial code revoked.");
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = await d.command("kiosk_clock", {
      id: crypto.randomUUID(),
      employeeNo: number.trim(),
      code: code.trim(),
      type: action,
      ...(action === "start_job" ? { jobId } : {}),
      ...(action === "start_personal" ? { reason: "personal" } : {}),
    });
    if (!result) return;
    setMessage(
      result.status === "invalid_code"
        ? "Number or serial code is invalid, expired or temporarily locked."
        : result.status === "needs_review"
          ? "Saved for manager review. Attendance has not changed yet."
          : `${ACTIONS.find((a) => a.value === action)?.label} recorded.`,
    );
    if (result.status === "synced") setCode("");
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card-surface p-5">
        <div className="flex items-center gap-2">
          <KeyRound className="text-primary" />
          <h2 className="text-lg font-bold">Employee serial codes</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Generate a private code for an activated employee. The new code replaces their previous
          code and is shown only once.
        </p>
        <label className="mt-4 block text-sm font-medium">
          Employee
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setIssued(null);
            }}
            className="mt-2 h-12 w-full rounded-2xl bg-muted px-3"
          >
            <option value="">Choose an employee</option>
            {d.employees
              .filter((e) => e.role === "employee" && e.activated)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.no}
                </option>
              ))}
          </select>
        </label>
        <Button
          variant="hero"
          size="xl"
          className="mt-4 w-full"
          disabled={!selected || d.busy}
          onClick={() => void issue()}
        >
          Generate serial code
        </Button>
        <Button
          variant="outline"
          className="mt-2 w-full rounded-2xl"
          disabled={!selected || d.busy || !d.online}
          onClick={() => void revoke()}
        >
          Revoke serial code
        </Button>
        {issued && (
          <div className="mt-4 rounded-2xl bg-tint-cream p-4">
            <p className="text-xs text-muted-foreground">
              Give this privately to employee {issued.number}
            </p>
            <p className="mt-2 break-all font-mono text-sm font-bold select-all">{issued.code}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Expires in 30 days. Do not post it on a shared screen.
            </p>
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          This is a supervised kiosk on a manager-signed-in device. Keep the manager session
          private.
        </p>
      </section>
      <form onSubmit={submit} className="card-surface space-y-4 p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-primary" />
          <h2 className="text-lg font-bold">Record at kiosk</h2>
        </div>
        <label className="block text-sm font-medium">
          Employee number
          <Input
            required
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            autoComplete="off"
            className="mt-2 h-12 rounded-2xl bg-muted"
          />
        </label>
        <label className="block text-sm font-medium">
          Private serial code
          <Input
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            type="password"
            autoComplete="off"
            maxLength={32}
            className="mt-2 h-12 rounded-2xl bg-muted"
          />
        </label>
        <label className="block text-sm font-medium">
          Action
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as EventType)}
            className="mt-2 h-12 w-full rounded-2xl bg-muted px-3"
          >
            {ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        {action === "start_job" && (
          <label className="block text-sm font-medium">
            Assigned job
            <select
              required
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              className="mt-2 h-12 w-full rounded-2xl bg-muted px-3"
            >
              <option value="">Choose a job</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button
          variant="hero"
          size="xl"
          className="w-full"
          disabled={d.busy || !d.online || (action === "start_job" && !jobId)}
        >
          Record action
        </Button>
        {message && (
          <p role="status" className="rounded-2xl bg-tint-blue p-3 text-sm">
            {message}
          </p>
        )}
      </form>
    </div>
  );
}
