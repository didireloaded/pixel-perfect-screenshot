import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";
test("knowledge drafts and exact-version acknowledgements stay company-scoped and immutable", async () => {
  const db = await createLocalDatabase();
  try {
    const owner = randomUUID(),
      worker = randomUUID(),
      other = randomUUID();
    for (const id of [owner, worker, other])
      await db.query("insert into auth.users(id) values($1)", [id]);
    const company = await runRpc(db, owner, "setup", {
      company: "Knowledge",
      name: "Owner",
      site: "Office",
      timezone: "Africa/Windhoek",
    });
    const invite = await runRpc(db, owner, "create_employee", {
      name: "Worker",
      no: "K1",
      siteId: company.snapshot.sites[0].id,
    });
    await runRpc(db, worker, "activate", { employeeNo: "K1", code: invite.activationCode });
    await runRpc(db, other, "setup", {
      company: "Other",
      name: "Other",
      site: "Office",
      timezone: "Africa/Windhoek",
    });
    const api = (user, action, payload = {}) =>
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
        await tx.exec("set local role authenticated");
        return (
          await tx.query("select public.sl_knowledge($1,$2::jsonb) result", [
            action,
            JSON.stringify(payload),
          ])
        ).rows[0].result;
      });
    const draft = randomUUID(),
      first = randomUUID(),
      second = randomUUID();
    const base = {
      title: "Policy",
      body: "Plain text <script>not executed</script>",
      category: "policy",
    };
    await api(owner, "create", { id: draft, ...base, published: false });
    assert.equal((await api(worker, "list")).entries.length, 0);
    await assert.rejects(
      api(worker, "acknowledge", { versionId: draft }),
      /published company policy/,
    );
    await api(owner, "create", { id: first, articleId: draft, ...base, published: true });
    await api(worker, "acknowledge", { versionId: first });
    await api(worker, "acknowledge", { versionId: first });
    assert.equal((await api(worker, "list")).acknowledgements.length, 1);
    await api(owner, "create", {
      id: second,
      articleId: draft,
      ...base,
      body: "New version",
      published: true,
    });
    let result = await api(worker, "list");
    assert.equal(result.entries.length, 2);
    assert.equal(
      result.acknowledgements.some((a) => a.versionId === second),
      false,
    );
    await api(worker, "acknowledge", { versionId: second });
    assert.equal((await api(other, "list")).entries.length, 0);
    await assert.rejects(
      api(other, "acknowledge", { versionId: first }),
      /published company policy/,
    );
    await assert.rejects(
      api(other, "create", { id: randomUUID(), articleId: draft, ...base, published: true }),
      /company article/,
    );
    await assert.rejects(
      api(worker, "create", { id: randomUUID(), ...base, published: true }),
      /Owner or HR/,
    );
    assert.equal((await api(owner, "list")).acknowledgements.length, 2);
    assert.equal((await api(worker, "list")).employees.length, 0);
    await assert.rejects(
      db.query("update sl_knowledge_versions set body=$1 where id=$2", ["Changed", first]),
      /Append-only/i,
    );
    await assert.rejects(
      db.query("delete from sl_knowledge_acknowledgements where version_id=$1", [first]),
      /Append-only/i,
    );
    assert.equal((await db.query("select count(*)::int n from sl_shifts")).rows[0].n, 0);
    assert.equal(
      (
        await db.query(
          "select has_table_privilege('authenticated','public.sl_knowledge_versions','SELECT') allowed",
        )
      ).rows[0].allowed,
      false,
    );
  } finally {
    await db.close();
  }
});
