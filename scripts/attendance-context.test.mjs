import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";

test("date exceptions create legitimate extra-day expectations; explanations never change attendance", async () => {
  const db = await createLocalDatabase();
  try {
    const owner = randomUUID(),
      worker = randomUUID(),
      other = randomUUID();
    for (const id of [owner, worker, other])
      await db.query("insert into auth.users values($1)", [id]);
    const setup = await runRpc(db, owner, "setup", {
      company: "Context test",
      name: "Owner",
      site: "Office",
      timezone: "Africa/Windhoek",
    });
    const invite = await runRpc(db, owner, "create_employee", {
      name: "Worker",
      no: "C1",
      siteId: setup.snapshot.sites[0].id,
    });
    await runRpc(db, worker, "activate", { employeeNo: "C1", code: invite.activationCode });
    await runRpc(db, other, "setup", {
      company: "Other",
      name: "Other",
      site: "Other",
      timezone: "Africa/Windhoek",
    });
    const company = setup.snapshot.company.id;
    const day = (await db.query("select ($1::date+1)::text as day", [setup.snapshot.today])).rows[0]
      .day;
    const dow = (await db.query("select extract(isodow from $1::date)::integer as n", [day]))
      .rows[0].n;
    const rpc = (user, action, payload = {}) =>
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
        await tx.exec("set local role authenticated");
        return (
          await tx.query("select sl_attendance_context($1,$2::jsonb) as result", [
            action,
            JSON.stringify(payload),
          ])
        ).rows[0].result;
      });
    await db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [owner]);
      await tx.exec("set local role authenticated");
      await tx.query("select sl_punctuality($1,$2::jsonb)", [
        "configure",
        JSON.stringify({
          enabled: true,
          weekdays: [dow === 7 ? 1 : dow + 1],
          employeeIds: [invite.employeeId],
          start: "08:00",
          end: "17:00",
        }),
      ]);
    });
    const refresh = () =>
      db.query(
        "select shiftline_private.refresh_punctuality($1,$2,($2::date+'18:30'::time) at time zone 'Africa/Windhoek')",
        [company, day],
      );
    const exception = {
      id: randomUUID(),
      date: day,
      employeeId: invite.employeeId,
      kind: "hours",
      start: "18:00",
      end: "20:00",
      reason: "Approved exceptional workday",
    };
    await assert.rejects(rpc(worker, "set_exception", exception), /Manager access required/);
    await assert.rejects(rpc(other, "set_exception", exception), /Unknown company employee/);
    await rpc(owner, "set_exception", exception);
    await rpc(owner, "set_exception", exception);
    await refresh();
    let record = (await db.query("select * from sl_punctuality_records")).rows[0];
    assert.equal(record.status, "no_checkin");
    assert.equal(record.exemption, null);
    assert.equal(new Date(record.ends_at).getUTCHours(), 18);
    assert.equal(
      (await db.query("select count(*)::int n from sl_attendance_day_exceptions")).rows[0].n,
      1,
    );
    assert.equal((await rpc(other, "list", { date: day })).issues.length, 0);
    const explanation = {
      id: randomUUID(),
      date: day,
      recordId: record.id,
      description: "Transport disruption reported to manager",
    };
    await assert.rejects(rpc(other, "explain", explanation), /own attendance issue/);
    await rpc(worker, "explain", explanation);
    await rpc(worker, "explain", explanation);
    await assert.rejects(
      rpc(worker, "review", { id: explanation.id, decision: "accepted", reason: "Self review" }),
      /Manager access required/,
    );
    await rpc(owner, "review", {
      id: explanation.id,
      decision: "accepted",
      reason: "Operational explanation reviewed",
      date: day,
    });
    assert.equal((await db.query("select count(*)::int n from sl_events")).rows[0].n, 0);
    assert.equal(
      (await db.query("select status from sl_punctuality_records")).rows[0].status,
      "no_checkin",
    );
    await assert.rejects(
      db.query("update sl_attendance_explanations set description=$1 where id=$2", [
        "Changed",
        explanation.id,
      ]),
      /immutable/,
    );
    await rpc(owner, "set_exception", {
      id: randomUUID(),
      date: day,
      kind: "off",
      reason: "Company closed",
    });
    await refresh();
    record = (await db.query("select * from sl_punctuality_records")).rows[0];
    assert.equal(record.status, "excused");
    await rpc(owner, "set_exception", {
      id: randomUUID(),
      date: day,
      kind: "normal",
      reason: "Closure withdrawn",
    });
    await refresh();
    assert.equal(
      (await db.query("select status from sl_punctuality_records")).rows[0].status,
      "excused",
    ); // normal non-working weekday
    await rpc(owner, "set_exception", {
      ...exception,
      id: randomUUID(),
      reason: "Employee confirmed for exceptional day",
    });
    await refresh();
    assert.equal(
      (await db.query("select status from sl_punctuality_records")).rows[0].status,
      "no_checkin",
    );
    assert.equal(
      (
        await db.query(
          "select has_table_privilege('authenticated','sl_attendance_explanations','select') allowed",
        )
      ).rows[0].allowed,
      false,
    );
  } finally {
    await db.close();
  }
});
