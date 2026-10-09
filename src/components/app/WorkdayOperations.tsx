import { useState, type FormEvent } from "react";
import { CalendarDays, MapPin, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAttendance } from "@/lib/app-store";
import { downloadGrossRun } from "@/lib/payroll-export";

export function CompanyNotices() {
  const d = useAttendance();
  const [kind, setKind] = useState("announcement");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fields = new FormData(form);
    const result = await d.command("create_notice", {
      kind,
      title: String(fields.get("title") || "").trim(),
      body: String(fields.get("body") || "").trim(),
      startsOn: String(fields.get("startsOn") || ""),
      endsOn: String(fields.get("endsOn") || ""),
      requiresAck: fields.get("requiresAck") === "on",
    });
    if (result) form.reset();
  };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form onSubmit={submit} className="card-surface space-y-4 p-5">
        <div className="flex items-center gap-3">
          <CalendarDays className="text-primary" />
          <div>
            <h2 className="text-lg font-bold">Tell the team</h2>
            <p className="text-sm text-muted-foreground">
              Holidays, closures and early departures appear in the employee app.
            </p>
          </div>
        </div>
        <label className="block text-sm font-medium">
          Type
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="mt-2 h-12 w-full rounded-2xl bg-muted px-3"
          >
            <option value="announcement">Announcement</option>
            <option value="holiday">Public holiday</option>
            <option value="closure">Office closure or maintenance</option>
            <option value="early_release">Leave early</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Title
          <Input
            name="title"
            required
            maxLength={120}
            placeholder="e.g. Office maintenance"
            className="mt-2 h-12 rounded-2xl bg-muted"
          />
        </label>
        <label className="block text-sm font-medium">
          Details
          <Textarea
            name="body"
            maxLength={1000}
            placeholder="What should employees do?"
            className="mt-2 rounded-2xl bg-muted"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">
            From
            <Input
              name="startsOn"
              type="date"
              defaultValue={d.today}
              required
              className="mt-2 rounded-2xl bg-muted"
            />
          </label>
          <label className="text-sm font-medium">
            Through
            <Input
              name="endsOn"
              type="date"
              defaultValue={d.today}
              required
              className="mt-2 rounded-2xl bg-muted"
            />
          </label>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input name="requiresAck" type="checkbox" className="h-4 w-4 accent-primary" /> Ask
          employees to acknowledge
        </label>
        <Button variant="hero" size="xl" className="w-full" disabled={d.busy || !d.online}>
          Publish notice
        </Button>
        <p className="text-xs text-muted-foreground">
          A notice informs employees. Adjust affected shifts and pay separately.
        </p>
      </form>
      <section className="card-surface p-5">
        <h2 className="text-lg font-bold">Published notices</h2>
        {!d.notices.length && <p className="mt-3 text-sm text-muted-foreground">No notices yet.</p>}
        <div className="mt-3 space-y-3">
          {d.notices.map((n) => (
            <article key={n.id} className="rounded-2xl bg-tint-blue p-4">
              <p className="text-xs font-semibold uppercase text-primary">
                {n.kind.replaceAll("_", " ")} · {n.startsOn}
                {n.endsOn !== n.startsOn ? `–${n.endsOn}` : ""}
              </p>
              <h3 className="mt-1 font-bold">{n.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
              {n.requiresAck && <p className="mt-2 text-xs">Acknowledgement requested</p>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export function SiteAlerts() {
  const d = useAttendance();
  return (
    <section className="card-surface p-5">
      <div className="flex items-center gap-2">
        <MapPin className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">Site alerts</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Exit and return alerts during active shifts. Coordinates are not stored.
      </p>
      {!d.siteAlerts.length && (
        <p className="mt-4 text-sm text-muted-foreground">No site alerts.</p>
      )}
      <div className="mt-3 space-y-2">
        {d.siteAlerts.slice(0, 10).map((a) => (
          <article key={a.id} className="rounded-2xl bg-tint-cream p-3 text-sm">
            <b>
              {d.employees.find((e) => e.id === a.employeeId)?.name || "Employee"} ·{" "}
              {a.kind === "exit" ? "Left the worksite" : "Returned"}
            </b>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(a.observedAt).toLocaleString()} · {a.distanceM} m from site · ±{a.accuracyM}{" "}
              m
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function GrossPayroll() {
  const d = useAttendance();
  const [employeeId, setEmployeeId] = useState("");
  const [hourly, setHourly] = useState("");
  const [currency, setCurrency] = useState("NAD");
  const [multiplier, setMultiplier] = useState("1.5");
  if (!d.payrollAdmin)
    return (
      <section className="card-surface p-5 text-sm text-muted-foreground">
        A payroll administrator sets pay rates and prepares gross-pay exports.
      </section>
    );
  const setRate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const amount = Number(hourly),
      multiple = Number(multiplier);
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isFinite(multiple) ||
      multiple < 1 ||
      multiple > 3
    )
      return;
    const result = await d.command("set_pay_rate", {
      employeeId,
      effectiveOn: new FormData(e.currentTarget).get("effectiveOn"),
      currency: currency.toUpperCase(),
      hourlyMinor: Math.round(amount * 100),
      overtimeMultiplierBp: Math.round(multiple * 10000),
    });
    if (result) {
      setHourly("");
      setEmployeeId("");
    }
  };
  return (
    <div className="space-y-5">
      <form onSubmit={setRate} className="card-surface space-y-4 p-5">
        <h2 className="text-lg font-bold">Gross pay rates</h2>
        <p className="text-sm text-muted-foreground">
          Enter the agreed hourly rate and overtime multiplier. No tax or payment transfer is
          calculated.
        </p>
        <label className="block text-sm font-medium">
          Employee
          <select
            required
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="mt-2 h-12 w-full rounded-2xl bg-muted px-3"
          >
            <option value="">Choose an employee</option>
            {d.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {e.no}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">
            Currency code
            <Input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              required
              minLength={3}
              maxLength={3}
              className="mt-2 rounded-2xl bg-muted"
            />
          </label>
          <label className="text-sm font-medium">
            Effective from
            <Input
              name="effectiveOn"
              type="date"
              required
              defaultValue={d.today}
              className="mt-2 rounded-2xl bg-muted"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">
            Hourly amount
            <Input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={hourly}
              onChange={(e) => setHourly(e.target.value)}
              className="mt-2 rounded-2xl bg-muted"
            />
          </label>
          <label className="text-sm font-medium">
            Overtime ×
            <Input
              type="number"
              min="1"
              max="3"
              step="0.01"
              required
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
              className="mt-2 rounded-2xl bg-muted"
            />
          </label>
        </div>
        <Button variant="hero" size="xl" className="w-full" disabled={d.busy || !d.online}>
          Save effective rate
        </Button>
        {!!d.payRates.length && (
          <div className="border-t border-border pt-3 text-xs text-muted-foreground">
            {d.payRates.slice(0, 5).map((r) => (
              <p key={r.id}>
                {d.employees.find((e) => e.id === r.employeeId)?.name} · {r.currency}{" "}
                {(r.hourlyMinor / 100).toFixed(2)}/h · {r.effectiveOn}
              </p>
            ))}
          </div>
        )}
      </form>
      <section className="card-surface p-5">
        <h2 className="text-lg font-bold">Gross-pay runs</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a frozen calculation for a locked period, then export it as CSV.
        </p>
        {!d.periods.length && (
          <p className="mt-3 text-sm text-muted-foreground">Lock an approved period first.</p>
        )}
        {d.periods.map((p) => {
          const run = d.grossRuns.find((r) => r.periodId === p.id);
          return (
            <article key={p.id} className="mt-4 rounded-2xl bg-tint-mint p-4">
              <p className="font-semibold">
                {p.start}–{p.end}
              </p>
              {run ? (
                <>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Frozen · {run.rows.length} shift{run.rows.length === 1 ? "" : "s"}
                  </p>
                  <Button
                    variant="pill"
                    className="mt-3 w-full"
                    onClick={() =>
                      downloadGrossRun(run.rows, `shiftline-gross-${p.start}-${p.end}.csv`)
                    }
                  >
                    <Download /> Download gross CSV
                  </Button>
                </>
              ) : (
                <Button
                  variant="pill"
                  className="mt-3 w-full"
                  disabled={d.busy}
                  onClick={() => void d.command("create_gross_run", { periodId: p.id })}
                >
                  Calculate gross pay
                </Button>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
