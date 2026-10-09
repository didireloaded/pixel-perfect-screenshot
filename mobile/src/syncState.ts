export type QueueStatus = "PENDING" | "IN_FLIGHT" | "SYNCED" | "NEEDS_REVIEW" | "FAILED";
export const retryDelayMs = (attempt: number, jitter = 0) =>
  Math.min(
    30 * 60_000,
    5_000 * 2 ** Math.min(Math.max(0, attempt), 12) + Math.max(0, Math.min(jitter, 5000)),
  );
export function classifySync(result: { status?: string }, temporary = false): QueueStatus {
  if (temporary) return "PENDING";
  if (result.status === "synced") return "SYNCED";
  if (result.status === "needs_review" || result.status === "declined") return "NEEDS_REVIEW";
  return "FAILED";
}
export const syncLabel = (status: QueueStatus, online: boolean) =>
  ({
    PENDING: online ? "Saved on this phone" : "Waiting to sync",
    IN_FLIGHT: "Waiting to sync",
    SYNCED: "Synced",
    NEEDS_REVIEW: "Needs review",
    FAILED: "Needs attention",
  })[status];
