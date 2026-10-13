import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";

test("code-only joining consumes the invitation and shares validated signup details with its manager", async () => {
  const db = await createLocalDatabase();
  try {
    await db.exec(`create schema realtime;
      create table realtime.test_outbox(payload jsonb,event text,topic text,private boolean);
      create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$ insert into realtime.test_outbox values($1,$2,$3,$4) $$;`);
    const manager = randomUUID(),
      worker = randomUUID(),
      other = randomUUID(),
      outsider = randomUUID();
    for (const id of [manager, worker, other, outsider])
      await db.query("insert into auth.users(id) values($1)", [id]);
    await db.query("update auth.users set email=$2,raw_user_meta_data=$3::jsonb where id=$1", [
      worker,
      "WORKER@example.com",
      JSON.stringify({
        fullName: "  Real Worker  ",
        phone: " +264 81 123 4567 ",
        role: "manager",
        companyId: randomUUID(),
        email: "forged@example.com",
      }),
    ]);
    const setup = await runRpc(db, manager, "setup", {
      company: "Join fixture",
      name: "Manager",
      site: "Office",
      timezone: "Africa/Windhoek",
    });
    const invite = await runRpc(db, manager, "create_employee", {
      name: "Invited worker",
      no: "W-1",
      siteId: setup.snapshot.sites[0].id,
      team: "Operations",
    });
    assert.deepEqual(await runRpc(db, worker, null), { onboarding: true });
    await assert.rejects(
      runRpc(db, worker, "join_workplace", { code: invite.activationCode }),
      /Confirm your email/,
    );
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [worker]);
    await assert.rejects(
      runRpc(db, worker, "join_workplace", { code: "wrong" }),
      /Invalid or expired/,
    );
    await db.query(
      "update public.sl_employees set activation_expires=now()-interval '1 minute' where id=$1",
      [invite.employeeId],
    );
    await assert.rejects(
      runRpc(db, worker, "join_workplace", { code: invite.activationCode }),
      /Invalid or expired/,
    );
    const renewed = await runRpc(db, manager, "issue_activation", {
      employeeId: invite.employeeId,
    });
    const result = await runRpc(db, worker, "join_workplace", {
      code: ` ${renewed.activationCode.toUpperCase()} `,
      companyId: randomUUID(),
      role: "manager",
    });
    const employee = result.snapshot.employees[0];
    assert.equal(result.snapshot.role, "employee");
    assert.equal(result.snapshot.company.id, setup.snapshot.company.id);
    assert.equal(employee.name, "Real Worker");
    assert.equal(employee.email, "worker@example.com");
    assert.equal(employee.phone, "+264 81 123 4567");
    assert.equal(employee.no, "W-1");
    assert.equal(employee.team, "Operations");
    const managerView = await runRpc(db, manager, null);
    assert.deepEqual(
      managerView.employees.find((item) => item.id === invite.employeeId),
      employee,
    );
    const saved = (
      await db.query(
        "select user_id,activation_hash,activation_expires from public.sl_employees where id=$1",
        [invite.employeeId],
      )
    ).rows[0];
    assert.deepEqual(saved, { user_id: worker, activation_hash: null, activation_expires: null });
    await db.query(
      "update auth.users set email='other@example.com',email_confirmed_at=now() where id=$1",
      [other],
    );
    await assert.rejects(
      runRpc(db, other, "join_workplace", { code: renewed.activationCode }),
      /Invalid or expired/,
    );
    await assert.rejects(
      runRpc(db, worker, "join_workplace", { code: renewed.activationCode }),
      /already belongs/,
    );
    await assert.rejects(
      runRpc(db, worker, "create_employee", {
        name: "Forbidden",
        no: "X",
        siteId: setup.snapshot.sites[0].id,
      }),
      /Manager access required/,
    );
    const isolated = await runRpc(db, outsider, "setup", {
      company: "Other company",
      name: "Other manager",
      site: "Other office",
      timezone: "Africa/Windhoek",
    });
    assert.equal(
      isolated.snapshot.employees.some((item) => item.email === employee.email),
      false,
    );
    const audit = JSON.stringify((await db.query("select detail from public.sl_audit")).rows);
    assert.equal(audit.includes(renewed.activationCode), false);
    assert.equal(audit.includes(invite.activationCode), false);
    const notice = (
      await db.query("select * from realtime.test_outbox where topic=$1", [
        `shiftline:${setup.snapshot.company.id}`,
      ])
    ).rows.at(-1);
    assert.deepEqual(notice, {
      payload: {},
      event: "refresh",
      topic: `shiftline:${setup.snapshot.company.id}`,
      private: true,
    });
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [worker]);
        await tx.exec("set local role authenticated");
        await tx.query("select shiftline_private.join_workplace($1::jsonb)", [
          JSON.stringify({ code: renewed.activationCode }),
        ]);
      }),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test("invalid signup metadata never consumes or changes an employee invitation", async () => {
  const db = await createLocalDatabase();
  try {
    const manager = randomUUID(),
      worker = randomUUID();
    for (const id of [manager, worker])
      await db.query("insert into auth.users(id) values($1)", [id]);
    await db.query(
      "update auth.users set email='worker@example.com',email_confirmed_at=now(),raw_user_meta_data=$2::jsonb where id=$1",
      [worker, JSON.stringify({ fullName: "x".repeat(101) })],
    );
    const setup = await runRpc(db, manager, "setup", {
      company: "Validation fixture",
      name: "Manager",
      site: "Office",
      timezone: "Africa/Windhoek",
    });
    const invite = await runRpc(db, manager, "create_employee", {
      name: "Worker",
      no: "W-2",
      siteId: setup.snapshot.sites[0].id,
    });
    await assert.rejects(
      runRpc(db, worker, "join_workplace", { code: invite.activationCode }),
      /name and contact/,
    );
    assert.equal(
      (await runRpc(db, manager, null)).employees.find((e) => e.id === invite.employeeId).activated,
      false,
    );
    await db.query("update auth.users set raw_user_meta_data='{}' where id=$1", [worker]);
    const joined = await runRpc(db, worker, "join_workplace", { code: invite.activationCode });
    assert.equal(joined.snapshot.employees[0].name, "Worker");
    assert.equal(joined.snapshot.employees[0].phone, "");
  } finally {
    await db.close();
  }
});
