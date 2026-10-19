export interface LeaveChange {
  id: string;
  employee_id: string;
  request_id: string;
  kind: "cancel" | "amend";
  explanation: string;
  leave_start: string | null;
  leave_end: string | null;
  leave_start_time: string | null;
  leave_end_time: string | null;
  status: "pending" | "approved" | "declined";
  review_reason: string | null;
  requested_at: string;
  replacement_id: string | null;
}
export interface LeaveChangesResponse {
  changes: LeaveChange[];
}
export type LeaveChangesRpc = (
  action: string,
  payload: Record<string, unknown>,
) => Promise<LeaveChangesResponse>;
export interface LeaveChangeRequest {
  id: string;
  summary: string;
  status: string;
  leaveStart?: string | null;
  leaveEnd?: string | null;
  kind: string;
}
