// DEV-only, read-only visual fixtures. These records never replace a signed-in snapshot.
import type { AttendanceSnapshot, AttendanceState, Totals } from "../../../shared/attendance";
const totals: Totals = {
  recordedSeconds: 0,
  regularSeconds: 0,
  overtimeSecondsApproved: 0,
  overtimeSecondsPending: 0,
  paidBreakSeconds: 0,
  unpaidBreakSeconds: 0,
  personalSeconds: 0,
  payableSeconds: 0,
  policyVersion: 1,
  workedMinutes: 0,
  recordedMinutes: 0,
  regularMinutes: 0,
  overtimeMinutes: 0,
  unapprovedOvertimeMinutes: 0,
  lunchMinutes: 0,
  personalMinutes: 0,
  missingClockOut: false,
  complete: false,
};
export function designPreview(state: AttendanceState = "not_clocked_in"): AttendanceSnapshot {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Windhoek",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const date = (offset: number) => {
    const day = new Date(`${today}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() + offset);
    return day.toISOString().slice(0, 10);
  };
  const shifts = Array.from({ length: 6 }, (_, i) => ({
    id: `preview-shift-${i}`,
    employeeId: "worker",
    date: date(-i),
    start: "08:00",
    end: "17:00",
    lunch: "12:00",
    lunchMinutes: 60,
    trackingStop: "17:00",
    siteId: "office",
    regularMinutes: 480,
    totals:
      i === 0
        ? { ...totals }
        : {
            ...totals,
            workedMinutes: 480,
            recordedMinutes: 480,
            regularMinutes: 480,
            recordedSeconds: 28800,
            regularSeconds: 28800,
            lunchMinutes: 60,
            unpaidBreakSeconds: 3600,
            complete: true,
          },
  }));
  const events = shifts.slice(1).flatMap((shift, i) => [
    {
      id: `in-${i}`,
      shiftId: shift.id,
      employeeId: "worker",
      type: "clock_in" as const,
      capturedAt: Date.parse(`${shift.date}T08:0${i}:00+02:00`),
      sync: "synced" as const,
    },
    {
      id: `out-${i}`,
      shiftId: shift.id,
      employeeId: "worker",
      type: "clock_out" as const,
      capturedAt: Date.parse(`${shift.date}T17:00:00+02:00`),
      sync: "synced" as const,
    },
  ]);
  if (state !== "not_clocked_in")
    events.push({
      id: "current-in",
      shiftId: shifts[0]!.id,
      employeeId: "worker",
      type: "clock_in",
      capturedAt: Date.now() - 8400000,
      sync: "synced",
    });
  return {
    me: "worker",
    role: "employee",
    company: { id: "preview", name: "Project Inc.", timezone: "Africa/Windhoek" },
    today,
    employees: [
      {
        id: "worker",
        no: "PI-024",
        name: "Darrell Steward",
        team: "Operations",
        siteId: "office",
        role: "employee",
        activated: true,
        payrollAdmin: false,
      },
      {
        id: "manager",
        no: "PI-001",
        name: "Alex Morgan",
        team: "Management",
        siteId: "office",
        role: "manager",
        activated: true,
        payrollAdmin: false,
      },
    ],
    sites: [
      {
        id: "office",
        name: "Main Office",
        address: "Central office",
        geofenceMode: "notify",
        latitude: null,
        longitude: null,
        radiusM: 100,
        maxAccuracyM: 50,
      },
    ],
    shifts,
    events,
    jobs: [
      {
        id: "job-1",
        shiftId: shifts[0]!.id,
        title: "Site safety inspection",
        instructions:
          "Check access points and complete the safety checklist before the afternoon handover.",
        date: today,
        start: "14:00",
        end: "15:30",
        destination: "Main Office",
        supervisor: "Alex Morgan",
        status: "assigned",
        assignee: "worker",
      },
      {
        id: "job-2",
        shiftId: shifts[1]!.id,
        title: "Equipment handover",
        instructions: "Confirm equipment condition and record the handover.",
        date: date(-1),
        start: "10:00",
        end: "11:30",
        destination: "Workshop",
        supervisor: "Alex Morgan",
        status: "completed",
        assignee: "worker",
      },
    ],
    requests: [],
    audit: [],
    timesheets: shifts
      .slice(1)
      .map((shift) => ({
        shiftId: shift.id,
        employeeId: "worker",
        date: shift.date,
        status: "approved",
        overtimeRequested: 0,
        overtimeApproved: 0,
        overtimeStatus: "none",
      })),
    periods: [],
    payrollAdmin: false,
    policy: {
      company_id: "preview",
      version: 1,
      require_face_match: false,
      require_gps_stamp: false,
      enforce_geofence: false,
      allow_offline_clockin: false,
      require_approval_for_departure: false,
      require_two_level_correction_approval: false,
      lunch_paid: false,
      created_at: new Date().toISOString(),
    },
    policyHistory: [],
    states: [{ shiftId: shifts[0]!.id, employeeId: "worker", state }],
    devices: [],
    submissions: [],
    corrections: [],
    setup: [],
    notices: [
      {
        id: "notice-1",
        kind: "announcement",
        title: "Monday’s team briefing",
        body: "Meet in the main office at 08:30 for the weekly safety briefing.",
        startsOn: today,
        endsOn: date(3),
        requiresAck: true,
        acknowledged: false,
        createdAt: new Date().toISOString(),
      },
    ],
    siteAlerts: [],
    payRates: [],
    grossRuns: [],
    messages: [
      {
        id: "message-1",
        threadId: "message-1",
        senderId: "manager",
        recipientId: "worker",
        senderName: "Alex Morgan",
        title: "Afternoon assignment",
        body: "The safety checklist is ready. Please check in with the site team before you start.",
        sentAt: new Date().toISOString(),
        readAt: null,
      },
    ],
    jobSteps: [
      {
        id: "step-1",
        jobId: "job-1",
        label: "Inspect access points",
        sortOrder: 0,
        completedAt: null,
      },
      {
        id: "step-2",
        jobId: "job-1",
        label: "Complete safety checklist",
        sortOrder: 1,
        completedAt: null,
      },
    ],
    jobTeam: [
      { jobId: "job-1", employeeId: "worker", name: "Darrell Steward", team: "Operations" },
    ],
    jobComments: [],
    managerNotes: [],
    sitePresence: [],
    readRequestIds: [],
  };
}
