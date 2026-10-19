import { useState } from "react";
import { Search, Users, Pencil, Mail, Phone } from "lucide-react";
import { useAttendance } from "@/lib/app-store";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ThemedSelect } from "../../../shared/ThemedSelect";
import type { Employee } from "../../../shared/attendance";

function EmployeePhoto({ employee }: { employee: Employee }) {
  return (
    <span className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#eee9fe] text-lg font-semibold text-[#6d4aff]">
      {employee.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")}
      {employee.photoUrl && (
        <img
          key={employee.photoUrl}
          src={employee.photoUrl}
          alt={employee.name}
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            e.currentTarget.hidden = true;
          }}
        />
      )}
    </span>
  );
}
export function EmployeeDirectory() {
  const d = useAttendance();
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("active");
  const [role, setRole] = useState("");
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState(false);
  const employee = d.employees.find((e) => e.id === selected);
  const departments = [...new Set(d.employees.map((e) => e.team || "Unassigned"))].sort();
  const filtered = d.employees.filter(
    (e) =>
      (!status || (e.accessStatus || "active") === status) &&
      (!role || e.role === role) &&
      (!department || (e.team || "Unassigned") === department) &&
      `${e.name} ${e.no} ${e.jobTitle || ""} ${e.team}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="space-y-5">
      <section className="project-panel">
        <div className="project-panel-head">
          <div>
            <p className="project-panel-kicker">
              <Users size={16} /> PEOPLE DIRECTORY
            </p>
            <h2>Your employees</h2>
            <p className="project-panel-sub">
              {d.employees.length} people · {departments.length}{" "}
              {departments.length === 1 ? "department" : "departments"}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          {(
            [
              ["active", "Active"],
              ["pending", "Pending approval"],
              ["rejected", "Declined"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={`sl-map-tool ${status === value ? "selected" : ""}`}
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              {label}{" "}
              <span>
                {
                  d.employees.filter((employee) => (employee.accessStatus || "active") === value)
                    .length
                }
              </span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-border bg-muted px-3">
            <Search size={16} />
            <input
              className="w-full bg-transparent py-3 text-sm outline-none"
              aria-label="Search employees"
              placeholder="Find a name, role or employee number"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <ThemedSelect
            aria-label="Filter by department"
            value={department}
            onValueChange={setDepartment}
          >
            <option value="">All departments</option>
            {departments.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </ThemedSelect>
          <ThemedSelect aria-label="Filter by role" value={role} onValueChange={setRole}>
            <option value="">All roles</option>
            <option value="employee">Employees</option>
            <option value="manager">Managers</option>
          </ThemedSelect>
        </div>
      </section>
      <div className="space-y-3">
        {departments
          .filter((group) => filtered.some((e) => (e.team || "Unassigned") === group))
          .map((group) => (
            <section key={group} className="space-y-3">
              <h2 className="font-semibold text-lg">
                {group}{" "}
                <span className="text-sm text-muted-foreground">
                  · {filtered.filter((e) => (e.team || "Unassigned") === group).length} people
                </span>
              </h2>
              {filtered
                .filter((e) => (e.team || "Unassigned") === group)
                .map((e) => (
                  <button
                    key={e.id}
                    className="project-panel flex w-full flex-wrap items-center justify-between gap-4 text-left transition hover:border-[#cfc0fa]"
                    onClick={() => {
                      setSelected(e.id);
                      setEditing(false);
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <EmployeePhoto employee={e} />
                      <div>
                        <h3 className="font-semibold">{e.name}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {e.jobTitle || (e.role === "manager" ? "Manager" : "Employee")}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {e.team || "Unassigned department"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-xs">
                      <span>{e.no}</span>
                      <span className="rounded-full bg-muted px-2 py-1 capitalize">
                        {e.accessStatus || "active"}
                      </span>
                    </div>
                  </button>
                ))}
            </section>
          ))}
      </div>
      {!filtered.length && (
        <p className="project-panel text-sm text-muted-foreground">
          No employees match this search.
        </p>
      )}
      <Dialog
        open={!!employee}
        onOpenChange={(open) => {
          if (!open) setSelected("");
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogTitle>{employee?.name || "Employee"}</DialogTitle>
          <DialogDescription>Employee profile and department</DialogDescription>
          {employee &&
            (editing ? (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const fd = new FormData(event.currentTarget);
                  void d
                    .command("update_employee_profile", {
                      employeeId: employee.id,
                      ...Object.fromEntries(fd),
                    })
                    .then((saved) => {
                      if (saved) setEditing(false);
                    });
                }}
              >
                {(
                  [
                    { name: "name", label: "Full name", value: employee.name, max: 100 },
                    { name: "department", label: "Department", value: employee.team, max: 100 },
                    {
                      name: "jobTitle",
                      label: "Work role",
                      value: employee.jobTitle || "",
                      max: 100,
                    },
                    {
                      name: "photoUrl",
                      label: "Photo URL (HTTPS)",
                      value: employee.photoUrl || "",
                      max: 2000,
                    },
                  ] as const
                ).map((field) => (
                  <label key={field.name} className="block text-sm">
                    {field.label}
                    <input
                      className="mt-2 w-full rounded-xl border border-border bg-muted p-3"
                      name={field.name}
                      defaultValue={field.value}
                      maxLength={field.max}
                      required={field.name === "name"}
                      type={field.name === "photoUrl" ? "url" : "text"}
                    />
                  </label>
                ))}
                <label className="block text-sm">
                  Bio
                  <textarea
                    className="mt-2 min-h-28 w-full rounded-xl border border-border bg-muted p-3"
                    name="bio"
                    defaultValue={employee.bio || ""}
                    maxLength={1000}
                  />
                </label>
                <div className="flex gap-2">
                  <Button disabled={d.busy || !d.online}>Save profile</Button>
                  <Button type="button" variant="soft" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div>
                <div className="mt-2 flex items-center gap-4">
                  <EmployeePhoto employee={employee} />
                  <div>
                    <p className="font-semibold">
                      {employee.jobTitle || (employee.role === "manager" ? "Manager" : "Employee")}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {employee.team || "Unassigned department"} · {employee.no}
                    </p>
                  </div>
                </div>
                <p className="mt-6 whitespace-pre-wrap text-sm leading-relaxed">
                  {employee.bio || "No bio added yet."}
                </p>
                <div className="my-5 grid grid-cols-3 gap-3">
                  {[
                    [
                      "Workdays recorded",
                      new Set(
                        d.events
                          .filter(
                            (event) =>
                              event.employeeId === employee.id && event.type === "clock_in",
                          )
                          .map((event) => event.shiftId),
                      ).size,
                    ],
                    [
                      "Recorded hours",
                      (
                        d.shifts
                          .filter((shift) => shift.employeeId === employee.id)
                          .reduce((sum, shift) => sum + shift.totals.recordedMinutes, 0) / 60
                      ).toFixed(1),
                    ],
                    [
                      "Completed jobs",
                      d.jobs.filter(
                        (job) => job.assignee === employee.id && job.status === "completed",
                      ).length,
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-muted p-3">
                      <b className="text-xl">{value}</b>
                      <small className="mt-1 block text-muted-foreground">{label}</small>
                    </div>
                  ))}
                </div>
                <h3 className="text-sm font-semibold">Assigned work</h3>
                {d.jobs
                  .filter((job) => job.assignee === employee.id)
                  .slice(0, 5)
                  .map((job) => (
                    <div key={job.id} className="my-2 rounded-xl border border-border p-3 text-sm">
                      <b>{job.title}</b>
                      <p className="text-xs text-muted-foreground">
                        {job.date} · {job.status.replaceAll("_", " ")}
                      </p>
                    </div>
                  ))}
                {!d.jobs.some((job) => job.assignee === employee.id) && (
                  <p className="my-3 text-sm text-muted-foreground">No field jobs assigned.</p>
                )}
                <div className="my-5 space-y-2 text-sm text-muted-foreground">
                  {employee.email && (
                    <p className="flex gap-2">
                      <Mail size={16} />
                      {employee.email}
                    </p>
                  )}
                  {(employee.contactPhone || employee.phone) && (
                    <p className="flex gap-2">
                      <Phone size={16} />
                      {employee.contactPhone || employee.phone}
                    </p>
                  )}
                </div>
                {d.accessRole !== "operations" && (
                  <Button variant="soft" onClick={() => setEditing(true)}>
                    <Pencil size={15} />
                    Edit profile
                  </Button>
                )}
              </div>
            ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
