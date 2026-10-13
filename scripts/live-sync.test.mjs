import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";

test("live invalidations contain no business data and respect company membership", async () => {
  const db = await createLocalDatabase();
  try {
    await db.exec(`create schema realtime;
    create table realtime.test_outbox(payload jsonb,event text,topic text,private boolean);
    create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$ insert into realtime.test_outbox values($1,$2,$3,$4) $$;`);
    const manager = randomUUID(),
      worker = randomUUID(),
      outsider = randomUUID();
    for (const id of [manager, worker, outsider])
      await db.query("insert into auth.users values($1)", [id]);
    const setup = await runRpc(db, manager, "setup", {
      company: "Sync fixture",
      name: "Manager",
      site: "Yard",
      timezone: "Africa/Windhoek",
    });
    const siteId = setup.snapshot.sites[0].id;
    const invite = await runRpc(db, manager, "create_employee", {
      name: "Worker",
      no: "W-1",
      siteId,
    });
    await runRpc(db, worker, "activate", { employeeNo: "W-1", code: invite.activationCode });
    const companyId = setup.snapshot.company.id;
    const allowed = async (user, topic) =>
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user ?? ""]);
        await tx.exec("set local role authenticated");
        return (
          await tx.query("select shiftline_private.can_receive_updates($1) as allowed", [topic])
        ).rows[0].allowed;
      });
    for (const id of [manager, worker])
      assert.equal(await allowed(id, `shiftline:${companyId}`), true);
    assert.equal(await allowed(outsider, `shiftline:${companyId}`), false);
    assert.equal(await allowed(null, `shiftline:${companyId}`), false);
    assert.equal(await allowed(worker, `shiftline:${randomUUID()}`), false);
    assert.equal(await allowed(worker, companyId), false);
    const notifications = (await db.query("select * from realtime.test_outbox")).rows;
    assert.equal(notifications.length, 3);
    for (const notice of notifications)
      assert.deepEqual(notice, {
        payload: {},
        event: "refresh",
        topic: `shiftline:${companyId}`,
        private: true,
      });
    await assert.rejects(
      runRpc(db, worker, "create_employee", { name: "Forbidden", no: "W-2", siteId }),
      /Manager access required/,
    );
    assert.equal((await db.query("select count(*)::int n from realtime.test_outbox")).rows[0].n, 3);
    await db.exec(
      `create or replace function realtime.send(jsonb,text,text,boolean) returns void language plpgsql as $$ begin raise exception 'Realtime unavailable'; end $$;`,
    );
    await runRpc(db, manager, "add_manager_note", {
      title: "Saved even during outage",
      body: "Durable data",
    });
    assert.equal((await runRpc(db, manager, null)).managerNotes.length, 1);
  } finally {
    await db.close();
  }
});
