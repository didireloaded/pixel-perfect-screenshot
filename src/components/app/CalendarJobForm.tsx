import { useState, type FormEvent } from "react";
import { useAttendance } from "@/lib/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
export function CalendarJobForm({ date, onSaved }: { date: string; onSaved: () => void }) {
  const d = useAttendance();
  const [id] = useState(() => crypto.randomUUID());
  const [selected, setSelected] = useState<string[]>([]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    if (await d.command("create_calendar_job", { ...fields, id, employeeIds: selected })) onSaved();
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm">
        Date
        <Input name="date" type="date" defaultValue={date} required />
      </label>
      <label className="block text-sm">
        Job title
        <Input name="title" maxLength={100} required />
      </label>
      <label className="block text-sm">
        Job details
        <Textarea name="details" maxLength={4000} required placeholder="What needs to be done?" />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Assigned employees (optional)</legend>
        <p className="text-xs text-muted-foreground">
          Everyone can see this job. Select people only when specific employees are needed.
        </p>
        {d.employees
          .filter((e) => e.role === "employee" && (!e.accessStatus || e.accessStatus === "active"))
          .map((e) => (
            <label className="flex gap-2 text-sm" key={e.id}>
              <input
                type="checkbox"
                checked={selected.includes(e.id)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked ? [...current, e.id] : current.filter((id) => id !== e.id),
                  )
                }
              />
              {e.name}
            </label>
          ))}
      </fieldset>
      <Button className="w-full" disabled={d.busy || !d.online}>
        {d.busy ? "Saving…" : "Add job"}
      </Button>
    </form>
  );
}
