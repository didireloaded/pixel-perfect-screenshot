import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";
async function fixture() {
  const db = await createLocalDatabase();
  const owner = randomUUID(),
    hr = randomUUID(),
    ops = randomUUID(),
    worker = randomUUID(),
    other = randomUUID();
  for (const id of [owner, hr, ops, worker, other])
    await db.query("insert into auth.users values($1)", [id]);
  const call = (user, action, data = {}) => runRpc(db, user, action, data);
  const setup = await call(owner, "setup", {
    company: "Roles and leave",
    name: "Owner",
    site: "Office",
    timezone: "Africa/Windhoek",
  });
  const ids = {};
  for (const [no, user] of [
    ["HR", hr],
    ["OPS", ops],
    ["WORKER", worker],
  ]) {
    const invitation = await call(owner, "create_employee", {
      name: no,
      no,
      siteId: setup.snapshot.sites[0].id,
    });
    await call(user, "activate", { employeeNo: no, code: invitation.activationCode });
    ids[no] = invitation.employeeId;
  }
  await call(owner, "set_employee_access_role", { employeeId: ids.HR, accessRole: "hr" });
  await call(owner, "set_employee_access_role", { employeeId: ids.OPS, accessRole: "operations" });
  const outside = await call(other, "setup", {
    company: "Other",
    name: "Other owner",
    site: "Other office",
    timezone: "Africa/Windhoek",
  });
  return { db, owner, hr, ops, worker, other, call, setup, ids, outside };
}
test("owner, HR and operations permissions are enforced at RPC, snapshot and credential boundaries", async () => {
  const f = await fixture();
  try {
    const { call, owner, hr, ops, worker, other, setup, ids } = f;
    assert.equal(setup.snapshot.accessRole, "owner");
    await assert.rejects(
      call(owner, "set_employee_access_role", {
        employeeId: setup.snapshot.me,
        accessRole: "worker",
      }),
      /keep an active owner/,
    );
    for (const user of [hr, ops, worker])
      await assert.rejects(
        call(user, "set_employee_access_role", { employeeId: ids.WORKER, accessRole: "owner" }),
        /Owner access/,
      );
    await assert.rejects(
      call(owner, "set_employee_access_role", {
        employeeId: f.outside.snapshot.me,
        accessRole: "hr",
      }),
      /active employee/,
    );
    await assert.rejects(
      call(ops, "update_employee_profile", { employeeId: ids.WORKER, name: "Changed" }),
      /role cannot/,
    );
    await call(hr, "update_employee_profile", {
      employeeId: ids.WORKER,
      name: "Worker updated",
      department: "Crew",
      jobTitle: "Technician",
    });
    assert.equal(
      (await call(owner, null)).employees.find((e) => e.id === ids.WORKER).name,
      "Worker updated",
    );
    const job = {
      id: randomUUID(),
      date: setup.snapshot.today,
      title: "Load equipment",
      details: "Confirm equipment",
      employeeIds: [],
    };
    await call(ops, "create_calendar_job", job);
    await assert.rejects(
      call(hr, "create_calendar_job", { ...job, id: randomUUID() }),
      /role cannot/,
    );
    for (const action of [
      "save_policy",
      "set_checkin_cutoff",
      "set_payroll_role",
      "lock_period",
      "set_pay_rate",
      "create_gross_run",
      "export_period",
    ])
      await assert.rejects(call(ops, action, {}), /role cannot|Owner access/);
    const request = {
      id: randomUUID(),
      summary: "Private leave",
      detail: "Sensitive explanation",
      leaveStart: "2027-01-04",
      leaveEnd: "2027-01-04",
      leaveType: "annual",
    };
    await call(worker, "create_leave_request", request);
    assert.equal(
      (await call(hr, null)).requests.some((r) => r.id === request.id),
      true,
    );
    assert.equal(
      (await call(ops, null)).requests.some((r) => r.id === request.id),
      false,
    );
    assert.equal((await call(other, null)).requests.length, 0);
    await assert.rejects(
      call(ops, "review_request", { id: request.id, status: "approved", reason: "Not HR" }),
      /role cannot/,
    );
    await f.db.query("update sl_employees set login_method='code' where id=$1", [ids.WORKER]);
    const codeTarget = (user, target = ids.WORKER) =>
      f.db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
        await tx.exec("set local role authenticated");
        return tx.query("select public.sl_worker_access_target($1)", [target]);
      });
    await assert.rejects(codeTarget(ops), /Manager access/);
    await codeTarget(hr);
    await f.db.query(
      "update sl_employees set login_method='code',phone='+264811234567' where id=$1",
      [ids.OPS],
    );
    await assert.rejects(codeTarget(hr, ids.OPS), /unavailable/);
    await codeTarget(owner, ids.OPS);
    assert.deepEqual((await call(hr, null)).sitePresence, []);
    assert.equal((await call(ops, null)).company.registrationCode, undefined);
    await call(hr, "configure_leave", { workingDays: [1, 2, 3, 4, 5, 6, 7], minutesPerDay: 480 });
    await call(hr, "set_leave_allowance", {
      employeeId: ids.WORKER,
      year: 2027,
      leaveType: "annual",
      minutes: 480,
      reason: "Company allowance",
    });
    await call(hr, "review_request", {
      id: request.id,
      status: "approved",
      reason: "Private review reason",
    });
    const approved = (await call(ops, null)).requests.find((r) => r.id === request.id);
    assert.equal(approved.summary, "Approved leave");
    assert.equal(approved.detail, undefined);
    assert.equal(approved.reason, undefined);
    assert.equal(approved.leaveType, undefined);
    assert.equal(
      (await call(worker, null)).requests.find((r) => r.id === request.id).detail,
      "Sensitive explanation",
    );
  } finally {
    await f.db.close();
  }
});
test("company leave balances charge approved working days once and preserve prior policy calculations", async () => {
  const f = await fixture();
  try {
    const { call, hr, ops, worker, ids } = f;
    const legacy = {
      id: randomUUID(),
      summary: "Older leave request",
      leaveStart: "2027-04-05",
      leaveEnd: "2027-04-05",
    };
    await call(worker, "create_leave_request", legacy);
    await assert.rejects(
      call(ops, "configure_leave", { workingDays: [1, 2, 3, 4, 5], minutesPerDay: 480 }),
      /role cannot/,
    );
    await call(hr, "configure_leave", { workingDays: [1, 2, 3, 4, 5], minutesPerDay: 480 });
    await assert.rejects(
      call(hr, "review_request", { id: legacy.id, status: "approved", reason: "Unclassified" }),
      /Classify/,
    );
    await call(hr, "classify_leave_request", { id: legacy.id, leaveType: "unpaid" });
    await call(hr, "review_request", {
      id: legacy.id,
      status: "approved",
      reason: "Confirmed unpaid",
    });
    await call(hr, "set_leave_allowance", {
      employeeId: ids.WORKER,
      year: 2027,
      leaveType: "annual",
      minutes: 2400,
      reason: "Approved company allowance",
    });
    const request = {
      id: randomUUID(),
      summary: "Annual leave",
      detail: "",
      leaveStart: "2027-01-01",
      leaveEnd: "2027-01-04",
      leaveType: "annual",
    };
    await call(worker, "create_leave_request", request);
    assert.equal((await call(worker, null)).leaveBalances[0].remainingMinutes, 2400);
    await call(hr, "review_request", { id: request.id, status: "approved", reason: "Approved" });
    let balance = (await call(worker, null)).leaveBalances[0];
    assert.equal(balance.usedMinutes, 960);
    assert.equal(balance.remainingMinutes, 1440);
    await assert.rejects(
      call(hr, "review_request", { id: request.id, status: "approved", reason: "Retry" }),
      /cannot be reviewed/,
    );
    await call(hr, "configure_leave", { workingDays: [1, 2, 3, 4, 5, 6], minutesPerDay: 360 });
    balance = (await call(worker, null)).leaveBalances[0];
    assert.equal(balance.usedMinutes, 960);
    await assert.rejects(
      call(hr, "set_leave_allowance", {
        employeeId: ids.WORKER,
        year: 2027,
        leaveType: "annual",
        minutes: 100,
        reason: "Below already used",
      }),
      /cannot be lower/,
    );
    const hourly = {
      ...request,
      id: randomUUID(),
      leaveStart: "2027-01-05",
      leaveEnd: "2027-01-05",
      leaveStartTime: "09:00",
      leaveEndTime: "10:30",
    };
    await call(worker, "create_leave_request", hourly);
    await call(hr, "review_request", {
      id: hourly.id,
      status: "approved",
      reason: "Approved partial day",
    });
    assert.equal((await call(worker, null)).leaveBalances[0].usedMinutes, 1050);
    const overlap = { ...hourly, id: randomUUID() };
    await call(worker, "create_leave_request", overlap);
    await assert.rejects(
      call(hr, "review_request", { id: overlap.id, status: "approved", reason: "Overlapping" }),
      /already has approved leave/,
    );
    const excessive = {
      ...request,
      id: randomUUID(),
      leaveStart: "2027-02-01",
      leaveEnd: "2027-02-10",
    };
    await call(worker, "create_leave_request", excessive);
    await assert.rejects(
      call(hr, "review_request", { id: excessive.id, status: "approved", reason: "Too much" }),
      /Insufficient/,
    );
    assert.equal(
      (await call(worker, null)).requests.find((r) => r.id === excessive.id).status,
      "pending",
    );
    const unpaid = {
      ...request,
      id: randomUUID(),
      leaveStart: "2027-03-01",
      leaveEnd: "2027-03-02",
      leaveType: "unpaid",
    };
    await call(worker, "create_leave_request", unpaid);
    await call(hr, "review_request", { id: unpaid.id, status: "approved", reason: "Unpaid" });
    assert.equal((await call(worker, null)).leaveBalances[0].usedMinutes, 1050);
    assert.equal((await call(f.other, null)).leaveBalances.length, 0);
  } finally {
    await f.db.close();
  }
});
test("year boundaries use separate allowances and workers cannot alter company balances", async () => {
  const f = await fixture();
  try {
    const { call, hr, worker, ids } = f;
    await call(hr, "configure_leave", { workingDays: [1, 2, 3, 4, 5, 6, 7], minutesPerDay: 60 });
    for (const year of [2026, 2027])
      await call(hr, "set_leave_allowance", {
        employeeId: ids.WORKER,
        year,
        leaveType: "sick",
        minutes: 120,
        reason: "Company policy",
      });
    await assert.rejects(
      call(worker, "set_leave_allowance", {
        employeeId: ids.WORKER,
        year: 2027,
        leaveType: "sick",
        minutes: 10000,
        reason: "Forged",
      }),
      /HR access/,
    );
    const request = {
      id: randomUUID(),
      summary: "Cross year",
      leaveStart: "2026-12-31",
      leaveEnd: "2027-01-01",
      leaveType: "sick",
    };
    await call(worker, "create_leave_request", request);
    await assert.rejects(
      call(worker, "create_leave_request", { ...request, leaveType: "annual" }),
      /Leave ID conflict/,
    );
    await call(hr, "review_request", { id: request.id, status: "approved", reason: "Approved" });
    const balances = (await call(worker, null)).leaveBalances;
    assert.equal(balances.length, 2);
    for (const balance of balances) {
      assert.equal(balance.usedMinutes, 60);
      assert.equal(balance.remainingMinutes, 60);
    }
    const privateRows = await f.db
      .transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [worker]);
        await tx.exec("set local role authenticated");
        return tx.query("select * from public.sl_leave_allowances");
      })
      .then(
        () => true,
        () => false,
      );
    assert.equal(privateRows, false);
  } finally {
    await f.db.close();
  }
});
