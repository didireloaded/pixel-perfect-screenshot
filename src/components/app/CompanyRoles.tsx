import { useState } from "react";
import { useAttendance } from "@/lib/app-store";
import { ThemedSelect } from "../../../shared/ThemedSelect";
import { accessRoleLabels } from "../../../shared/permissions";
import type { AccessRole } from "../../../shared/attendance";
export function CompanyRoles() {
  const d = useAttendance();
  const [employeeId, setEmployeeId] = useState("");
  const [role, setRole] = useState<AccessRole>("worker");
  const target = d.employees.find((e) => e.id === employeeId);
  if (d.accessRole && d.accessRole !== "owner") return null;
  return (
    <section className="card-surface p-5 space-y-4">
      <h2 className="font-bold">Company access roles</h2>
      <p className="text-sm text-muted-foreground">
        Owners control company settings and permissions. HR manages employee records and leave.
        Operations manages jobs, tasks and attendance. Workers access their own app.
      </p>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!target) return;
          await d.command("set_employee_access_role", {
            employeeId,
            accessRole: role,
            expectedAccessRole:
              target.accessRole ?? (target.role === "manager" ? "owner" : "worker"),
          });
        }}
      >
        <label className="block text-sm">
          Employee
          <ThemedSelect
            aria-label="Employee access role target"
            value={employeeId}
            onValueChange={(id) => {
              setEmployeeId(id);
              setRole(d.employees.find((e) => e.id === id)?.accessRole ?? "worker");
            }}
            required
          >
            <option value="">Choose an employee</option>
            {d.employees
              .filter((e) => e.activated && (e.accessStatus === "active" || !e.accessStatus))
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </ThemedSelect>
        </label>
        <label className="block text-sm">
          Access role
          <ThemedSelect
            aria-label="Access role"
            value={role}
            onValueChange={(value) => setRole(value as AccessRole)}
          >
            {Object.entries(accessRoleLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </ThemedSelect>
        </label>
        <p className="text-xs text-muted-foreground">
          Promoted employees can sign in to the manager app with their employee number and access
          code. The last owner cannot be removed.
        </p>
        <button className="sl-map-tool selected" disabled={d.busy || !d.online || !target}>
          Save access role
        </button>
      </form>
      <div className="space-y-2">
        {d.employees
          .filter((e) => e.accessStatus === "active" || !e.accessStatus)
          .map((e) => (
            <p key={e.id} className="flex justify-between text-sm">
              <span>{e.name}</span>
              <b>{accessRoleLabels[e.accessRole ?? (e.role === "manager" ? "owner" : "worker")]}</b>
            </p>
          ))}
      </div>
    </section>
  );
}
