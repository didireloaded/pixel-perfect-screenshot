import { useState } from "react";
import { useAttendance } from "@/lib/app-store";
import { ThemedSelect } from "../../../shared/ThemedSelect";
export function CompanyLeave() {
  const d = useAttendance();
  const policy = d.leaveSettings;
  const [days, setDays] = useState<number[]>(policy?.workingDays ?? []);
  const [hours, setHours] = useState(policy ? String(policy.minutesPerDay / 60) : "");
  const [employeeId, setEmployeeId] = useState("");
  const [type, setType] = useState("annual");
  if (d.accessRole && !["owner", "hr"].includes(d.accessRole)) return null;
  return (
    <section className="project-panel space-y-5">
      <h2 className="text-lg font-semibold">Leave policy & balances</h2>
      <p className="text-sm text-muted-foreground">
        Enter your company policy. Shiftline does not assume legal entitlements. Approved leave uses
        the working days and hours configured at approval; later policy changes preserve earlier
        deductions. Public holidays are not excluded automatically.
      </p>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await d.command("configure_leave", {
            workingDays: days,
            minutesPerDay: Math.round(Number(hours) * 60),
          });
        }}
      >
        <fieldset className="flex flex-wrap gap-3">
          <legend className="text-sm mb-2">Company working days</legend>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name, index) => (
            <label key={name} className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={days.includes(index + 1)}
                onChange={(event) =>
                  setDays((current) =>
                    event.target.checked
                      ? [...current, index + 1]
                      : current.filter((day) => day !== index + 1),
                  )
                }
              />
              {name}
            </label>
          ))}
        </fieldset>
        <label className="block text-sm">
          Hours per full working day
          <input
            aria-label="Hours per working day"
            className="block rounded-xl border bg-muted p-3 mt-2"
            type="number"
            min="0.25"
            max="24"
            step="0.25"
            required
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </label>
        <button className="sl-map-tool" disabled={d.busy || !d.online || !days.length}>
          Save leave policy
        </button>
      </form>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          await d.command("set_leave_allowance", {
            employeeId,
            leaveType: type,
            year: Number(form.get("year")),
            minutes: Math.round(Number(form.get("hours")) * 60),
            reason: String(form.get("reason")),
          });
        }}
      >
        <h3 className="font-semibold sm:col-span-2">Set an employee allowance</h3>
        <label className="text-sm">
          Employee
          <ThemedSelect
            aria-label="Leave allowance employee"
            value={employeeId}
            onValueChange={setEmployeeId}
            required
          >
            <option value="">Choose employee</option>
            {d.employees
              .filter((e) => e.accessStatus === "active" || !e.accessStatus)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </ThemedSelect>
        </label>
        <label className="text-sm">
          Leave type
          <ThemedSelect value={type} onValueChange={setType}>
            <option value="annual">Annual</option>
            <option value="sick">Sick</option>
            <option value="personal">Personal</option>
          </ThemedSelect>
        </label>
        <label className="text-sm">
          Calendar year
          <input
            className="block w-full rounded-xl border bg-muted p-3 mt-2"
            name="year"
            type="number"
            min="2000"
            max="2200"
            defaultValue={Number(d.today.slice(0, 4))}
            required
          />
        </label>
        <label className="text-sm">
          Total allowance in hours
          <input
            className="block w-full rounded-xl border bg-muted p-3 mt-2"
            name="hours"
            type="number"
            min="0"
            max="8784"
            step="0.25"
            required
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Reason or policy reference
          <input
            className="block w-full rounded-xl border bg-muted p-3 mt-2"
            name="reason"
            maxLength={500}
            required
          />
        </label>
        <button className="sl-map-tool" disabled={d.busy || !d.online || !employeeId}>
          Save allowance
        </button>
      </form>
      <p className="text-xs text-muted-foreground">
        Balances are in hours. Pending requests do not deduct hours. Unpaid leave does not consume
        an allowance. Unclassified older requests are not charged. Requests spanning years use each
        year’s allowance.
      </p>
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-2">Employee</th>
              <th>Year / type</th>
              <th>Allowance</th>
              <th>Used</th>
              <th>Remaining</th>
            </tr>
          </thead>
          <tbody>
            {(d.leaveBalances ?? []).map((balance) => (
              <tr
                key={`${balance.employeeId}-${balance.year}-${balance.leaveType}`}
                className="border-t"
              >
                <td className="p-2">
                  {d.employees.find((e) => e.id === balance.employeeId)?.name}
                </td>
                <td>
                  {balance.year} · {balance.leaveType}
                </td>
                <td>{balance.allowanceMinutes / 60} h</td>
                <td>{balance.usedMinutes / 60} h</td>
                <td>{balance.remainingMinutes / 60} h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!d.leaveBalances?.length && <p className="text-sm">No allowances configured.</p>}
    </section>
  );
}
