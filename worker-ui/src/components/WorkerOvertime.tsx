import { useEffect, useState } from "react";
import type { AttendanceSnapshot } from "../../../shared/attendance";
import { currentWorkday } from "../../../shared/workday";
import { overtimeSessionSeconds } from "../../../shared/overtime-session";
import { ThemedSelect } from "../../../shared/ThemedSelect";
import { WorkerCard } from "./WorkerUI";
import type { WorkerRun } from "./WorkerAccount";

export function WorkerOvertime({
  data,
  busy,
  run,
  workdayId,
}: {
  data: AttendanceSnapshot;
  busy: boolean;
  run: WorkerRun;
  workdayId?: string;
}) {
  const [now, setNow] = useState(Date.now());
  const [startId] = useState(() => crypto.randomUUID());
  const [finishId] = useState(() => crypto.randomUUID());
  const [open, setOpen] = useState(false);
  const [finishDay, setFinishDay] = useState("today");
  const shift = workdayId
    ? data.shifts.find((item) => item.id === workdayId)
    : currentWorkday(data);
  const session = data.overtimeSessions?.find((item) => item.shiftId === shift?.id);
  const state = data.states.find((item) => item.shiftId === shift?.id)?.state;
  const shiftId = shift?.id;
  useEffect(() => {
    if (
      session?.endedAt ||
      !shiftId ||
      ["clocked_out", "not_clocked_in"].includes(state ?? "not_clocked_in")
    )
      return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session?.endedAt, shiftId, state]);
  if (
    !shift ||
    (!session &&
      (!shift.finishesAt ||
        now < Date.parse(shift.finishesAt) ||
        !["working", "on_job"].includes(state ?? "")))
  )
    return null;
  const seconds = session
    ? session.endedAt
      ? session.recordedSeconds
      : overtimeSessionSeconds(session, data.events, now)
    : 0;
  return (
    <WorkerCard className="p-5 space-y-3">
      <h2 className="font-semibold">Overtime</h2>
      <p className="text-sm">
        {session
          ? `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m ${session.endedAt ? "recorded" : "live estimate"}`
          : "Your planned workday has finished."}
      </p>
      <p className="text-xs">
        Overtime starts when you confirm. Breaks are excluded. Pay still needs approval.
      </p>
      {!session && !open && (
        <button className="worker-action" disabled={busy} onClick={() => setOpen(true)}>
          Start overtime
        </button>
      )}
      {!session && open && (
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            if (
              await run(
                "start_overtime",
                {
                  id: startId,
                  shiftId: shift.id,
                  expectedEnd: fields.get("expectedEnd"),
                  finishDay,
                },
                "Overtime started from now",
              )
            )
              setOpen(false);
          }}
        >
          <label className="block text-sm">
            Expected overtime finish ({data.company.timezone})
            <input
              name="expectedEnd"
              type="time"
              required
              className="block w-full rounded-xl bg-fill p-3"
            />
          </label>
          <ThemedSelect
            aria-label="Overtime finish day"
            value={finishDay}
            onValueChange={setFinishDay}
          >
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
          </ThemedSelect>
          <p className="text-xs">
            Finish must stay within 24 hours of clock-in. Work location sharing resumes if you
            enabled it.
          </p>
          <button type="submit" className="worker-action" disabled={busy}>
            Confirm overtime from now
          </button>
        </form>
      )}
      {session && !session.endedAt && (
        <button
          className="worker-action"
          disabled={busy}
          onClick={() =>
            void run(
              "finish_overtime",
              { shiftId: shift.id, id: finishId },
              "Overtime ended and clocked out",
            )
          }
        >
          End overtime &amp; clock out
        </button>
      )}
      {session?.reviewStatus === "none" && (
        <details>
          <summary className="text-sm cursor-pointer">
            Started earlier? Request a correction
          </summary>
          <form
            className="mt-3 space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              await run(
                "request_overtime_start",
                {
                  shiftId: shift.id,
                  startedAt: new Date(String(fields.get("startedAt"))).toISOString(),
                  reason: fields.get("reason"),
                },
                "Earlier start sent for review",
              );
            }}
          >
            <label className="block text-sm">
              Actual overtime start (your device timezone)
              <input
                type="datetime-local"
                name="startedAt"
                required
                className="w-full bg-fill rounded-xl p-3"
              />
            </label>
            <textarea
              name="reason"
              aria-label="Earlier overtime reason"
              required
              maxLength={1000}
              placeholder="Explain the earlier start"
              className="w-full bg-fill rounded-xl p-3"
            />
            <button className="worker-action secondary" disabled={busy}>
              Request earlier start
            </button>
          </form>
        </details>
      )}
      {session && session.reviewStatus !== "none" && (
        <p className="text-sm">
          Earlier start: {session.reviewStatus}. Your original tap time remains recorded.
        </p>
      )}
    </WorkerCard>
  );
}
