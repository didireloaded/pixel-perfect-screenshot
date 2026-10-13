import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";
test("job calendar, dated leave and notification receipts enforce company and role boundaries", async () => {
  const db = await createLocalDatabase();
  try {
    const manager = randomUUID(),
      worker = randomUUID(),
      outsider = randomUUID();
    for (const id of [manager, worker, outsider])
      await db.query("insert into auth.users values($1)", [id]);
    const call = (user, action, data) => runRpc(db, user, action, data);
    const setup = await call(manager, "setup", {
      company: "HR test",
      name: "Manager",
      site: "Office",
      timezone: "UTC",
    });
    const invite = await call(manager, "create_employee", {
      name: "Worker",
      no: "W1",
      siteId: setup.snapshot.sites[0].id,
    });
    await call(worker, "activate", { employeeNo: "W1", code: invite.activationCode });
    const other = await call(outsider, "setup", {
      company: "Other",
      name: "Other Manager",
      site: "Other office",
      timezone: "UTC",
    });
    const job = {
      id: randomUUID(),
      date: setup.snapshot.today,
      title: "Inspection",
      details: "Inspect the equipment",
      employeeIds: [],
    };
    const created = await call(manager, "create_calendar_job", job);
    assert.equal(created.snapshot.calendarJobs[0].title, job.title);
    assert.equal((await call(worker, null)).calendarJobs.length, 1);
    assert.equal((await call(outsider, null)).calendarJobs.length, 0);
    assert.equal((await call(manager, "create_calendar_job", job)).duplicate, true);
    await assert.rejects(
      call(worker, "create_calendar_job", { ...job, id: randomUUID() }),
      /Manager/,
    );
    await assert.rejects(
      call(manager, "create_calendar_job", {
        ...job,
        id: randomUUID(),
        employeeIds: [other.snapshot.me],
      }),
      /active employees/,
    );
    const assigned = await call(manager, "create_calendar_job", {
      ...job,
      id: randomUUID(),
      employeeIds: [invite.employeeId],
    });
    assert.equal(
      assigned.snapshot.calendarJobs.find((item) => item.employeeIds.length).assignedNames[0],
      "Worker",
    );
    const leave = {
      id: randomUUID(),
      summary: "Personal leave",
      detail: "Appointment",
      leaveStart: setup.snapshot.today,
      leaveEnd: setup.snapshot.today,
      leaveStartTime: "09:00",
      leaveEndTime: "10:00",
    };
    await call(worker, "create_leave_request", leave);
    await call(worker, "create_leave_request", leave);
    const managerView = await call(manager, null);
    assert.equal(managerView.requests.length, 1);
    assert.equal(managerView.requests[0].leaveStartTime, "09:00");
    await assert.rejects(
      call(worker, "create_leave_request", { ...leave, id: randomUUID(), leaveEndTime: "08:00" }),
      /end after/,
    );
    await assert.rejects(
      call(worker, "create_leave_request", { ...leave, id: randomUUID(), leaveEnd: "2020-01-01" }),
      /same day/,
    );
    await assert.rejects(
      call(outsider, "read_manager_notification", { id: `request:${leave.id}` }),
      /Unknown notification/,
    );
    await assert.rejects(
      call(worker, "read_manager_notification", { id: `request:${leave.id}` }),
      /Manager/,
    );
    const read = await call(manager, "read_manager_notification", { id: `request:${leave.id}` });
    assert.deepEqual(read.snapshot.readNotificationIds, [`request:${leave.id}`]);
    await call(manager, "read_manager_notification", { id: `request:${leave.id}` });
    const approved = await call(manager, "review_request", {
      id: leave.id,
      status: "approved",
      reason: "Approved appointment",
    });
    assert.equal(approved.snapshot.requests[0].leaveEndTime, "10:00");
    assert.equal((await call(worker, null)).requests[0].status, "approved");
    assert.equal((await call(outsider, null)).requests.length, 0);
  } finally {
    await db.close();
  }
});
