import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAttendance, type CommandResult } from "@/lib/app-store";
export interface Field {
  name: string;
  label: string;
  type?: string;
  value?: string | number;
  options?: { value: string; label: string }[];
  optional?: boolean;
  min?: number;
  max?: number;
  step?: number | string;
}
export function RecordForm({
  title,
  action,
  fields,
  label = "Save",
  extra = {},
  onSaved,
}: {
  title: string;
  action: string;
  fields: Field[];
  label?: string;
  extra?: Record<string, unknown>;
  onSaved?: (result: CommandResult) => void;
}) {
  const d = useAttendance();
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const element = e.currentTarget;
    const fd = new FormData(element);
    const payload: Record<string, unknown> = { ...extra };
    for (const f of fields)
      payload[f.name] = f.type === "number" ? Number(fd.get(f.name)) : String(fd.get(f.name) || "");
    const result = await d.command(action, payload);
    if (result) {
      element.reset();
      onSaved?.(result);
    }
  };
  return (
    <form onSubmit={submit} className="card-surface space-y-4 p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.name} className="block text-sm font-medium">
            {f.label}
            {f.options ? (
              <select
                name={f.name}
                required={!f.optional}
                defaultValue={f.value}
                className="mt-2 h-12 w-full rounded-2xl bg-muted px-3"
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                name={f.name}
                type={f.type || "text"}
                required={!f.optional}
                defaultValue={f.value}
                step={f.type === "number" ? f.step || "any" : undefined}
                min={f.min}
                max={f.max}
                maxLength={f.name === "detail" || f.name === "instructions" ? 1000 : 200}
                className="mt-2 h-12 rounded-2xl bg-muted"
              />
            )}
          </label>
        ))}
      </div>
      <Button variant="hero" size="xl" disabled={d.busy || !d.online} className="w-full">
        {d.busy ? "Saving…" : label}
      </Button>
    </form>
  );
}
