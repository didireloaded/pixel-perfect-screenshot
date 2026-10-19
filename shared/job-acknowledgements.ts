export interface JobAcknowledgementData {
  timezone?: string;
  responses: {
    id: string;
    employeeId: string;
    name: string;
    response: "seen" | "available" | "conflict";
    note: string;
    createdAt: string;
  }[];
  reportingTimes: { employeeId: string; date: string; expectedAt: string }[];
}
export type JobAcknowledgementRpc = (
  action: string,
  payload: Record<string, unknown>,
) => Promise<JobAcknowledgementData>;
