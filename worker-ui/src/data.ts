// ─── Shiftline sample content ──────────────────────────────────────────────
// "Today" in the prototype is Friday, 9 October 2026.

export const COMPANY = "Northstar Operations";

export const EMPLOYEE = {
  name: "Alex Martin",
  first: "Alex",
  initials: "AM",
  number: "EMP-1042",
  dept: "Operations",
  team: "Operations · Day Team",
  site: "Main Office",
  role: "Operations Associate",
  email: "alex.martin@northstar.co",
};

export const TODAY = new Date(2026, 9, 9); // Fri 9 Oct 2026

export const SHIFT = {
  start: "08:00 AM",
  end: "05:00 PM",
  startShort: "08:00",
  endShort: "17:00",
  lunch: "12:00 – 13:00",
  site: "Main Office",
  expected: "8h 00m",
  dateLabel: "Friday, 9 October 2026",
};

// ─── Jobs ──────────────────────────────────────────────────────────────────
export interface TeamMember { initials: string; name: string; role: string }
export interface Job {
  id: string;
  title: string;
  time: string;
  dateLabel: string;
  site: string;
  address: string;
  description: string;
  notes?: string;
  team: TeamMember[];
  tasks: string[];
  bucket: "today" | "upcoming" | "completed";
}

export const JOBS: Job[] = [
  {
    id: "j1",
    title: "Site Inspection",
    time: "14:30 – 15:30",
    dateLabel: "Today · Fri 9 Oct",
    site: "Main Warehouse",
    address: "42 Harbor Industrial Park, Dock Road",
    description:
      "Complete the scheduled quarterly inspection of storage areas B and C. Check racking condition, aisle clearance and fire exit access, and record any issues in the checklist below.",
    notes: "Hi-vis vest and safety shoes required on the warehouse floor.",
    team: [
      { initials: "AM", name: "Alex Martin", role: "Inspector" },
      { initials: "DO", name: "David Okafor", role: "Shift Lead" },
    ],
    tasks: [
      "Check racking condition in area B",
      "Check racking condition in area C",
      "Verify aisle clearance markings",
      "Confirm fire exits are unobstructed",
      "Photograph and log any damage",
    ],
    bucket: "today",
  },
  {
    id: "j2",
    title: "Equipment Delivery",
    time: "16:00 – 16:45",
    dateLabel: "Today · Fri 9 Oct",
    site: "Loading Bay",
    address: "Main Office, Loading Bay 3",
    description:
      "Receive the pallet lifter delivery from Hargrove Equipment. Verify the delivery note against the order, inspect for transport damage and sign off on receipt.",
    team: [
      { initials: "AM", name: "Alex Martin", role: "Receiver" },
      { initials: "PK", name: "Priya Kaur", role: "Logistics" },
    ],
    tasks: [
      "Verify delivery note against order #4418",
      "Inspect equipment for transport damage",
      "Move unit to storage area A",
      "Sign and file the receipt",
    ],
    bucket: "today",
  },
  {
    id: "j3",
    title: "Inventory Count",
    time: "09:00 – 12:00",
    dateLabel: "Mon 12 Oct",
    site: "Main Warehouse",
    address: "42 Harbor Industrial Park, Dock Road",
    description:
      "Assist with the monthly cycle count for fast-moving stock lines. Count sheets will be handed out at the warehouse office at 08:50.",
    team: [
      { initials: "AM", name: "Alex Martin", role: "Counter" },
      { initials: "LB", name: "Lena Brandt", role: "Counter" },
      { initials: "DO", name: "David Okafor", role: "Shift Lead" },
    ],
    tasks: [
      "Collect count sheets from warehouse office",
      "Count zone 1 stock lines",
      "Count zone 2 stock lines",
      "Submit counts for reconciliation",
    ],
    bucket: "upcoming",
  },
  {
    id: "j4",
    title: "Vendor Walkthrough",
    time: "13:30 – 14:30",
    dateLabel: "Tue 13 Oct",
    site: "Main Office",
    address: "Northstar Operations, Main Office",
    description:
      "Accompany the cleaning services vendor on a walkthrough of the office floors ahead of the new contract start.",
    team: [{ initials: "AM", name: "Alex Martin", role: "Host" }],
    tasks: [
      "Meet vendor at reception",
      "Walk floors 1 and 2",
      "Note access requirements",
    ],
    bucket: "upcoming",
  },
  {
    id: "j5",
    title: "Safety Audit Support",
    time: "10:00 – 11:30",
    dateLabel: "Wed 7 Oct",
    site: "Main Office",
    address: "Northstar Operations, Main Office",
    description:
      "Supported the external safety audit of the ground-floor work areas.",
    team: [
      { initials: "AM", name: "Alex Martin", role: "Support" },
      { initials: "SC", name: "Sarah Chen", role: "Operations Manager" },
    ],
    tasks: [
      "Prepare audit documents",
      "Escort auditor through work areas",
      "File signed audit summary",
    ],
    bucket: "completed",
  },
  {
    id: "j6",
    title: "Stock Replenishment",
    time: "14:00 – 16:00",
    dateLabel: "Tue 6 Oct",
    site: "Main Warehouse",
    address: "42 Harbor Industrial Park, Dock Road",
    description: "Replenished pick faces for high-volume lines in area A.",
    team: [{ initials: "AM", name: "Alex Martin", role: "Operator" }],
    tasks: ["Pull replenishment list", "Restock area A pick faces", "Confirm quantities in log"],
    bucket: "completed",
  },
];

// ─── Messages ──────────────────────────────────────────────────────────────
export interface Message {
  id: string;
  sender: string;
  senderRole: string;
  initials: string;
  subject: string;
  preview: string;
  body: string[];
  time: string;
  dateLabel: string;
  unread: boolean;
}

export const MESSAGES: Message[] = [
  {
    id: "m1",
    sender: "Sarah Chen",
    senderRole: "Operations Manager",
    initials: "SC",
    subject: "Schedule update for next week",
    preview: "Quick heads up — your Monday shift now starts at 08:00 instead of 09:00…",
    body: [
      "Hi Alex,",
      "Quick heads up — your Monday shift now starts at 08:00 instead of 09:00, so you can join the inventory count kickoff with the warehouse team.",
      "The updated shift is already in your calendar. Let me know if the earlier start is a problem and we'll sort something out.",
      "Thanks, Sarah",
    ],
    time: "08:12",
    dateLabel: "Today, 08:12",
    unread: true,
  },
  {
    id: "m2",
    sender: "Northstar HR",
    senderRole: "Human Resources",
    initials: "HR",
    subject: "Benefits enrollment closes Friday",
    preview: "A reminder that the annual benefits enrollment window closes this Friday at 17:00…",
    body: [
      "Hello,",
      "A reminder that the annual benefits enrollment window closes this Friday at 17:00. If you have already confirmed your selections, no further action is needed.",
      "Questions can be sent to hr@northstar.co.",
      "Northstar HR",
    ],
    time: "Yesterday",
    dateLabel: "Thu 8 Oct, 16:40",
    unread: true,
  },
  {
    id: "m3",
    sender: "David Okafor",
    senderRole: "Shift Lead",
    initials: "DO",
    subject: "Loading bay access codes",
    preview: "The access code for Loading Bay 3 changed this morning. The new code is posted…",
    body: [
      "Hi Alex,",
      "The access code for Loading Bay 3 changed this morning. The new code is posted in the shift lead office — please pick it up before your delivery job on Friday.",
      "David",
    ],
    time: "Wed",
    dateLabel: "Wed 7 Oct, 11:05",
    unread: false,
  },
  {
    id: "m4",
    sender: "Facilities",
    senderRole: "Main Office",
    initials: "FA",
    subject: "Parking area maintenance",
    preview: "The north parking area will be resurfaced on Saturday. Please use the visitor…",
    body: [
      "Hello,",
      "The north parking area will be resurfaced on Saturday. Please use the visitor parking entrance on Mill Street if you are on site over the weekend.",
      "Facilities Team",
    ],
    time: "Tue",
    dateLabel: "Tue 6 Oct, 09:30",
    unread: false,
  },
];

// ─── Notices ───────────────────────────────────────────────────────────────
export type NoticeKind =
  | "safety"
  | "general"
  | "policy"
  | "holiday"
  | "closure"
  | "maintenance"
  | "earlyrelease";

export interface Notice {
  id: string;
  title: string;
  category: string;
  kind: NoticeKind;
  date: string;
  preview: string;
  body: string[];
  requiresAck: boolean;
  /** ISO-ish key so the notice can surface on the calendar */
  day?: string;
}

export const NOTICES: Notice[] = [
  {
    id: "n1",
    title: "Team Safety Briefing",
    category: "Safety",
    kind: "safety",
    day: "2026-9-12",
    date: "Thu 8 Oct 2026",
    preview: "A mandatory safety briefing will be held on Monday 12 October at 09:00 in Conference Room B…",
    body: [
      "A mandatory safety briefing will be held on Monday 12 October at 09:00 in Conference Room B.",
      "The session covers the updated forklift traffic routes in the Main Warehouse and the new incident reporting steps. It lasts about 30 minutes.",
      "If your shift starts later that day, your attendance for the briefing time will be recorded automatically.",
      "Please acknowledge this notice so we know you have seen it.",
    ],
    requiresAck: true,
  },
  {
    id: "n2",
    title: "Monthly Staff Meeting",
    category: "General",
    kind: "general",
    day: "2026-9-14",
    date: "Tue 6 Oct 2026",
    preview: "October's staff meeting takes place Wednesday 14 October at 15:00 in the Main Office canteen…",
    body: [
      "October's staff meeting takes place Wednesday 14 October at 15:00 in the Main Office canteen.",
      "Agenda: Q4 priorities, warehouse expansion update, and open questions. Coffee and snacks provided.",
    ],
    requiresAck: false,
  },
  {
    id: "n3",
    title: "Updated Attendance Policy",
    category: "Policy",
    kind: "policy",
    date: "Fri 2 Oct 2026",
    preview: "From 1 November, attendance corrections must be submitted within 5 working days…",
    body: [
      "From 1 November, attendance corrections must be submitted within 5 working days of the affected shift.",
      "Corrections are submitted in Shiftline under Hours → Timesheet → Request Correction, and are reviewed by your direct manager.",
      "The full policy document is available from HR on request.",
    ],
    requiresAck: true,
  },
  {
    id: "n4",
    title: "Public Holiday — Facility Closed",
    category: "Closure",
    kind: "closure",
    day: "2026-9-26",
    date: "Thu 8 Oct 2026",
    preview: "The Main Office and Main Warehouse are closed on Monday 26 October for the public holiday…",
    body: [
      "The Main Office and Main Warehouse are closed on Monday 26 October for the public holiday.",
      "No shifts are scheduled and attendance cannot be recorded that day. Holiday pay applies to employees on a standard full-time contract.",
      "The security desk remains staffed. Anyone needing site access should arrange it with Facilities in advance.",
      "Please acknowledge so we know the closure has reached everyone.",
    ],
    requiresAck: true,
  },
  {
    id: "n5",
    title: "Warehouse Floor Maintenance",
    category: "Maintenance",
    kind: "maintenance",
    day: "2026-9-17",
    date: "Wed 7 Oct 2026",
    preview: "Floor resurfacing in warehouse area C takes place Saturday 17 October, 06:00 – 18:00…",
    body: [
      "Floor resurfacing in warehouse area C takes place Saturday 17 October, 06:00 – 18:00.",
      "Area C and the adjacent aisle will be closed to pedestrian and forklift traffic while the work is under way. Pick faces in area C are being relocated to area B for the week.",
      "Saturday shifts are unaffected, but expect rerouted access through the north door.",
    ],
    requiresAck: false,
  },
  {
    id: "n6",
    title: "Early Release — Christmas Eve",
    category: "Early Release",
    kind: "earlyrelease",
    day: "2026-11-24",
    date: "Tue 6 Oct 2026",
    preview: "All sites close at 13:00 on Thursday 24 December. Shifts are shortened and paid in full…",
    body: [
      "All sites close at 13:00 on Thursday 24 December. Shifts are shortened and paid in full, so no hours are lost from your timesheet.",
      "Clock out normally at the earlier time — the system already expects the 13:00 cutoff and will not flag it as a short shift.",
      "Anyone covering the shutdown rota should speak to their shift lead.",
    ],
    requiresAck: false,
  },
];

// ─── Events ────────────────────────────────────────────────────────────────
export interface CompanyEvent {
  id: string;
  name: string;
  date: string;
  time?: string;
  location?: string;
  description: string;
}

export const EVENTS: CompanyEvent[] = [
  {
    id: "e1",
    name: "Team Safety Briefing",
    date: "Mon 12 Oct",
    time: "09:00",
    location: "Conference Room B",
    description: "Mandatory 30-minute briefing on updated warehouse traffic routes.",
  },
  {
    id: "e2",
    name: "Monthly Staff Meeting",
    date: "Wed 14 Oct",
    time: "15:00",
    location: "Main Office Canteen",
    description: "Q4 priorities, warehouse expansion update and open questions.",
  },
  {
    id: "e3",
    name: "Facility Closed — Public Holiday",
    date: "Mon 26 Oct",
    description: "Main Office and Main Warehouse closed. No shifts scheduled.",
  },
  {
    id: "e4",
    name: "Q4 Town Hall",
    date: "Fri 30 Oct",
    time: "14:00",
    location: "Main Office Canteen",
    description: "Company-wide town hall with leadership Q&A.",
  },
  {
    id: "e5",
    name: "Warehouse Floor Maintenance",
    date: "Sat 17 Oct",
    time: "06:00 – 18:00",
    location: "Main Warehouse · Area C",
    description: "Area C closed to traffic while the floor is resurfaced.",
  },
  {
    id: "e6",
    name: "Early Release",
    date: "Thu 24 Dec",
    time: "13:00 cutoff",
    location: "All sites",
    description: "Shortened shifts, paid in full. Clock out normally at 13:00.",
  },
];

// ─── Notifications ─────────────────────────────────────────────────────────
export interface Notif {
  id: string;
  icon: "shift" | "job" | "leave" | "timesheet" | "notice" | "message" | "alert" | "sync";
  title: string;
  desc: string;
  time: string;
  group: "Today" | "Yesterday" | "Earlier";
  target?: { kind: "job" | "notice" | "message" | "request" | "hours" | "calendar"; id?: string };
}

export const NOTIFICATIONS: Notif[] = [
  {
    id: "nt9",
    icon: "alert",
    title: "Missing clock-out on Fri 2 Oct",
    desc: "That day is still open and its hours are provisional · Report a correction",
    time: "07:05",
    group: "Today",
    target: { kind: "hours", id: "s-1002" },
  },
  {
    id: "nt10",
    icon: "shift",
    title: "Your Monday shift changed",
    desc: "Now 08:00 – 17:00 (was 09:00 – 18:00) · Main Office",
    time: "06:50",
    group: "Today",
    target: { kind: "calendar" },
  },
  {
    id: "nt11",
    icon: "sync",
    title: "Sync conflict on your clock-in",
    desc: "The kiosk recorded 08:01, your phone recorded 08:02 · Needs review",
    time: "18:20",
    group: "Yesterday",
    target: { kind: "hours", id: "s-1002" },
  },
  {
    id: "nt12",
    icon: "job",
    title: "Site Inspection starts in 30 minutes",
    desc: "14:30 · Main Warehouse, 42 Harbor Industrial Park",
    time: "14:00",
    group: "Today",
    target: { kind: "job", id: "j1" },
  },
  {
    id: "nt1",
    icon: "job",
    title: "A new job has been assigned to you",
    desc: "Equipment Delivery · Today 16:00, Loading Bay",
    time: "07:45",
    group: "Today",
    target: { kind: "job", id: "j2" },
  },
  {
    id: "nt2",
    icon: "shift",
    title: "Your shift for Monday has been assigned",
    desc: "Mon 12 Oct · 08:00 – 17:00 at Main Office",
    time: "07:30",
    group: "Today",
    target: { kind: "calendar" },
  },
  {
    id: "nt3",
    icon: "leave",
    title: "Your leave request has been approved",
    desc: "Annual leave · 22 – 23 Oct, approved by Sarah Chen",
    time: "17:12",
    group: "Yesterday",
    target: { kind: "request", id: "r1" },
  },
  {
    id: "nt4",
    icon: "timesheet",
    title: "Your timesheet is ready for review",
    desc: "Wed 7 Oct · 8h 35m recorded",
    time: "09:04",
    group: "Yesterday",
    target: { kind: "hours" },
  },
  {
    id: "nt5",
    icon: "notice",
    title: "New company notice",
    desc: "Updated Attendance Policy — acknowledgement required",
    time: "Fri 2 Oct",
    group: "Earlier",
    target: { kind: "notice", id: "n3" },
  },
  {
    id: "nt6",
    icon: "message",
    title: "New message from David Okafor",
    desc: "Loading bay access codes",
    time: "Wed 7 Oct",
    group: "Earlier",
    target: { kind: "message", id: "m3" },
  },
  {
    id: "nt7",
    icon: "notice",
    title: "Public holiday — facility closed",
    desc: "Mon 26 Oct · No shifts scheduled, acknowledgement required",
    time: "Thu 8 Oct",
    group: "Earlier",
    target: { kind: "notice", id: "n4" },
  },
  {
    id: "nt8",
    icon: "notice",
    title: "Warehouse floor maintenance",
    desc: "Sat 17 Oct · Area C closed 06:00 – 18:00",
    time: "Wed 7 Oct",
    group: "Earlier",
    target: { kind: "notice", id: "n5" },
  },
];

// ─── Requests ──────────────────────────────────────────────────────────────
export interface RequestItem {
  id: string;
  type: "Leave Request" | "Attendance Correction" | "Overtime Request" | "Timesheet Submission";
  title: string;
  desc: string;
  submitted: string;
  status: "Pending" | "Approved" | "Declined";
  detail: string[];
  decision?: string;
}

export const INITIAL_REQUESTS: RequestItem[] = [
  {
    id: "r1",
    type: "Leave Request",
    title: "Annual Leave · 22 – 23 Oct",
    desc: "2 days · Family visit",
    submitted: "Mon 5 Oct 2026",
    status: "Approved",
    detail: [
      "Leave type: Annual leave",
      "Dates: Thu 22 Oct – Fri 23 Oct 2026 (2 days)",
      "Reason: Family visit",
    ],
    decision: "Approved by Sarah Chen on 8 Oct. Enjoy the time off!",
  },
  {
    id: "r2",
    type: "Attendance Correction",
    title: "Clock-out fix · Tue 29 Sep",
    desc: "17:04 → 17:45 · Stayed for delivery",
    submitted: "Wed 30 Sep 2026",
    status: "Approved",
    detail: [
      "Shift: Tue 29 Sep · 08:00 – 17:00",
      "Event: Clock out",
      "Recorded: 17:04 · Proposed: 17:45",
      "Reason: Stayed late to receive a delayed delivery",
    ],
    decision: "Approved by Sarah Chen on 1 Oct. Timesheet updated.",
  },
  {
    id: "r3",
    type: "Leave Request",
    title: "Sick Leave · 18 Sep",
    desc: "1 day · Illness",
    submitted: "Fri 18 Sep 2026",
    status: "Declined",
    detail: [
      "Leave type: Sick leave",
      "Dates: Fri 18 Sep 2026 (1 day)",
      "Reason: Illness",
    ],
    decision: "Declined — recorded as sickness absence instead of leave, no leave balance was used.",
  },
];

// ─── Hours / timesheets ────────────────────────────────────────────────────
export interface PayPeriod {
  id: string;
  label: string;
  total: string;
  regular: string;
  overtime: string;
  breaks: string;
  status: string;
}

export const PAY_PERIODS: PayPeriod[] = [
  {
    id: "p1",
    label: "16 Sep – 15 Oct 2026",
    total: "142h 30m",
    regular: "136h 00m",
    overtime: "6h 30m",
    breaks: "17h 00m",
    status: "Open",
  },
  {
    id: "p2",
    label: "16 Aug – 15 Sep 2026",
    total: "168h 15m",
    regular: "160h 00m",
    overtime: "8h 15m",
    breaks: "21h 00m",
    status: "Approved",
  },
  {
    id: "p3",
    label: "16 Jul – 15 Aug 2026",
    total: "152h 00m",
    regular: "152h 00m",
    overtime: "0h 00m",
    breaks: "19h 00m",
    status: "Locked",
  },
];

// NOTE: hardcoded per-day timesheet strings (THIS_WEEK / TIMESHEETS) were
// removed. Per-shift worked time, regular hours, unpaid breaks and overtime are
// now derived by src/calc/overtime.ts from the event logs in
// src/demo/shiftRecords.ts, so there is a single source for those numbers.

// ─── Job supervisors ───────────────────────────────────────────────────────
export const JOB_SUPERVISOR: Record<string, { name: string; role: string; initials: string }> = {
  j1: { name: "David Okafor", role: "Shift Lead", initials: "DO" },
  j2: { name: "Priya Kaur", role: "Logistics Supervisor", initials: "PK" },
  j3: { name: "David Okafor", role: "Shift Lead", initials: "DO" },
  j4: { name: "Sarah Chen", role: "Operations Manager", initials: "SC" },
  j5: { name: "Sarah Chen", role: "Operations Manager", initials: "SC" },
  j6: { name: "David Okafor", role: "Shift Lead", initials: "DO" },
};

// ─── Registered devices ────────────────────────────────────────────────────
export interface Device {
  id: string;
  name: string;
  detail: string;
  lastSeen: string;
  current: boolean;
}

export const DEVICES: Device[] = [
  { id: "d1", name: "iPhone 17 Pro", detail: "Shiftline for iOS · v2.4.1", lastSeen: "Now · Main Office", current: true },
  { id: "d2", name: "iPad (Warehouse)", detail: "Shared floor device · v2.3.0", lastSeen: "Mon 5 Oct, 16:12", current: false },
];

// NOTE: the static OVERTIME list was removed. Overtime now lives as
// `OvertimeClaim`s attached to shift records and is derived/validated by
// src/calc/overtime.ts, so requested, pending, approved and declined amounts
// can never disagree with the recorded time.

// ─── Calendar helpers ──────────────────────────────────────────────────────
export interface DayInfo {
  hasShift: boolean;
  shift?: string;
  site?: string;
  lunch?: string;
  jobs: { title: string; time: string; site: string }[];
  leave?: string;
  event?: string;
  approved?: boolean;
  notices: Notice[];
}

const LEAVE_DAYS = new Set(["2026-9-22", "2026-9-23"]); // month index 9 = Oct
const HOLIDAYS = new Set(["2026-9-26"]);
const EVENT_DAYS: Record<string, string> = {
  "2026-9-12": "Team Safety Briefing · 09:00",
  "2026-9-14": "Monthly Staff Meeting · 15:00",
  "2026-9-17": "Warehouse Floor Maintenance · 06:00 – 18:00",
  "2026-9-26": "Facility Closed — Public Holiday",
  "2026-9-30": "Q4 Town Hall · 14:00",
  "2026-11-24": "Early Release — 13:00 cutoff",
};
const JOB_DAYS: Record<string, { title: string; time: string; site: string }[]> = {
  "2026-9-9": [
    { title: "Site Inspection", time: "14:30 – 15:30", site: "Main Warehouse" },
    { title: "Equipment Delivery", time: "16:00 – 16:45", site: "Loading Bay" },
  ],
  "2026-9-12": [{ title: "Inventory Count", time: "09:00 – 12:00", site: "Main Warehouse" }],
  "2026-9-13": [{ title: "Vendor Walkthrough", time: "13:30 – 14:30", site: "Main Office" }],
  "2026-9-7": [{ title: "Safety Audit Support", time: "10:00 – 11:30", site: "Main Office" }],
  "2026-9-6": [{ title: "Stock Replenishment", time: "14:00 – 16:00", site: "Main Warehouse" }],
};

export function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function getDayInfo(d: Date): DayInfo {
  const key = dayKey(d);
  const dow = d.getDay();
  const isWeekend = dow === 0 || dow === 6;
  const isHoliday = HOLIDAYS.has(key);
  const isLeave = LEAVE_DAYS.has(key);
  const hasShift = !isWeekend && !isHoliday && !isLeave;
  const isPast = d.getTime() < TODAY.getTime();
  return {
    hasShift,
    shift: hasShift ? "08:00 – 17:00" : undefined,
    site: hasShift ? "Main Office" : undefined,
    lunch: hasShift ? "12:00 – 13:00" : undefined,
    jobs: JOB_DAYS[key] ?? [],
    leave: isLeave ? "Annual Leave · Approved" : undefined,
    event: EVENT_DAYS[key],
    approved: hasShift && isPast,
    notices: NOTICES.filter((n) => n.day === key),
  };
}

export const WEEK_STRIP = [5, 6, 7, 8, 9, 10, 11].map((n) => new Date(2026, 9, n));

// ─── FAQ ───────────────────────────────────────────────────────────────────
export const FAQ = [
  {
    q: "How do I fix a wrong clock-in or clock-out?",
    a: "Open Hours, select the affected timesheet and tap Request Correction. Your manager reviews the proposed change and you'll get a notification with the decision.",
  },
  {
    q: "Why does Shiftline check my location?",
    a: "Location is only checked at the moment you clock in or out, to confirm you're at your assigned worksite. Shiftline does not track your location in the background.",
  },
  {
    q: "What happens if I forget to clock out?",
    a: "Your shift stays open. Clock out as soon as you notice, then submit an attendance correction with the correct end time.",
  },
  {
    q: "How do I request time off?",
    a: "Go to Profile → My Requests → Request Leave, choose the dates and leave type, and submit. You'll be notified when it's decided.",
  },
  {
    q: "Can I use Shiftline without a connection?",
    a: "Yes. Clock events are saved on your phone and marked 'Waiting to sync'. They upload automatically when you're back online.",
  },
];

// ─── Pay rates (demo configuration) ────────────────────────────────────────
export const PAY_RATES = {
  currency: "£",
  regular: 18.5,
  overtimeMultiplier: 1.5,
  /** Overtime rate, derived — never hardcoded separately. */
  get overtime() {
    return this.regular * this.overtimeMultiplier;
  },
  periodLocked: false,
};

// ─── Leave balance (demo, once company leave rules are configured) ─────────
export const LEAVE_BALANCE = {
  entitlementDays: 25,
  takenDays: 3,
  pendingDays: 2,
  get remainingDays() {
    return this.entitlementDays - this.takenDays - this.pendingDays;
  },
  upcoming: [
    { id: "lv1", label: "Thu 22 – Fri 23 Oct 2026", type: "Annual leave", days: 2, status: "Approved" },
  ],
  note: "Northstar Operations configures leave rules. Your balance updates when a manager approves or declines a request.",
};

// ─── What "done" means, per job ────────────────────────────────────────────
export const JOB_DONE: Record<string, string[]> = {
  j1: [
    "All five checklist steps ticked",
    "Any damage photographed and logged",
    "Signed inspection sheet left with the shift lead",
  ],
  j2: [
    "Delivery note matches order #4418",
    "Unit moved to storage area A",
    "Receipt signed and filed",
  ],
  j3: ["Both zones counted", "Counts submitted for reconciliation"],
  j4: ["Floors 1 and 2 walked", "Access requirements noted and sent to Facilities"],
  j5: ["Audit summary signed and filed"],
  j6: ["Pick faces restocked", "Quantities confirmed in the log"],
};

// ─── Blocker categories ────────────────────────────────────────────────────
export const BLOCKER_CATEGORIES = [
  { id: "access", label: "No access", hint: "Door, gate, key fob or code" },
  { id: "equipment", label: "Missing equipment", hint: "Tools, PPE or a vehicle" },
  { id: "safety", label: "Safety concern", hint: "Stop work and report immediately" },
  { id: "power", label: "Power or network outage", hint: "No lighting, power or signal" },
  { id: "other", label: "Something else", hint: "Describe it below" },
] as const;

// ─── Shift change (stated, not inferred) ───────────────────────────────────
export const SHIFT_CHANGE = {
  id: "sc1",
  dateLabel: "Mon 12 Oct",
  before: "09:00 – 18:00 · Main Office",
  after: "08:00 – 17:00 · Main Office",
  changedBy: "Sarah Chen",
  reason: "Inventory count kickoff moved an hour earlier",
};

// ─── Team contact options ──────────────────────────────────────────────────
export const TEAM_CONTACT: Record<string, { phone: string; email: string }> = {
  DO: { phone: "+44 7700 900142", email: "david.okafor@northstar.co" },
  SC: { phone: "+44 7700 900087", email: "sarah.chen@northstar.co" },
  PK: { phone: "+44 7700 900215", email: "priya.kaur@northstar.co" },
  LB: { phone: "+44 7700 900338", email: "lena.brandt@northstar.co" },
  AM: { phone: "+44 7700 900104", email: "alex.martin@northstar.co" },
};
