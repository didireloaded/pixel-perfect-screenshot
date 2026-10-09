import { useAttendance } from "@/lib/app-store";
import { RecordForm } from "./RecordForm";
import { Button } from "@/components/ui/button";
import { StatusPill } from "./EmployeeShell";
const BOOL = [
  { value: "false", label: "Off" },
  { value: "true", label: "On" },
];
export function CompanySettings() {
  const d = useAttendance();
  const p = d.policy;
  const flags = [
    ["require_gps_stamp", "Require GPS at clock-in"],
    ["enforce_geofence", "Validate clock-in against site"],
    ["allow_offline_clockin", "Accept offline clock-in automatically"],
    ["require_approval_for_departure", "Review personal departures"],
    ["require_two_level_correction_approval", "Two approvals for time corrections"],
    ["lunch_paid", "Paid lunch"],
  ] as const;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <RecordForm
          title={`Company policy · current version ${p.version}`}
          action="save_policy"
          label="Save a new policy version"
          fields={flags.map(([name, label]) => ({
            name,
            label,
            options: BOOL,
            value: String(p[name]),
          }))}
        />
        <p className="px-2 text-xs text-muted-foreground">
          New versions apply to newly assigned shifts. Existing shifts and approved hours keep their
          policy. Field teams can enable offline clock-in; office teams default to review. Facial
          verification is unavailable.
        </p>
        <section className="card-surface p-5">
          <h2 className="font-bold">Policy history</h2>
          {d.policyHistory.map((p) => (
            <p key={p.version} className="mt-2 text-sm">
              Version {p.version} · {new Date(p.created_at).toLocaleString()} ·{" "}
              {p.version === d.policy.version ? "Current" : "Superseded"}
            </p>
          ))}
        </section>
        {d.payrollAdmin && (
          <RecordForm
            title="Assign a payroll administrator"
            action="set_payroll_role"
            label="Grant payroll and manager access"
            fields={[
              {
                name: "employeeId",
                label: "Activated employee",
                options: d.employees
                  .filter((e) => e.id !== d.me && e.activated && !e.payrollAdmin)
                  .map((e) => ({ value: e.id, label: e.name })),
              },
            ]}
          />
        )}
      </div>
      <div className="space-y-5">
        {d.sites.map((site) => (
          <RecordForm
            key={site.id}
            title={`Geofence · ${site.name}`}
            action="set_geofence"
            extra={{ siteId: site.id }}
            fields={[
              {
                name: "mode",
                label: "Mode",
                value: site.geofenceMode,
                options: [
                  { value: "validate", label: "Validate: require inside fence" },
                  { value: "notify", label: "Notify: record off-site warning" },
                  { value: "auto_suggest", label: "Suggest: employee confirms arrival" },
                ],
              },
              {
                name: "latitude",
                label: "Latitude",
                type: "number",
                value: site.latitude ?? "",
                min: -90,
                max: 90,
              },
              {
                name: "longitude",
                label: "Longitude",
                type: "number",
                value: site.longitude ?? "",
                min: -180,
                max: 180,
              },
              {
                name: "radiusM",
                label: "Radius (metres)",
                type: "number",
                value: site.radiusM,
                min: 100,
                max: 5000,
              },
              {
                name: "maxAccuracyM",
                label: "Maximum uncertainty (metres)",
                type: "number",
                value: site.maxAccuracyM,
                min: 10,
                max: 1000,
              },
            ]}
          />
        ))}
        <section className="card-surface p-5">
          <h2 className="font-bold">Registered devices</h2>
          {!d.devices.length && (
            <p className="mt-3 text-sm text-muted-foreground">No native clients registered yet.</p>
          )}
          {d.devices.map((device) => (
            <div key={device.id} className="mt-3 rounded-2xl bg-muted p-3">
              <p className="text-sm">
                {d.employees.find((e) => e.id === device.employee_id)?.name} · {device.platform} ·{" "}
                {device.client_type}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <StatusPill tone={device.revoked ? "bad" : "ok"}>
                  {device.revoked ? "Revoked" : "Registered"}
                </StatusPill>
                {!device.revoked && (
                  <Button
                    variant="chip"
                    disabled={d.busy}
                    onClick={() => void d.command("revoke_device", { id: device.id })}
                  >
                    Revoke device
                  </Button>
                )}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
export function SetupChecklist() {
  const d = useAttendance();
  if (d.setup.every((s) => s.complete)) return null;
  return (
    <section className="card-surface mb-5 p-5">
      <h2 className="text-lg font-bold">Get your team ready</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Complete setup and record what you have verified.
      </p>
      <ol className="mt-4 grid gap-3 md:grid-cols-2">
        {d.setup.map((step, i) => (
          <li
            key={step.id}
            className={`rounded-2xl p-3 text-sm ${step.complete ? "bg-tint-mint" : "bg-muted"}`}
          >
            <span className="mr-2 font-semibold">{step.complete ? "✓" : `${i + 1}.`}</span>
            {step.label}
          </li>
        ))}
      </ol>
      {d.role === "manager" && (
        <div className="mt-4">
          <RecordForm
            title="Record verification"
            action="verify_setup"
            fields={[
              {
                name: "step",
                label: "Check",
                options: [
                  { value: "real_device_test", label: "Physical device clock-in tested" },
                  { value: "review_first_event", label: "First attendance event reviewed" },
                ],
              },
              { name: "evidence", label: "What you verified (device and date)" },
            ]}
          />
        </div>
      )}
    </section>
  );
}
