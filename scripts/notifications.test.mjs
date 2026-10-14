import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";
test("check-in cutoff and durable push records preserve identity, retries and read/approval separation", async () => {
  const db = await createLocalDatabase();
  try {
    const manager = randomUUID(),
      worker = randomUUID(),
      other = randomUUID();
    for (const id of [manager, worker, other])
      await db.query("insert into auth.users values($1)", [id]);
    const setup = await runRpc(db, manager, "setup", {
      company: "Notification test",
      name: "Manager",
      site: "Office",
      timezone: "Africa/Windhoek",
    });
    const invite = await runRpc(db, manager, "create_employee", {
      name: "Worker",
      no: "N1",
      siteId: setup.snapshot.sites[0].id,
    });
    await runRpc(db, worker, "activate", { employeeNo: "N1", code: invite.activationCode });
    const outside = await runRpc(db, other, "setup", {
      company: "Other company",
      name: "Owner",
      site: "Other office",
      timezone: "UTC",
    });
    const api = (user, action, payload = {}) =>
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
        await tx.exec("set local role authenticated");
        return (
          await tx.query("select public.sl_notifications_api($1,$2::jsonb) result", [
            action,
            JSON.stringify(payload),
          ])
        ).rows[0].result;
      });
    const co = setup.snapshot.company.id;
    assert.equal(
      (await db.query("select shiftline_private.checkin_open($1,'2026-10-14T15:00Z') ok", [co]))
        .rows[0].ok,
      true,
    );
    await runRpc(db, manager, "set_checkin_cutoff", { time: "17:00" });
    assert.equal(
      (await db.query("select shiftline_private.checkin_open($1,'2026-10-14T14:59:59Z') ok", [co]))
        .rows[0].ok,
      true,
    );
    assert.equal(
      (await db.query("select shiftline_private.checkin_open($1,'2026-10-14T15:00Z') ok", [co]))
        .rows[0].ok,
      false,
    );
    await assert.rejects(runRpc(db, worker, "set_checkin_cutoff", { time: "23:59" }), /Manager/);
    await runRpc(db, manager, "set_checkin_cutoff", { time: "00:00" });
    await assert.rejects(
      runRpc(db, worker, "start_workday", { id: randomUUID(), expectedEnd: "23:59" }),
      /CHECKIN_CLOSED/,
    );
    assert.equal((await runRpc(db, worker, null)).shifts.length, 0);
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/test-only",
      p256dh: "A".repeat(87),
      auth: "A".repeat(22),
      app: "worker",
    };
    await api(worker, "subscribe", subscription);
    await assert.rejects(api(other, "subscribe", subscription), /another account/);
    await assert.rejects(
      api(worker, "subscribe", { ...subscription, endpoint: "https://localhost/private" }),
      /Invalid/,
    );
    await db.query(
      "insert into public.sl_messages(company_id,sender_id,recipient_id,title,body) values($1,$2,$3,'Private title','Private body')",
      [co, setup.snapshot.me, invite.employeeId],
    );
    const feed = await api(worker, "list");
    assert.equal(feed.length, 1);
    assert.equal(feed[0].title, "New work message");
    assert.equal((await api(other, "list")).length, 0);
    await api(other, "read", { id: feed[0].id });
    assert.equal((await api(worker, "list"))[0].read_at, null);
    await api(worker, "read", { id: feed[0].id });
    assert.ok((await api(worker, "list"))[0].read_at);
    const batch = (await db.query("select public.sl_push_batch() result")).rows[0].result;
    assert.equal(batch.length, 1);
    assert.equal((await db.query("select public.sl_push_batch() result")).rows[0].result.length, 0);
    await db.query("select public.sl_push_result($1,$2,'retry')", [batch[0].id, batch[0].lease]);
    const queued = (await db.query("select * from shiftline_private.push_deliveries")).rows[0];
    assert.equal(queued.status, "pending");
    assert.equal(queued.attempts, 1);
    // An expired sender must not acknowledge a delivery claimed by a new worker.
    await db.query(
      "update shiftline_private.push_deliveries set next_attempt=clock_timestamp()-interval '1 second' where id=$1",
      [batch[0].id],
    );
    const retry = (await db.query("select public.sl_push_batch() result")).rows[0].result;
    assert.equal(retry.length, 1);
    assert.notEqual(retry[0].lease, batch[0].lease);
    await db.query("select public.sl_push_result($1,$2,'sent')", [batch[0].id, batch[0].lease]);
    const stillSending = (await db.query("select * from shiftline_private.push_deliveries"))
      .rows[0];
    assert.equal(stillSending.status, "sending");
    assert.equal(stillSending.attempts, 2);
    // A dead endpoint is retired only by the current lease holder.
    await db.query("select public.sl_push_result($1,$2,'gone')", [batch[0].id, batch[0].lease]);
    assert.equal(
      (await db.query("select active from shiftline_private.push_subscriptions")).rows[0].active,
      true,
    );
    await db.query("select public.sl_push_result($1,$2,'gone')", [retry[0].id, retry[0].lease]);
    assert.equal(
      (await db.query("select status from shiftline_private.push_deliveries")).rows[0].status,
      "failed",
    );
    await api(worker, "unsubscribe", { endpoint: subscription.endpoint });
    assert.equal(
      (await db.query("select active from shiftline_private.push_subscriptions")).rows[0].active,
      false,
    );
  } finally {
    await db.close();
  }
});
