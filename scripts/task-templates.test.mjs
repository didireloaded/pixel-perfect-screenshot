import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";
test("manual task templates enforce company roles and apply checklists once without attendance changes", async () => {
  const db = await createLocalDatabase();
  try {
    const owner = randomUUID(),
      worker = randomUUID(),
      other = randomUUID();
    for (const id of [owner, worker, other])
      await db.query("insert into auth.users values($1)", [id]);
    const setup = await runRpc(db, owner, "setup", {
      company: "Templates",
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
      no: "T1",
      siteId: setup.snapshot.sites[0].id,
    });
    await runRpc(db, worker, "activate", { employeeNo: "T1", code: invite.activationCode });
    const api = (user, action, payload = {}) =>
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
        await tx.exec("set local role authenticated");
        return (
          await tx.query("select sl_task_templates($1,$2::jsonb) as result", [
            action,
            JSON.stringify(payload),
          ])
        ).rows[0].result;
      });
    await assert.rejects(api(worker, "save", { title: "No", checklist: [] }), /Operations access/);
    await assert.rejects(api(owner, "save", { title: "Bad", checklist: [""] }), /Checklist items/);
    const saved = await api(owner, "save", {
      title: "Opening checks",
      instructions: "Follow the checklist",
      checklist: ["Check access", "Check equipment"],
    });
    const templateId = saved.templates[0].id;
    await assert.rejects(api(other, "archive", { templateId }), /Template unavailable/);
    assert.equal((await api(other, "list")).templates.length, 0);
    const shift = randomUUID(),
      job = randomUUID();
    await db.query(
      "insert into sl_shifts(id,company_id,employee_id,site_id,date,start_time,end_time,lunch_time,lunch_minutes,regular_minutes) values($1,$2,$3,$4,current_date,'08:00','17:00','12:00',60,480)",
      [shift, setup.snapshot.company.id, invite.employeeId, setup.snapshot.sites[0].id],
    );
    await db.query(
      "insert into sl_jobs(id,company_id,employee_id,shift_id,title,instructions,destination,supervisor,start_time,end_time) values($1,$2,$3,$4,'Existing task','Original','Office','Owner','08:00','17:00')",
      [job, setup.snapshot.company.id, invite.employeeId, shift],
    );
    await api(owner, "apply", { templateId, jobId: job });
    await api(owner, "apply", { templateId, jobId: job });
    assert.equal((await db.query("select count(*)::int n from sl_job_steps")).rows[0].n, 2);
    assert.equal(
      (await db.query("select count(*)::int n from sl_task_template_applications")).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query("select instructions from sl_jobs where id=$1", [job])).rows[0].instructions,
      "Original",
    );
    assert.equal((await db.query("select count(*)::int n from sl_shifts")).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int n from sl_events")).rows[0].n, 0);
    await api(owner, "archive", { templateId });
    assert.equal((await api(owner, "list")).templates.length, 0);
    await assert.rejects(api(owner, "apply", { templateId, jobId: job }), /archived/);
    assert.equal(
      (
        await db.query(
          "select has_table_privilege('authenticated','sl_task_templates','select') allowed",
        )
      ).rows[0].allowed,
      false,
    );
  } finally {
    await db.close();
  }
});
