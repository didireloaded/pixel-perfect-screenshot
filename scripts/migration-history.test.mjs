import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLocalDatabase } from "./test-database.mjs";

test("matching hosted timestamps does not reapply local migrations", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "shiftline-history-"));
  let db;
  try {
    db = await createLocalDatabase(directory);
    const count = (await db.query("select count(*)::int n from local_private.migrations")).rows[0]
      .n;
    const tableCount = (
      await db.query(
        "select count(*)::int n from pg_tables where schemaname='public' and tablename like 'sl_%'",
      )
    ).rows[0].n;
    await db.query(
      "update local_private.migrations set name='20000101000000_' || regexp_replace(name,'^[0-9]+_','')",
    );
    await db.close();
    db = undefined;
    db = await createLocalDatabase(directory);
    assert.equal(
      (await db.query("select count(*)::int n from local_private.migrations")).rows[0].n,
      count,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from pg_tables where schemaname='public' and tablename like 'sl_%'",
        )
      ).rows[0].n,
      tableCount,
    );
  } finally {
    if (db) await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
