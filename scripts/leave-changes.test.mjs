import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";
test("leave changes preserve evidence, refund only on approval, validate replacement and company access", async () => {
  const db = await createLocalDatabase();
  try {
    const owner = randomUUID(),
      worker = randomUUID(),
      other = randomUUID();
    for (const id of [owner, worker, other])
      await db.query("insert into auth.users(id) values($1)", [id]);
    const call = (u, a, p = {}) => runRpc(db, u, a, p);
    const setup = await call(owner, "setup", {
      company: "Leave changes",
      name: "Owner",
      site: "Office",
      timezone: "Africa/Windhoek",
    });
    const invitation = await call(owner, "create_employee", {
      name: "Worker",
      no: "W1",
      siteId: setup.snapshot.sites[0].id,
    });
    await call(worker, "activate", { employeeNo: "W1", code: invitation.activationCode });
    await call(other, "setup", {
      company: "Other",
      name: "Other",
      site: "Other",
      timezone: "Africa/Windhoek",
    });
    const api = (u, a, p = {}) =>
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [u]);
        await tx.exec("set local role authenticated");
        return (
          await tx.query("select public.sl_leave_changes($1,$2::jsonb) result", [
            a,
            JSON.stringify(p),
          ])
        ).rows[0].result;
      });
    const day = "2090-01-02";
    const year = 2090;
    await call(owner, "configure_leave", {
      workingDays: [1, 2, 3, 4, 5, 6, 7],
      minutesPerDay: 480,
    });
    await call(owner, "set_leave_allowance", {
      employeeId: invitation.employeeId,
      year,
      leaveType: "annual",
      minutes: 960,
      reason: "Configured allowance",
    });
    const id = randomUUID();
    await call(worker, "create_leave_request", {
      id,
      summary: "Time off",
      leaveStart: day,
      leaveEnd: day,
      leaveType: "annual",
    });
    await call(owner, "review_request", { id, status: "approved", reason: "Approved" });
    let change = randomUUID();
    await api(worker, "request", {
      id: change,
      requestId: id,
      kind: "amend",
      explanation: "Change dates",
      leaveStart: "2090-01-03",
      leaveEnd: "2090-01-05",
    });
    await assert.rejects(
      api(other, "review", { id: change, status: "approved", reason: "No" }),
      /cannot be reviewed/,
    );
    await assert.rejects(
      api(owner, "review", { id: change, status: "approved", reason: "Yes" }),
      /Insufficient/,
    );
    assert.equal(
      (await db.query("select status from sl_requests where id=$1", [id])).rows[0].status,
      "approved",
    );
    assert.equal((await db.query("select count(*)::int n from sl_leave_reversals")).rows[0].n, 0);
    await api(owner, "review", { id: change, status: "declined", reason: "Not enough balance" });
    change = randomUUID();
    await api(worker, "request", {
      id: change,
      requestId: id,
      kind: "amend",
      explanation: "One day later",
      leaveStart: "2090-01-03",
      leaveEnd: "2090-01-03",
    });
    await api(owner, "review", { id: change, status: "approved", reason: "Agreed" });
    assert.equal(
      (await db.query("select status from sl_requests where id=$1", [id])).rows[0].status,
      "cancelled",
    );
    assert.equal(
      (await db.query("select minutes from sl_leave_charges where request_id=$1", [id])).rows[0]
        .minutes,
      480,
    );
    assert.equal(
      (await db.query("select sum(minutes)::int n from shiftline_private.active_leave_charges"))
        .rows[0].n,
      480,
    );
    assert.equal((await api(other, "list")).changes.length, 0);
    const replacement = (await api(worker, "list")).changes.find(
      (c) => c.id === change,
    ).replacement_id;
    change = randomUUID();
    await api(worker, "request", {
      id: change,
      requestId: replacement,
      kind: "cancel",
      explanation: "No longer needed",
    });
    await api(owner, "review", { id: change, status: "approved", reason: "Agreed" });
    assert.equal(
      (await db.query("select count(*)::int n from shiftline_private.active_leave_charges")).rows[0]
        .n,
      0,
    );
    await assert.rejects(
      api(owner, "review", { id: change, status: "approved", reason: "Again" }),
      /cannot be reviewed/,
    );
    const blocked = randomUUID(),
      existing = randomUUID();
    for (const [rid, day] of [
      [blocked, "2090-02-01"],
      [existing, "2090-02-02"],
    ]) {
      await call(worker, "create_leave_request", {
        id: rid,
        summary: "Next leave",
        leaveStart: day,
        leaveEnd: day,
        leaveType: "annual",
      });
      await call(owner, "review_request", { id: rid, status: "approved", reason: "Approved" });
    }
    const conflict = randomUUID();
    await api(worker, "request", {
      id: conflict,
      requestId: blocked,
      kind: "amend",
      explanation: "Conflicting date",
      leaveStart: "2090-02-02",
      leaveEnd: "2090-02-02",
    });
    await assert.rejects(
      api(worker, "review", { id: conflict, status: "approved", reason: "Self review" }),
      /Owner or HR/,
    );
    await assert.rejects(
      api(owner, "review", { id: conflict, status: "approved", reason: "Overlaps" }),
      /already has approved leave/,
    );
    await api(owner, "review", { id: conflict, status: "declined", reason: "Overlap" });
    await db.query(
      "insert into sl_periods(company_id,start_date,end_date,locked_by,rows) values($1,'2090-02-01','2090-02-28',$2,'[]')",
      [setup.snapshot.company.id, setup.snapshot.me],
    );
    await assert.rejects(
      api(worker, "request", {
        id: randomUUID(),
        requestId: blocked,
        kind: "cancel",
        explanation: "Locked period",
      }),
      /period is locked/,
    );
    assert.equal(
      (await db.query("select status from sl_requests where id=$1", [blocked])).rows[0].status,
      "approved",
    );
    assert.equal(
      (
        await db.query(
          "select has_table_privilege('authenticated','public.sl_leave_changes','SELECT') allowed",
        )
      ).rows[0].allowed,
      false,
    );
  } finally {
    await db.close();
  }
});
