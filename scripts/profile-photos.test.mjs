import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";

test("profile photos enforce ownership, active access and company isolation", async () => {
  const db = await createLocalDatabase();
  try {
    const manager = randomUUID(),
      worker = randomUUID(),
      outsider = randomUUID();
    for (const id of [manager, worker, outsider])
      await db.query("insert into auth.users values($1)", [id]);
    const call = (user, action, data = {}) => runRpc(db, user, action, data);
    const setup = await call(manager, "setup", {
      company: "Photos",
      name: "Manager",
      site: "Office",
      timezone: "Africa/Windhoek",
    });
    const invite = await call(manager, "create_employee", {
      name: "Worker",
      no: "PHOTO-1",
      siteId: setup.snapshot.sites[0].id,
    });
    await call(worker, "activate", { employeeNo: "PHOTO-1", code: invite.activationCode });
    await call(outsider, "setup", {
      company: "Other",
      name: "Other",
      site: "Other",
      timezone: "Africa/Windhoek",
    });
    const path = `${setup.snapshot.company.id}/${invite.employeeId}/avatar.jpg`;
    await assert.rejects(call(worker, "save_profile_photo", { path }), /Upload your own/);
    const storage = (user, sql, params) =>
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
        await tx.exec("set local role authenticated");
        return tx.query(sql, params);
      });
    await assert.rejects(
      storage(
        outsider,
        "insert into storage.objects(bucket_id,name) values('employee-photos',$1)",
        [path],
      ),
      /row-level security/,
    );
    await assert.rejects(
      storage(manager, "insert into storage.objects(bucket_id,name) values('employee-photos',$1)", [
        path,
      ]),
      /row-level security/,
    );
    await storage(
      worker,
      "insert into storage.objects(bucket_id,name) values('employee-photos',$1)",
      [path],
    );
    const saved = await call(worker, "save_profile_photo", { path });
    assert.equal(saved.snapshot.employees.find((e) => e.id === invite.employeeId).photoPath, path);
    assert.equal(
      (await call(manager, null)).employees.find((e) => e.id === invite.employeeId).photoPath,
      path,
    );
    assert.equal(
      (
        await storage(
          outsider,
          "select * from storage.objects where bucket_id='employee-photos'",
          [],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await storage(
          manager,
          "select * from storage.objects where bucket_id='employee-photos'",
          [],
        )
      ).rows.length,
      1,
    );
    await assert.rejects(call(manager, "save_profile_photo", { path }), /Upload your own/);
    await db.exec("grant update on storage.objects to authenticated");
    await storage(worker, "update storage.objects set metadata='{}' where name=$1", [path]);
    assert.equal(
      (
        await storage(
          manager,
          "update storage.objects set metadata='{}' where name=$1 returning id",
          [path],
        )
      ).rows.length,
      0,
    );
    await db.query("update public.sl_employees set access_status='pending' where id=$1", [
      invite.employeeId,
    ]);
    await assert.rejects(call(worker, "save_profile_photo", { path }), /Active workplace/);
    assert.equal(
      (await storage(worker, "select * from storage.objects where bucket_id='employee-photos'", []))
        .rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
