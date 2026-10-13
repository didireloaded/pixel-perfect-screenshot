import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";
const hash = (text) => createHash("sha256").update(text).digest("hex");
const service = (db, sql, params) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return (await tx.query(sql, params)).rows[0]?.result;
  });
async function enroll(db, companyId, phone = "+264811234567") {
  const reservation = await service(db, "select public.sl_worker_signup_start($1,$2) result", [
    hash(randomUUID()),
    hash(phone),
  ]);
  assert.equal(reservation.companyId, companyId);
  const userId = randomUUID();
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [
    userId,
    `${reservation.employeeNo.toLowerCase()}@workers.shiftline.invalid`,
  ]);
  const result = await service(db, "select public.sl_worker_register($1,$2,$3,$4) result", [
    userId,
    companyId,
    reservation.employeeNo,
    { fullName: "Real Worker", phone, role: "manager", companyId: randomUUID() },
  ]);
  return { userId, employeeNo: result.employeeNo };
}

test("name and phone registration stays private until manager approval and is visible in Team", async () => {
  const db = await createLocalDatabase();
  try {
    const manager = randomUUID();
    await db.query("insert into auth.users(id) values($1)", [manager]);
    const setup = await runRpc(db, manager, "setup", {
      company: "Fixture",
      name: "Manager",
      site: "Office",
      timezone: "Africa/Windhoek",
    });
    const { userId, employeeNo } = await enroll(db, setup.snapshot.company.id);
    const managerView = await runRpc(db, manager, null);
    const worker = managerView.employees.find((e) => e.no === employeeNo);
    assert.equal(worker.accessStatus, "pending");
    assert.equal(worker.codeLogin, true);
    assert.equal(worker.name, "Real Worker");
    assert.equal(worker.phone, "+264811234567");
    assert.equal(worker.email, "");
    assert.equal(worker.role, "employee");
    assert.deepEqual(await runRpc(db, userId, null), {
      onboarding: true,
      workerAccess: { status: "pending", name: "Real Worker", employeeNo, phone: "+264811234567" },
    });
    for (const action of [
      "setup",
      "join_workplace",
      "assign_shift",
      "send_chat",
      "create_request",
      "report_position",
      "review_worker_access",
    ])
      await assert.rejects(runRpc(db, userId, action, {}), /awaiting manager approval/);
    const canReceive = (id) =>
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
        await tx.exec("set local role authenticated");
        return (
          await tx.query("select shiftline_private.can_receive_updates($1) result", [
            `shiftline:${setup.snapshot.company.id}`,
          ])
        ).rows[0].result;
      });
    assert.equal(await canReceive(userId), false);
    await assert.rejects(
      runRpc(db, manager, "review_worker_access", {
        employeeId: worker.id,
        status: "active",
        expectedStatus: "rejected",
      }),
      /changed/,
    );
    await runRpc(db, manager, "review_worker_access", {
      employeeId: worker.id,
      status: "rejected",
      expectedStatus: "pending",
    });
    assert.equal((await runRpc(db, userId, null)).workerAccess.status, "rejected");
    await runRpc(db, manager, "review_worker_access", {
      employeeId: worker.id,
      status: "active",
      expectedStatus: "rejected",
    });
    const active = await runRpc(db, userId, null);
    assert.equal(active.role, "employee");
    assert.equal(active.company.id, setup.snapshot.company.id);
    assert.equal(active.employees[0].accessStatus, "active");
    assert.equal(await canReceive(userId), true);
    await assert.rejects(
      runRpc(db, userId, "review_worker_access", { employeeId: worker.id, status: "active" }),
      /Manager access required/,
    );
    const otherManager = randomUUID();
    await db.query("insert into auth.users(id) values($1)", [otherManager]);
    await runRpc(db, otherManager, "setup", {
      company: "Other",
      name: "Other",
      site: "Office",
      timezone: "Africa/Windhoek",
    });
    await assert.rejects(
      runRpc(db, otherManager, "review_worker_access", {
        employeeId: worker.id,
        status: "active",
        expectedStatus: "pending",
      }),
      /unavailable/,
    );
    const target = (id) =>
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
        await tx.exec("set local role authenticated");
        return (await tx.query("select public.sl_worker_access_target($1) result", [worker.id]))
          .rows[0].result;
      });
    assert.deepEqual(await target(manager), { userId, employeeNo });
    await assert.rejects(target(userId), /Manager access required/);
    await assert.rejects(target(otherManager), /unavailable/);
    const refused = await service(db, "select public.sl_worker_signup_start($1,$2) result", [
      hash("other"),
      hash("other"),
    ]);
    assert.match(refused.error, /not configured/);
    for (const role of ["anon", "authenticated"])
      await assert.rejects(
        db.transaction(async (tx) => {
          await tx.exec(`set local role ${role}`);
          await tx.query("select public.sl_worker_signup_start($1,$2)", [hash("x"), hash("y")]);
        }),
        /permission denied/,
      );
    const audit = JSON.stringify((await db.query("select * from public.sl_audit")).rows);
    assert.equal(audit.includes("accessCode"), false);
  } finally {
    await db.close();
  }
});

test("signup limits survive denial and duplicate phones cannot claim an existing account", async () => {
  const db = await createLocalDatabase();
  try {
    const manager = randomUUID();
    await db.query("insert into auth.users(id) values($1)", [manager]);
    const setup = await runRpc(db, manager, "setup", {
      company: "Fixture",
      name: "Manager",
      site: "Office",
      timezone: "Africa/Windhoek",
    });
    await enroll(db, setup.snapshot.company.id);
    const userId = randomUUID();
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,'sl-999999@workers.shiftline.invalid',now())",
      [userId],
    );
    await assert.rejects(
      service(db, "select public.sl_worker_register($1,$2,$3,$4) result", [
        userId,
        setup.snapshot.company.id,
        "SL-999999",
        { fullName: "Impersonator", phone: "+264811234567" },
      ]),
      /already uses this phone/,
    );
    assert.equal(
      (await db.query("select count(*)::int n from public.sl_employees where role='employee'"))
        .rows[0].n,
      1,
    );
    for (let i = 0; i < 5; i++) {
      const result = await service(db, "select public.sl_worker_signup_start($1,$2) result", [
        hash("same-ip"),
        hash(`phone-${i}`),
      ]);
      assert.ok(result.employeeNo);
    }
    for (let i = 0; i < 2; i++) {
      const denied = await service(db, "select public.sl_worker_signup_start($1,$2) result", [
        hash("same-ip"),
        hash(`later-${i}`),
      ]);
      assert.match(denied.error, /Too many/);
    }
    assert.equal(
      (
        await db.query("select attempts from shiftline_private.signup_limits where key=$1", [
          "global",
        ])
      ).rows[0].attempts,
      8,
    );
    await assert.rejects(
      service(db, "select public.sl_worker_register($1,$2,$3,$4) result", [
        userId,
        setup.snapshot.company.id,
        "SL-999999",
        { fullName: " ", phone: "081" },
      ]),
      /name and phone/,
    );
  } finally {
    await db.close();
  }
});
