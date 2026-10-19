export interface AttendanceContextData {
  exceptions: {
    id: string;
    employee_id: string | null;
    work_date: string;
    kind: string;
    starts_at: string | null;
    ends_at: string | null;
    reason: string;
  }[];
  explanations: {
    id: string;
    employee_id: string;
    record_id: string | null;
    shift_id: string | null;
    description: string;
    status: string;
    review_reason: string | null;
  }[];
  issues: { key: string; recordId?: string; shiftId?: string; employeeId: string; kind: string }[];
}
