import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";
const hash = (text) => createHash("sha256").update(text).digest("hex");

test("companies register independently; signup, profiles, logos and snapshots stay tenant-scoped", async () => {
  const db = await createLocalDatabase();
  try {
    const managers = [randomUUID(), randomUUID()];
    const companies = [];
    for (const [index, manager] of managers.entries()) {
      await db.query("insert into auth.users(id) values($1)", [manager]);
      companies.push(
        (
          await runRpc(db, manager, "setup", {
            company: `Company ${index}`,
            name: "Owner",
            site: "Office",
            timezone: "Africa/Windhoek",
          })
        ).snapshot.company,
      );
    }
    assert.notEqual(companies[0].registrationCode, companies[1].registrationCode);
    const workerIds = [];
    const service = (sql, args) =>
      db.transaction(async (tx) => {
        await tx.exec("set local role service_role");
        return (await tx.query(sql, args)).rows[0].result;
      });
    for (const [index, company] of companies.entries()) {
      const reservation = await service("select public.sl_worker_signup_start($1,$2,$3) result", [
        hash(randomUUID()),
        hash(`phone${index}`),
        company.registrationCode.toLowerCase(),
      ]);
      assert.equal(reservation.companyId, company.id);
      const worker = randomUUID();
      workerIds.push(worker);
      await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [
        worker,
        `${reservation.employeeNo.toLowerCase()}@workers.shiftline.invalid`,
      ]);
      // The same person may register at different companies without linking their records.
      await service("select public.sl_worker_register($1,$2,$3,$4) result", [
        worker,
        company.id,
        reservation.employeeNo,
        { fullName: `Worker ${index}`, phone: "+264811234567" },
      ]);
      const before = await runRpc(db, worker, null);
      assert.equal(before.onboarding, true);
      const snapshot = await runRpc(db, managers[index], null);
      const employee = snapshot.employees.find((e) => e.no === reservation.employeeNo);
      await runRpc(db, managers[index], "review_worker_access", {
        employeeId: employee.id,
        status: "active",
        expectedStatus: "pending",
      });
      const active = await runRpc(db, worker, null);
      assert.equal(active.company.id, company.id);
      assert.equal(active.company.registrationCode, undefined);
      assert.equal(
        active.employees.some((e) => e.name === `Worker ${1 - index}`),
        false,
      );
    }
    const invalid = await service("select public.sl_worker_signup_start($1,$2,$3) result", [
      hash("bad-ip"),
      hash("bad-phone"),
      "0000000000000000",
    ]);
    assert.match(invalid.error, /Invalid company/);
    const noCode = await service("select public.sl_worker_signup_start($1,$2) result", [
      hash("legacy"),
      hash("legacy"),
    ]);
    assert.match(noCode.error, /registration code/);
    const path = `${companies[0].id}/${randomUUID()}.png`;
    await db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [managers[0]]);
      await tx.exec("set local role authenticated");
      await tx.query("insert into storage.objects(bucket_id,name) values('company-logos',$1)", [
        path,
      ]);
    });
    await runRpc(db, managers[0], "save_company_profile", {
      name: "Good Living",
      logoPath: path,
      companyId: companies[1].id,
    });
    assert.equal((await runRpc(db, managers[0], null)).company.name, "Good Living");
    assert.equal((await runRpc(db, managers[1], null)).company.name, "Company 1");
    await assert.rejects(
      runRpc(db, managers[1], "save_company_profile", { name: "Stolen", logoPath: path }),
      /own company/,
    );
    await assert.rejects(
      runRpc(db, workerIds[0], "save_company_profile", { name: "No" }),
      /Manager access required/,
    );
    for (const [user, count] of [
      [managers[0], 1],
      [workerIds[0], 1],
      [managers[1], 0],
      [workerIds[1], 0],
    ]) {
      await db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
        await tx.exec("set local role authenticated");
        assert.equal(
          (await tx.query("select * from storage.objects where bucket_id='company-logos'")).rows
            .length,
          count,
        );
      });
    }
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [managers[1]]);
        await tx.exec("set local role authenticated");
        await tx.query("insert into storage.objects(bucket_id,name) values('company-logos',$1)", [
          `${companies[0].id}/forged.png`,
        ]);
      }),
      /row-level security/,
    );
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [workerIds[0]]);
        await tx.exec("set local role authenticated");
        await tx.query("insert into storage.objects(bucket_id,name) values('company-logos',$1)", [
          `${companies[0].id}/worker.png`,
        ]);
      }),
      /row-level security/,
    );
  } finally {
    await db.close();
  }
});
