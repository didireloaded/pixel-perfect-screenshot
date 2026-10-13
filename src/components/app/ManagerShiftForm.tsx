import { ThemedSelect } from "../../../shared/ThemedSelect";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAttendance } from "@/lib/app-store";
import type { Shift } from "../../../shared/attendance";

const schedule = (shift: Shift) => ({
  employeeId: shift.employeeId,
  siteId: shift.siteId,
  date: shift.date,
  start: shift.start,
  end: shift.end,
  lunch: shift.lunch,
  lunchMinutes: shift.lunchMinutes,
  regularMinutes: shift.regularMinutes,
});

export function ManagerShiftForm({
  date,
  shift,
  onSaved,
  onEditExisting,
}: {
  date: string;
  shift?: Shift | undefined;
  onSaved: () => void;
  onEditExisting: (shift: Shift) => void;
}) {
  const d = useAttendance();
  const employees = d.employees.filter(
    (employee) =>
      employee.role === "employee" &&
      (!employee.accessStatus || employee.accessStatus === "active"),
  );
  const [draft, setDraft] = useState(() =>
    shift
      ? schedule(shift)
      : {
          employeeId: employees[0]?.id ?? "",
          siteId: employees[0]?.siteId ?? d.sites[0]?.id ?? "",
          date,
          start: "08:00",
          end: "17:00",
          lunch: "12:00",
          lunchMinutes: 60,
          regularMinutes: 480,
        },
  );
  const existing =
    !shift &&
    d.shifts.find((item) => item.employeeId === draft.employeeId && item.date === draft.date);
  const locked = d.periods.some((period) => draft.date >= period.start && draft.date <= period.end);
  const recorded =
    shift &&
    (d.events.some((event) => event.shiftId === shift.id) ||
      d.submissions.some((submission) => submission.shift_id === shift.id) ||
      d.corrections.some((correction) => correction.shift_id === shift.id) ||
      d.timesheets.some((sheet) => sheet.shiftId === shift.id && sheet.status !== "open"));
  const disabled =
    d.busy || !d.online || locked || !!recorded || !!existing || !draft.employeeId || !draft.siteId;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    const result = await d.command(shift ? "update_shift" : "assign_shift", {
      ...draft,
      ...(shift ? { shiftId: shift.id, expected: schedule(shift) } : {}),
    });
    if (result) {
      toast.success(shift ? "Shift updated" : "Shift assigned");
      onSaved();
    }
  };
  const timeFields = [
    ["start", "Shift starts"],
    ["end", "Shift ends"],
    ["lunch", "Lunch starts"],
  ] as const;
  const minuteFields = [
    ["lunchMinutes", "Unpaid lunch (minutes)", 0, 120],
    ["regularMinutes", "Regular work (minutes)", 1, 1440],
  ] as const;
  return (
    <form onSubmit={submit} className="card-surface space-y-4 p-5">
      {shift && (
        <p className="text-sm font-medium">
          {d.employees.find((employee) => employee.id === shift.employeeId)?.name} · {shift.date}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {!shift && (
          <>
            <label className="block text-sm font-medium">
              Employee
              <ThemedSelect
                name="employeeId"
                required
                value={draft.employeeId}
                className="mt-2 h-12 w-full rounded-2xl bg-muted px-3"
                onValueChange={(value) => setDraft({ ...draft, employeeId: value })}
              >
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} · {employee.no}
                  </option>
                ))}
              </ThemedSelect>
            </label>
            <label className="block text-sm font-medium">
              Date
              <Input
                type="date"
                required
                value={draft.date}
                className="mt-2 h-12 rounded-2xl bg-muted"
                onChange={(event) => setDraft({ ...draft, date: event.target.value })}
              />
            </label>
          </>
        )}
        <label className="block text-sm font-medium">
          Site
          <ThemedSelect
            name="siteId"
            required
            value={draft.siteId}
            disabled={!!recorded || locked}
            className="mt-2 h-12 w-full rounded-2xl bg-muted px-3"
            onValueChange={(value) => setDraft({ ...draft, siteId: value })}
          >
            {d.sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </ThemedSelect>
        </label>
        {timeFields.map(([key, label]) => (
          <label key={key} className="block text-sm font-medium">
            {label}
            <Input
              type="time"
              required
              value={draft[key]}
              disabled={!!recorded || locked}
              className="mt-2 h-12 rounded-2xl bg-muted"
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
            />
          </label>
        ))}
        {minuteFields.map(([key, label, min, max]) => (
          <label key={key} className="block text-sm font-medium">
            {label}
            <Input
              type="number"
              required
              min={min}
              max={max}
              step="1"
              value={draft[key]}
              disabled={!!recorded || locked}
              className="mt-2 h-12 rounded-2xl bg-muted"
              onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })}
            />
          </label>
        ))}
      </div>
      {existing && (
        <div role="status" className="rounded-2xl bg-muted p-4 text-sm">
          <p>
            This employee already has a shift on {draft.date}, {existing.start}–{existing.end}.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => onEditExisting(existing)}
          >
            Edit existing shift
          </Button>
        </div>
      )}
      {locked && (
        <p role="status" className="text-sm">
          This date belongs to a locked payroll period.
        </p>
      )}
      {recorded && (
        <p role="status" className="text-sm">
          Attendance or a timesheet has been recorded. Use Corrections to review recorded time.
        </p>
      )}
      {!employees.length && (
        <p role="status" className="text-sm">
          Approve an employee in Team before assigning shifts.
        </p>
      )}
      <Button variant="hero" size="xl" disabled={disabled} className="w-full">
        {d.busy ? "Saving…" : shift ? "Save changes" : "Assign shift"}
      </Button>
    </form>
  );
}
