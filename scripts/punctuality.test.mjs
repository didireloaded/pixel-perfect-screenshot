import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";

async function fixture(count = 1) {
  const db = await createLocalDatabase();
  const owner = randomUUID(),
    other = randomUUID();
  for (const id of [owner, other]) await db.query("insert into auth.users values($1)", [id]);
  const setup = await runRpc(db, owner, "setup", {
    company: "Punctuality test",
    name: "Owner",
    site: "Office",
    timezone: "Africa/Windhoek",
  });
  await runRpc(db, other, "setup", {
    company: "Other",
    name: "Other",
    site: "Office",
    timezone: "Africa/Windhoek",
  });
  const workers = [];
  for (let i = 0; i < count; i++) {
    const user = randomUUID();
    await db.query("insert into auth.users values($1)", [user]);
    const invite = await runRpc(db, owner, "create_employee", {
      name: `Worker ${i}`,
      no: `P${i}`,
      siteId: setup.snapshot.sites[0].id,
    });
    await runRpc(db, user, "activate", { employeeNo: `P${i}`, code: invite.activationCode });
    workers.push({ user, id: invite.employeeId });
  }
  const company = setup.snapshot.company.id,
    day = setup.snapshot.today;
  const policy = async (overrides = {}) => {
    const p = {
      enabled: true,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      employeeIds: workers.map((w) => w.id),
      start: "08:00",
      end: "17:00",
      ...overrides,
    };
    await db.query(
      "insert into sl_punctuality_policies(company_id,created_by,starts_on,enabled,weekdays,start_time,end_time,employee_ids) values($1,$2,$3,$4,$5,$6,$7,$8)",
      [company, setup.snapshot.me, day, p.enabled, p.weekdays, p.start, p.end, p.employeeIds],
    );
    return p;
  };
  const refresh = (time) =>
    db.query(
      "select shiftline_private.refresh_punctuality($1,$2,($2::date+$3::time) at time zone 'Africa/Windhoek')",
      [company, day, time],
    );
  const api = (user, action = "list", payload = {}) =>
    db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
      await tx.exec("set local role authenticated");
      return (
        await tx.query("select sl_punctuality($1,$2::jsonb) as result", [
          action,
          JSON.stringify(payload),
        ])
      ).rows[0].result;
    });
  const clock = async (worker, time, shiftDay = day, finishDate = shiftDay, end = "17:00") => {
    const shift = randomUUID(),
      event = randomUUID();
    await db.query(
      "insert into sl_shifts(id,company_id,employee_id,site_id,date,finish_date,start_time,end_time,lunch_time,lunch_minutes,policy_version) values($1,$2,$3,$4,$5,$6,$8,$7,$8,0,(select current_policy_version from sl_companies where id=$2))",
      [
        shift,
        company,
        worker.id,
        setup.snapshot.sites[0].id,
        shiftDay,
        finishDate,
        end,
        shiftDay === day ? "07:00" : "23:00",
      ],
    );
    await db.query(
      "insert into sl_events(id,company_id,employee_id,shift_id,type,captured_at) values($1,$2,$3,$4,'clock_in',($5::date+$6::time) at time zone 'Africa/Windhoek')",
      [event, company, worker.id, shift, shiftDay, time],
    );
    return { shift, event };
  };
  return { db, owner, other, workers, company, day, policy, refresh, api, clock };
}

test("records exact 5, 10 and 20 minute arrivals; reminders are bounded and idempotent", async () => {
  const f = await fixture(4);
  try {
    await f.policy();
    for (let i = 0; i < 3; i++) await f.clock(f.workers[i], ["08:05", "08:10", "08:20"][i]);
    await f.refresh("08:04:59");
    assert.equal(
      (
        await f.db.query(
          "select count(*)::int n from sl_notifications where source like 'punctuality:%'",
        )
      ).rows[0].n,
      0,
    );
    await f.refresh("08:05");
    await f.refresh("08:05");
    assert.equal(
      (
        await f.db.query(
          "select count(*)::int n from sl_notifications where source like 'punctuality:%'",
        )
      ).rows[0].n,
      1,
    );
    await f.refresh("08:20");
    await f.refresh("08:21");
    assert.equal(
      (
        await f.db.query(
          "select count(*)::int n from sl_notifications where source like 'punctuality:%'",
        )
      ).rows[0].n,
      2,
    );
    const records = (
      await f.db.query("select employee_id,late_seconds,status from sl_punctuality_records")
    ).rows;
    assert.deepEqual(
      f.workers.slice(0, 3).map((w) => records.find((r) => r.employee_id === w.id).late_seconds),
      [300, 600, 1200],
    );
    assert.equal(records.find((r) => r.employee_id === f.workers[3].id).status, "no_checkin");
    const prior = (
      await f.db.query(
        "select source from sl_notifications where source like 'punctuality:%' limit 1",
      )
    ).rows[0].source;
    await f.clock(f.workers[3], "08:25");
    assert.equal(
      (
        await f.db.query("select shiftline_private.punctuality_notification_current($1) ok", [
          prior,
        ])
      ).rows[0].ok,
      false,
    );
    await f.refresh("08:26");
    assert.equal(
      (
        await f.db.query("select late_seconds from sl_punctuality_records where employee_id=$1", [
          f.workers[3].id,
        ])
      ).rows[0].late_seconds,
      1500,
    );
    await f.refresh("17:30");
    assert.equal(
      (
        await f.db.query(
          "select count(*)::int n from sl_notifications where source like 'punctuality:%'",
        )
      ).rows[0].n,
      2,
    );
  } finally {
    await f.db.close();
  }
});

test("company configuration and histories enforce tenant and worker boundaries", async () => {
  const f = await fixture(2);
  try {
    const p = await f.policy();
    await f.refresh("08:30");
    const own = await f.api(f.workers[0].user);
    assert.equal(own.records.length, 1);
    assert.equal(own.policy, undefined);
    assert.ok(own.records.every((r) => r.employeeId === f.workers[0].id));
    assert.equal((await f.api(f.other)).records.length, 0);
    await assert.rejects(f.api(f.workers[0].user, "configure", p), /Owner access required/);
    await assert.rejects(f.api(f.other, "configure", p), /valid company/);
    const before = (await f.db.query("select expected_at from sl_punctuality_records")).rows;
    const saved = await f.api(f.owner, "configure", { ...p, start: "09:00" });
    assert.ok(saved.policy.startsOn > f.day);
    assert.deepEqual(
      (await f.db.query("select expected_at from sl_punctuality_records")).rows,
      before,
    );
    assert.equal(
      (
        await f.db.query(
          "select has_table_privilege('authenticated','sl_punctuality_records','select') allowed",
        )
      ).rows[0].allowed,
      false,
    );
  } finally {
    await f.db.close();
  }
});

test("approved leave, partial leave and overnight work do not produce false late arrivals", async () => {
  const f = await fixture(3);
  try {
    await f.policy();
    await f.db.query(
      "insert into sl_requests(company_id,employee_id,kind,summary,status,leave_start,leave_end) values($1,$2,'leave','Approved leave','approved',$3,$3)",
      [f.company, f.workers[0].id, f.day],
    );
    await f.db.query(
      "insert into sl_requests(company_id,employee_id,kind,summary,status,leave_start,leave_end,leave_start_time,leave_end_time) values($1,$2,'leave','Approved hourly leave','approved',$3,$3,'08:00','10:00')",
      [f.company, f.workers[1].id, f.day],
    );
    const yesterday = (await f.db.query("select ($1::date-1)::text as day", [f.day])).rows[0].day;
    await f.clock(f.workers[2], "23:00", yesterday, f.day, "06:59");
    // An overnight shift ending before normal start does not exempt the new day.
    await f.refresh("08:06");
    assert.equal(
      (
        await f.db.query("select status from sl_punctuality_records where employee_id=$1", [
          f.workers[2].id,
        ])
      ).rows[0].status,
      "no_checkin",
    );
    await f.db.query("update sl_shifts set end_time='08:30' where employee_id=$1", [
      f.workers[2].id,
    ]);
    await f.refresh("08:07");
    const rows = (
      await f.db.query("select employee_id,status,expected_at from sl_punctuality_records")
    ).rows;
    assert.equal(rows.find((r) => r.employee_id === f.workers[0].id).status, "excused");
    assert.equal(rows.find((r) => r.employee_id === f.workers[1].id).status, "expected");
    assert.equal(rows.find((r) => r.employee_id === f.workers[2].id).status, "excused");
    await f.clock(f.workers[1], "10:05");
    await f.refresh("10:06");
    assert.equal(
      (
        await f.db.query("select late_seconds from sl_punctuality_records where employee_id=$1", [
          f.workers[1].id,
        ])
      ).rows[0].late_seconds,
      300,
    );
  } finally {
    await f.db.close();
  }
});

test("unconfigured companies and non-working days generate no records or reminders", async () => {
  const f = await fixture();
  try {
    await f.refresh("08:30");
    assert.equal(
      (await f.db.query("select count(*)::int n from sl_punctuality_records")).rows[0].n,
      0,
    );
    const dow = (await f.db.query("select extract(isodow from $1::date)::int n", [f.day])).rows[0]
      .n;
    await f.policy({ weekdays: [dow === 7 ? 1 : dow + 1] });
    await f.refresh("08:30");
    assert.equal(
      (await f.db.query("select count(*)::int n from sl_punctuality_records")).rows[0].n,
      0,
    );
    await f.policy();
    await f.refresh("08:25");
    await f.refresh("17:30");
    const alerts = (
      await f.db.query("select source from sl_notifications where source like 'punctuality:%'")
    ).rows;
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].source, /:20:/);
  } finally {
    await f.db.close();
  }
});

test("approved clock-in correction updates lateness while keeping original evidence", async () => {
  const f = await fixture();
  try {
    await f.policy();
    await runRpc(f.db, f.owner, "save_policy", { require_two_level_correction_approval: false });
    const worker = f.workers[0];
    const event = await f.clock(worker, "08:20");
    await f.refresh("08:30");
    const replacementAt = (
      await f.db.query("select ($1::date+'08:05'::time) at time zone 'Africa/Windhoek' as at", [
        f.day,
      ])
    ).rows[0].at;
    const request = await runRpc(f.db, worker.user, "request_correction", {
      shiftId: event.shift,
      eventId: event.event,
      replacementAt,
      reason: "Verified device time correction",
    });
    const correction = request.snapshot.corrections.find((c) => c.event_id === event.event);
    await runRpc(f.db, f.owner, "review_correction", {
      id: correction.id,
      decision: "approved",
      reason: "Confirmed original attendance evidence",
    });
    await f.refresh("08:31");
    const r = (await f.db.query("select * from sl_punctuality_records")).rows[0];
    assert.equal(r.late_seconds, 300);
    assert.notEqual(String(r.clock_in_at), String(r.original_clock_in_at));
    assert.equal(
      String(
        (await f.db.query("select captured_at from sl_events where id=$1", [event.event])).rows[0]
          .captured_at,
      ),
      String(r.original_clock_in_at),
    );
  } finally {
    await f.db.close();
  }
});
