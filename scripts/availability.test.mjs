import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";
test("availability preferences are private, future-only, conflict-safe and never attendance changes", async () => {
  const db = await createLocalDatabase();
  try {
    const owner = randomUUID(),
      worker = randomUUID(),
      other = randomUUID();
    for (const id of [owner, worker, other])
      await db.query("insert into auth.users(id) values($1)", [id]);
    const company = await runRpc(db, owner, "setup", {
      company: "Availability",
      name: "Owner",
      site: "Office",
      timezone: "Africa/Windhoek",
    });
    const invite = await runRpc(db, owner, "create_employee", {
      name: "Worker",
      no: "A1",
      siteId: company.snapshot.sites[0].id,
    });
    await runRpc(db, worker, "activate", { employeeNo: "A1", code: invite.activationCode });
    await runRpc(db, other, "setup", {
      company: "Other",
      name: "Other",
      site: "Office",
      timezone: "Africa/Windhoek",
    });
    const api = (user, action, payload = {}) =>
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
        await tx.exec("set local role authenticated");
        return (
          await tx.query("select public.sl_availability($1,$2::jsonb) result", [
            action,
            JSON.stringify(payload),
          ])
        ).rows[0].result;
      });
    const id = randomUUID();
    let result = await api(worker, "create", {
      id,
      availability: "unavailable",
      startDate: "2090-01-01",
      endDate: "2090-01-01",
      reason: "Appointment",
    });
    assert.equal(result.availability.length, 1);
    assert.equal((await api(owner, "list")).availability.length, 1);
    assert.equal((await api(other, "list")).availability.length, 0);
    await assert.rejects(api(other, "withdraw", { id }), /your own/);
    await assert.rejects(api(owner, "withdraw", { id }), /your own/);
    await assert.rejects(
      api(worker, "create", {
        id: randomUUID(),
        employeeId: company.snapshot.me,
        availability: "available",
        startDate: "2090-02-01",
        endDate: "2090-02-01",
      }),
      /Invalid availability fields/,
    );
    await assert.rejects(
      api(worker, "create", {
        availability: "available",
        startDate: "2090-01-01",
        endDate: "2090-01-01",
        startTime: "10:00",
        endTime: "12:00",
      }),
      /already covers/,
    );
    await assert.rejects(
      api(worker, "create", {
        availability: "available",
        startDate: "2000-01-01",
        endDate: "2000-01-01",
      }),
      /future/,
    );
    await assert.rejects(
      api(worker, "create", {
        availability: "available",
        startDate: "2090-01-02",
        endDate: "2090-01-03",
        startTime: "10:00",
        endTime: "12:00",
      }),
      /both times/,
    );
    result = await api(worker, "withdraw", { id });
    assert.ok(result.availability[0].withdrawn_at);
    assert.equal((await api(worker, "withdraw", { id })).availability.length, 1);
    await api(worker, "create", {
      availability: "available",
      startDate: "2090-01-01",
      endDate: "2090-01-01",
      startTime: "10:00",
      endTime: "12:00",
    });
    await api(worker, "create", {
      availability: "unavailable",
      startDate: "2090-01-01",
      endDate: "2090-01-01",
      startTime: "12:00",
      endTime: "13:00",
    });
    assert.equal((await db.query("select count(*)::int n from sl_requests")).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int n from sl_shifts")).rows[0].n, 0);
    assert.equal(
      (
        await db.query(
          "select has_table_privilege('authenticated','public.sl_employee_availability','SELECT') allowed",
        )
      ).rows[0].allowed,
      false,
    );
    await assert.rejects(
      db.query("delete from sl_employee_availability where id=$1", [id]),
      /history is retained/,
    );
  } finally {
    await db.close();
  }
});
