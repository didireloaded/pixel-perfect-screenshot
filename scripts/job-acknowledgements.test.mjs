import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";
test("job responses preserve history, enforce tenant and assignment scope, and do not mutate attendance", async () => {
  const db = await createLocalDatabase();
  try {
    const owner = randomUUID(),
      other = randomUUID(),
      worker = randomUUID(),
      unassigned = randomUUID();
    for (const id of [owner, other, worker, unassigned])
      await db.query("insert into auth.users values($1)", [id]);
    const setup = await runRpc(db, owner, "setup", {
      company: "Jobs",
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
    const ids = [];
    for (const [i, user] of [worker, unassigned].entries()) {
      const invite = await runRpc(db, owner, "create_employee", {
        name: `Worker ${i}`,
        no: `J${i}`,
        siteId: setup.snapshot.sites[0].id,
      });
      await runRpc(db, user, "activate", { employeeNo: `J${i}`, code: invite.activationCode });
      ids.push(invite.employeeId);
    }
    const day = (
      await db.query(
        "select ((clock_timestamp() at time zone 'Africa/Windhoek')::date+1)::text as day",
      )
    ).rows[0].day;
    const job = randomUUID();
    await db.query(
      "insert into sl_calendar_jobs(id,company_id,date,end_date,title,details,employee_ids,created_by) values($1,$2,$3,$3,$4,$5,$6,$7)",
      [job, setup.snapshot.company.id, day, "Work", "Details", [ids[0]], setup.snapshot.me],
    );
    const api = (user, action, payload) =>
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
        await tx.exec("set local role authenticated");
        return (
          await tx.query("select sl_job_acknowledgements($1,$2::jsonb) as result", [
            action,
            JSON.stringify({ jobId: job, ...payload }),
          ])
        ).rows[0].result;
      });
    await api(worker, "respond", { response: "seen" });
    const result = await api(worker, "respond", { response: "conflict", note: "Unavailable" });
    assert.equal(result.responses.length, 2);
    await assert.rejects(api(other, "list", {}), /Job unavailable/);
    await assert.rejects(api(unassigned, "list", {}), /Job unavailable/);
    await assert.rejects(
      api(worker, "set_reporting_time", {
        employeeId: ids[0],
        date: day,
        expectedAt: `${day}T09:00:00+02:00`,
      }),
      /Operations access/,
    );
    await db.query(
      "insert into sl_punctuality_policies(company_id,created_by,starts_on,enabled,weekdays,start_time,end_time,employee_ids) values($1,$2,$3,true,'{1,2,3,4,5,6,7}','08:00','17:00',$4)",
      [setup.snapshot.company.id, setup.snapshot.me, day, [ids[0]]],
    );
    await api(owner, "set_reporting_time", {
      employeeId: ids[0],
      date: day,
      expectedLocal: `${day}T09:00:00`,
    });
    assert.equal(
      (
        await db.query(
          "select extract(hour from shiftline_private.job_expected_start($1,$2,$3) at time zone 'Africa/Windhoek') as hour",
          [setup.snapshot.company.id, ids[0], day],
        )
      ).rows[0].hour,
      "9",
    );
    await assert.rejects(
      api(owner, "set_reporting_time", {
        employeeId: ids[0],
        date: day,
        expectedAt: `${day}T18:00:00+02:00`,
      }),
      /company attendance hours/,
    );
    await db.query(
      "select shiftline_private.refresh_punctuality($1,$2,($2::date+time '08:30') at time zone 'Africa/Windhoek')",
      [setup.snapshot.company.id, day],
    );
    const punctuality = (
      await db.query(
        "select status,extract(hour from expected_at at time zone 'Africa/Windhoek') as hour,reminder_stage from sl_punctuality_records where employee_id=$1 and work_date=$2",
        [ids[0], day],
      )
    ).rows[0];
    assert.equal(punctuality.status, "expected");
    assert.equal(punctuality.hour, "9");
    assert.equal(punctuality.reminder_stage, 0);
    // Job lifecycle changes must preserve the reporting context accepted above.
    await db.query(
      "update sl_calendar_jobs set completed_at=clock_timestamp(),employee_ids='{}' where id=$1",
      [job],
    );
    await db.query(
      "select shiftline_private.refresh_punctuality($1,$2,($2::date+time '08:30') at time zone 'Africa/Windhoek')",
      [setup.snapshot.company.id, day],
    );
    const afterCompletion = (
      await db.query(
        "select status,extract(hour from expected_at at time zone 'Africa/Windhoek') as hour from sl_punctuality_records where employee_id=$1 and work_date=$2",
        [ids[0], day],
      )
    ).rows[0];
    assert.equal(afterCompletion.status, "expected");
    assert.equal(afterCompletion.hour, "9");
    assert.equal((await db.query("select count(*)::int as n from sl_shifts")).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int as n from sl_events")).rows[0].n, 0);
    assert.equal(
      (
        await db.query(
          "select has_table_privilege('authenticated','sl_job_responses','select') as allowed",
        )
      ).rows[0].allowed,
      false,
    );
  } finally {
    await db.close();
  }
});
