import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./local-api.mjs";

test("notices, on-duty site alerts and frozen gross pay stay company-scoped", async () => {
  const db = await createLocalDatabase();
  const manager = randomUUID(),
    employee = randomUUID(),
    outsider = randomUUID();
  try {
    for (const id of [manager, employee, outsider])
      await db.query("insert into auth.users values($1)", [id]);
    const call = (user, action, data = {}) => runRpc(db, user, action, data);
    const setup = await call(manager, "setup", {
      company: "Workflow Tests",
      name: "Manager",
      site: "Yard",
      timezone: "Africa/Windhoek",
    });
    const siteId = setup.snapshot.sites[0].id,
      day = setup.snapshot.today;
    const invite = await call(manager, "create_employee", { name: "Worker", no: "W-01", siteId });
    await call(employee, "activate", { employeeNo: "W-01", code: invite.activationCode });
    const other = await call(outsider, "setup", {
      company: "Other Company",
      name: "Other Manager",
      site: "Other Site",
      timezone: "Africa/Windhoek",
    });
    await assert.rejects(
      call(employee, "create_notice", {
        kind: "holiday",
        title: "Fake",
        startsOn: day,
        endsOn: day,
      }),
      /Manager access/,
    );
    const posted = await call(manager, "create_notice", {
      kind: "closure",
      title: "Maintenance",
      body: "Do not report to the yard",
      startsOn: day,
      endsOn: day,
      requiresAck: true,
    });
    const notice = posted.snapshot.notices[0];
    assert.equal(notice.title, "Maintenance");
    await assert.rejects(call(outsider, "ack_notice", { id: notice.id }), /Unknown notice/);
    const acknowledged = await call(employee, "ack_notice", { id: notice.id });
    assert.equal(acknowledged.snapshot.notices[0].acknowledged, true);
    assert.equal(other.snapshot.notices.length, 0);
    await call(manager, "set_geofence", {
      siteId,
      mode: "notify",
      latitude: -22.56,
      longitude: 17.08,
      radiusM: 150,
      maxAccuracyM: 100,
    });
    const assigned = await call(manager, "assign_shift", {
      employeeId: invite.employeeId,
      siteId,
      date: day,
      start: "00:00",
      end: "23:59",
      lunch: "12:00",
      lunchMinutes: 60,
      regularMinutes: 60,
    });
    const shiftId = assigned.snapshot.shifts.find((s) => s.employeeId === invite.employeeId).id;
    await db.query(
      "insert into public.sl_events(id,company_id,employee_id,shift_id,type,captured_at) values($1,$2,$3,$4,'clock_in',now()-interval '1 minute')",
      [randomUUID(), setup.snapshot.company.id, invite.employeeId, shiftId],
    );
    const outside = { shiftId, latitude: -22.5, longitude: 17.08, accuracyM: 20, source: "web" };
    const exit = await call(employee, "report_position", outside);
    assert.equal(exit.status, "exit");
    const repeated = await call(employee, "report_position", outside);
    assert.equal(repeated.status, "inside_or_unchanged");
    const returned = await call(employee, "report_position", {
      shiftId,
      latitude: -22.56,
      longitude: 17.08,
      accuracyM: 20,
      source: "web",
    });
    assert.equal(returned.status, "return");
    const managerSnap = await call(manager, null);
    assert.deepEqual(
      managerSnap.siteAlerts.map((a) => a.kind),
      ["return", "exit"],
    );
    assert.equal("latitude" in managerSnap.siteAlerts[0], false);
    assert.equal((await call(outsider, null)).siteAlerts.length, 0);
    await assert.rejects(
      call(employee, "issue_kiosk_code", { employeeId: invite.employeeId }),
      /Manager access/,
    );
    const kiosk = await call(manager, "issue_kiosk_code", { employeeId: invite.employeeId });
    assert.equal(kiosk.kioskCode.length, 32);
    assert.equal(JSON.stringify(kiosk.snapshot).includes(kiosk.kioskCode), false);
    const kioskIntent = { id: randomUUID(), employeeNo: "W-01", type: "start_lunch" };
    assert.equal(
      (await call(manager, "kiosk_clock", { ...kioskIntent, code: "wrong" })).status,
      "invalid_code",
    );
    assert.equal(
      (await call(outsider, "kiosk_clock", { ...kioskIntent, code: kiosk.kioskCode })).status,
      "invalid_code",
    );
    assert.equal(
      (await call(manager, "kiosk_clock", { ...kioskIntent, code: kiosk.kioskCode })).status,
      "synced",
    );
    await call(manager, "revoke_kiosk_code", { employeeId: invite.employeeId });
    assert.equal(
      (
        await call(manager, "kiosk_clock", {
          id: randomUUID(),
          employeeNo: "W-01",
          code: kiosk.kioskCode,
          type: "end_lunch",
        })
      ).status,
      "invalid_code",
    );
    await call(manager, "set_pay_rate", {
      employeeId: invite.employeeId,
      effectiveOn: day,
      currency: "NAD",
      hourlyMinor: 12500,
      overtimeMultiplierBp: 15000,
    });
    const calc = await db.query(
      "insert into public.sl_calculations(company_id,shift_id,version,policy_version,calculation,approved_by) values($1,$2,1,1,$3::jsonb,$4) returning id",
      [
        setup.snapshot.company.id,
        shiftId,
        JSON.stringify({ regularSeconds: 3600, overtimeSecondsApproved: 1800 }),
        setup.snapshot.employees.find((e) => e.role === "manager").id,
      ],
    );
    await db.query(
      "update public.sl_timesheets set status='approved',calculation_id=$1 where shift_id=$2",
      [calc.rows[0].id, shiftId],
    );
    const period = await db.query(
      "insert into public.sl_periods(company_id,start_date,end_date,locked_by,rows) values($1,$2,$2,$3,'[]'::jsonb) returning id",
      [
        setup.snapshot.company.id,
        day,
        setup.snapshot.employees.find((e) => e.role === "manager").id,
      ],
    );
    const run = await call(manager, "create_gross_run", { periodId: period.rows[0].id });
    assert.equal(run.rows[0].gross_minor, 21875);
    const exported = await call(manager, "export_gross_run", { periodId: period.rows[0].id });
    assert.deepEqual(exported.rows, run.rows);
    await assert.rejects(
      call(employee, "create_gross_run", { periodId: period.rows[0].id }),
      /Manager access/,
    );
    await assert.rejects(
      call(outsider, "export_gross_run", { periodId: period.rows[0].id }),
      /Lock the payroll period/,
    );
    await assert.rejects(
      db.query("delete from public.sl_gross_runs where id=$1", [run.grossRunId]),
      /Append-only/,
    );
  } finally {
    await db.close();
  }
});
