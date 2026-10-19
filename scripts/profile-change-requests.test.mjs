import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";
test("profile requests require independent HR review and preserve authentication identity and stale evidence", async () => {
  const db = await createLocalDatabase();
  try {
    const owner = randomUUID(),
      worker = randomUUID(),
      other = randomUUID(),
      ops = randomUUID();
    for (const id of [owner, worker, other, ops])
      await db.query("insert into auth.users values($1)", [id]);
    const setup = await runRpc(db, owner, "setup", {
      company: "Profiles",
      name: "Owner",
      site: "Office",
      timezone: "Africa/Windhoek",
    });
    await runRpc(db, other, "setup", {
      company: "Other",
      name: "Owner",
      site: "Office",
      timezone: "Africa/Windhoek",
    });
    const invite = await runRpc(db, owner, "create_employee", {
      name: "Worker",
      no: "P1",
      siteId: setup.snapshot.sites[0].id,
    });
    await runRpc(db, worker, "activate", { employeeNo: "P1", code: invite.activationCode });
    const opInvite = await runRpc(db, owner, "create_employee", {
      name: "Ops",
      no: "OPS",
      siteId: setup.snapshot.sites[0].id,
    });
    await runRpc(db, ops, "activate", { employeeNo: "OPS", code: opInvite.activationCode });
    await db.query("update sl_employees set role='manager',access_role='operations' where id=$1", [
      opInvite.employeeId,
    ]);
    const api = (user, action, payload = {}) =>
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
        await tx.exec("set local role authenticated");
        return (
          await tx.query("select sl_profile_change_requests($1,$2::jsonb) result", [
            action,
            JSON.stringify(payload),
          ])
        ).rows[0].result;
      });
    const profile = {
      name: "New name",
      contactPhone: "+264811234567",
      jobTitle: "Technician",
      bio: "New bio",
    };
    for (const extra of [
      { role: "manager" },
      { no: "NEW" },
      { phone: "+26400000000" },
      { user_id: owner },
      { department: "Finance" },
    ])
      await assert.rejects(api(worker, "submit", { ...profile, ...extra }), /Only contact profile/);
    const identity = (
      await db.query(
        "select no,phone,user_id,activation_hash,login_method from sl_employees where id=$1",
        [invite.employeeId],
      )
    ).rows[0];
    let result = await api(worker, "submit", profile);
    const requestId = result.requests[0].id;
    await assert.rejects(
      api(worker, "review", { requestId, decision: "approved", reason: "Self" }),
      /HR access/,
    );
    await assert.rejects(
      api(other, "review", { requestId, decision: "approved", reason: "Cross" }),
      /Independent company/,
    );
    assert.equal((await api(ops, "list")).requests.length, 0);
    await assert.rejects(
      api(ops, "review", { requestId, decision: "approved", reason: "No" }),
      /HR access/,
    );
    await api(owner, "review", {
      requestId,
      decision: "approved",
      reason: "Confirmed employee details",
    });
    const changed = (
      await db.query("select name,contact_phone,job_title,bio from sl_employees where id=$1", [
        invite.employeeId,
      ])
    ).rows[0];
    assert.deepEqual(changed, {
      name: profile.name,
      contact_phone: profile.contactPhone,
      job_title: profile.jobTitle,
      bio: profile.bio,
    });
    assert.deepEqual(
      (
        await db.query(
          "select no,phone,user_id,activation_hash,login_method from sl_employees where id=$1",
          [invite.employeeId],
        )
      ).rows[0],
      identity,
    );
    const workerSnapshot = await runRpc(db, worker, null);
    assert.equal(
      workerSnapshot.employees.find((e) => e.id === invite.employeeId).contactPhone,
      profile.contactPhone,
    );
    const ownerSnapshot = await runRpc(db, owner, null);
    assert.equal(
      ownerSnapshot.employees.find((e) => e.id === invite.employeeId).contactPhone,
      profile.contactPhone,
    );
    const opsSnapshot = await runRpc(db, ops, null);
    assert.equal(
      Object.hasOwn(
        opsSnapshot.employees.find((e) => e.id === invite.employeeId),
        "contactPhone",
      ),
      false,
    );
    await db.query("update sl_employees set access_role='hr' where id=$1", [opInvite.employeeId]);
    const hrSnapshot = await runRpc(db, ops, null);
    assert.equal(
      hrSnapshot.employees.find((e) => e.id === invite.employeeId).contactPhone,
      profile.contactPhone,
    );
    await db.query("update sl_employees set access_role='operations' where id=$1", [
      opInvite.employeeId,
    ]);
    result = await api(worker, "submit", { ...profile, bio: "Requested next" });
    const staleId = result.requests[0].id;
    await db.query("update sl_employees set bio='Independent update' where id=$1", [
      invite.employeeId,
    ]);
    await assert.rejects(
      api(owner, "review", { requestId: staleId, decision: "approved", reason: "Stale" }),
      /Profile changed since/,
    );
    await api(owner, "review", {
      requestId: staleId,
      decision: "declined",
      reason: "Please resubmit current details",
    });
    await assert.rejects(
      db.query("update sl_profile_change_requests set proposed_profile='{}' where id=$1", [
        requestId,
      ]),
      /Append-only/i,
    );
    assert.equal(
      (
        await db.query(
          "select has_table_privilege('authenticated','sl_profile_change_requests','select') allowed",
        )
      ).rows[0].allowed,
      false,
    );
  } finally {
    await db.close();
  }
});
