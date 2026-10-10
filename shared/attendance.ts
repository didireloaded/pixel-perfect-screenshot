export type AttendanceState =
  "not_clocked_in" | "working" | "on_lunch" | "on_job" | "on_personal" | "clocked_out";

export type EventType =
  | "clock_in"
  | "start_lunch"
  | "end_lunch"
  | "start_job"
  | "end_job"
  | "start_personal"
  | "end_personal"
  | "clock_out";

export type SyncStatus = "saved_on_phone" | "waiting_to_sync" | "synced" | "needs_review";

export interface AttendanceEvent {
  id: string; // client-generated, used for de-duplication
  employeeId: string;
  shiftId?: string;
  type: EventType;
  capturedAt: number; // device clock
  receivedAt?: number | undefined; // server receipt
  sync: SyncStatus;
  jobId?: string;
  note?: string;
}

export type LocationStatus = "inactive" | "active" | "paused" | "unavailable";
export type RequestStatus = "pending" | "approved" | "declined";
export type RequestKind =
  "leave" | "personal_departure" | "missing_clocking" | "correction" | "emergency";
export interface Employee {
  id: string;
  no: string;
  name: string;
  team: string;
  siteId: string;
  role: string;
  activated: boolean;
  payrollAdmin: boolean;
}
export interface Site {
  id: string;
  name: string;
  address: string;
  geofenceMode: GeofenceMode;
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  maxAccuracyM: number;
}
export interface Totals {
  recordedSeconds: number;
  regularSeconds: number;
  overtimeSecondsApproved: number;
  overtimeSecondsPending: number;
  paidBreakSeconds: number;
  unpaidBreakSeconds: number;
  personalSeconds: number;
  payableSeconds: number;
  policyVersion: number;
  workedMinutes: number;
  recordedMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  unapprovedOvertimeMinutes: number;
  lunchMinutes: number;
  personalMinutes: number;
  missingClockOut: boolean;
  complete: boolean;
}
export interface Shift {
  id: string;
  employeeId: string;
  date: string;
  start: string;
  end: string;
  lunch: string;
  lunchMinutes: number;
  trackingStop: string;
  siteId: string;
  regularMinutes: number;
  totals: Totals;
}
export interface Job {
  id: string;
  shiftId: string;
  title: string;
  instructions: string;
  date: string;
  start: string;
  end: string;
  destination: string;
  supervisor: string;
  status: "assigned" | "in_progress" | "completed";
  assignee: string;
}
export interface Req {
  id: string;
  employeeId: string;
  kind: RequestKind;
  summary: string;
  detail?: string | undefined;
  submittedAt: number;
  status: RequestStatus;
  reviewer?: string;
  reason?: string;
  approvalRequired: boolean;
  expectedReturn?: string | undefined;
}
export interface Audit {
  id: string;
  at: number;
  actor: string;
  action: string;
  detail: string;
}
export interface Timesheet {
  shiftId: string;
  employeeId: string;
  date: string;
  status: "open" | "submitted" | "approved";
  overtimeRequested: number;
  overtimeApproved: number;
  overtimeStatus: "none" | "pending" | "approved" | "declined";
}
export interface Period {
  id: string;
  start: string;
  end: string;
  lockedAt: string;
}
export interface AttendanceSnapshot {
  me: string;
  role: "manager" | "employee";
  company: { id: string; name: string; timezone: string };
  today: string;
  employees: Employee[];
  sites: Site[];
  shifts: Shift[];
  events: AttendanceEvent[];
  jobs: Job[];
  requests: Req[];
  audit: Audit[];
  timesheets: Timesheet[];
  periods: Period[];
  payrollAdmin: boolean;
  policy: CompanyPolicy;
  policyHistory: CompanyPolicy[];
  states: { shiftId: string; employeeId: string; state: AttendanceState }[];
  devices: Device[];
  submissions: Submission[];
  corrections: Correction[];
  setup: SetupStep[];
  notices: CompanyNotice[];
  siteAlerts: SiteAlert[];
  payRates: PayRate[];
  grossRuns: GrossRun[];
  messages: DirectMessage[];
  jobSteps: JobStep[];
  jobTeam: JobTeamMember[];
  jobComments: JobComment[];
  managerNotes: ManagerNote[];
  sitePresence: SitePresence[];
  readRequestIds: string[];
  onboarding?: boolean;
}

export interface CompanyNotice {
  id: string;
  kind: "holiday" | "closure" | "early_release" | "announcement" | "event";
  title: string;
  body: string;
  startsOn: string;
  endsOn: string;
  requiresAck: boolean;
  acknowledged: boolean;
  createdAt: string;
  startsTime?: string | null;
}
export interface DirectMessage {
  id: string;
  threadId: string;
  senderId: string;
  recipientId: string;
  senderName: string;
  title: string;
  body: string;
  sentAt: string;
  readAt: string | null;
}
export interface JobStep {
  id: string;
  jobId: string;
  label: string;
  sortOrder: number;
  completedAt: string | null;
}
export interface JobTeamMember {
  jobId: string;
  employeeId: string;
  name: string;
  team: string;
}
export interface SiteAlert {
  id: string;
  employeeId: string;
  shiftId: string;
  kind: "exit" | "return";
  distanceM: number;
  accuracyM: number;
  observedAt: string;
  source: "web" | "native";
}
export interface PayRate {
  id: string;
  employeeId: string;
  effectiveOn: string;
  currency: string;
  hourlyMinor: number;
  overtimeMultiplierBp: number;
}
export interface GrossRow {
  employee_number: string;
  shift_date: string;
  regular_seconds: number;
  overtime_seconds_approved: number;
  hourly_rate_minor: number;
  overtime_multiplier_bp: number;
  currency: string;
  gross_minor: number;
}
export interface GrossRun {
  id: string;
  periodId: string;
  createdAt: string;
  rows: GrossRow[];
}

export type GeofenceMode = "validate" | "notify" | "auto_suggest";
export interface CompanyPolicy {
  company_id: string;
  version: number;
  require_face_match: false;
  require_gps_stamp: boolean;
  enforce_geofence: boolean;
  allow_offline_clockin: boolean;
  require_approval_for_departure: boolean;
  require_two_level_correction_approval: boolean;
  lunch_paid: boolean;
  created_at: string;
}
export interface Device {
  id: string;
  company_id: string;
  employee_id: string;
  client_type: "personal" | "kiosk";
  platform: "ios" | "android" | "web";
  revoked: boolean;
}
export interface LocationEvidence {
  latitude: number;
  longitude: number;
  accuracyM: number;
}
export interface AttendanceIntent {
  id: string;
  type: EventType;
  shiftId: string;
  capturedAt: string;
  deviceId: string;
  offline: boolean;
  location: LocationEvidence | null;
  jobId?: string;
  note?: string;
  reason?: string;
  expectedReturn?: string;
}
export interface Submission {
  id: string;
  employee_id: string;
  shift_id: string;
  device_id: string | null;
  payload: AttendanceIntent;
  captured_at: string;
  received_at: string;
  status: "synced" | "needs_review" | "declined";
  reason: string | null;
  warning: string | null;
  canonical_event_id: string | null;
}
export interface Correction {
  submission_id: string | null;
  id: string;
  employee_id: string;
  shift_id: string;
  event_id: string | null;
  event_type: EventType;
  original_value: { capturedAt: string; type: EventType } | null;
  replacement_value: { capturedAt: string };
  reason: string;
  actor: string;
  status: "pending_manager" | "pending_payroll" | "approved" | "declined";
  approved_by_level_1: string | null;
  approved_by_level_2: string | null;
  approved_at: string | null;
  decision_reason: string | null;
}
export interface SetupStep {
  id: string;
  label: string;
  complete: boolean;
}
export const PAYROLL_COLUMNS = [
  "employee_number",
  "pay_period_start",
  "pay_period_end",
  "regular_seconds",
  "overtime_seconds_approved",
  "overtime_seconds_pending",
  "paid_break_seconds",
  "unpaid_break_seconds",
  "payable_seconds",
  "policy_version",
  "approved_by",
  "approved_at",
] as const;
export type PayrollRow = Record<(typeof PAYROLL_COLUMNS)[number], string | number>;
export const SYNC_LABELS = {
  PENDING: "Saved on this phone",
  IN_FLIGHT: "Waiting to sync",
  SYNCED: "Synced",
  NEEDS_REVIEW: "Needs review",
  FAILED: "Needs attention",
} as const;

export interface JobComment { id: string; jobId: string; authorId: string; authorName: string; body: string; createdAt: string; }
export interface ManagerNote { id: string; title: string; body: string; authorName: string; createdAt: string; }
export interface SitePresence { employeeId: string; siteId: string; shiftId: string; inside: boolean; checkedAt: string; }
