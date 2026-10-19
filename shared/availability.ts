export interface AvailabilityPreference {
  id: string;
  employee_id: string;
  availability: "available" | "unavailable";
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string;
  created_at: string;
  withdrawn_at: string | null;
}
export interface AvailabilityResponse {
  availability: AvailabilityPreference[];
}
export type AvailabilityRpc = (
  action: string,
  payload: Record<string, unknown>,
) => Promise<AvailabilityResponse>;
