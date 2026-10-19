export interface ContactProfile {
  name: string;
  contactPhone: string;
  jobTitle: string;
  bio: string;
}
export interface ProfileChangeData {
  currentProfile: ContactProfile;
  requests: {
    id: string;
    employeeId: string;
    name: string;
    original: ContactProfile;
    proposed: ContactProfile;
    submittedAt: string;
    decision: "pending" | "approved" | "declined";
    reason: string | null;
    reviewedAt: string | null;
    reviewerId: string | null;
  }[];
}
export type ProfileChangeRpc = (
  action: string,
  payload: Record<string, unknown>,
) => Promise<ProfileChangeData>;
