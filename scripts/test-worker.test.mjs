import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createLocalDatabase, seedTestWorker, runRpc } from './local-api.mjs';
test('test worker reuses identity and real attendance rules', async () => {
  const db = await createLocalDatabase();
  try {
    const user = await seedTestWorker(db);
    assert.equal(await seedTestWorker(db), user);
    const before = await runRpc(db, user, null);
    assert.equal(before.employees[0].no, 'EMP-1042');
    assert.equal(before.shifts.length, 1);
    await assert.rejects(runRpc(db, user, 'create_employee', {}), /Manager access required/);
    for (const type of ['clock_in', 'start_lunch', 'end_lunch', 'clock_out']) {
      const result = await runRpc(db, user, 'transition', {id: randomUUID(), type});
      assert.equal(result.status, 'synced');
    }
    const after = await runRpc(db, user, null);
    assert.equal(after.events.length, 4);
  } finally { await db.close(); }
});
