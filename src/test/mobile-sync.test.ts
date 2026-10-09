import { describe, it, expect } from "vitest";
import { retryDelayMs, classifySync, syncLabel } from "../../mobile/src/syncState";
import { PAYROLL_COLUMNS } from "../../shared/attendance";
import { payrollCsv } from "@/lib/payroll-export";
describe("native sync contract", () => {
  it("keeps failures pending and separates review from accepted attendance", () => {
    expect(classifySync({}, true)).toBe("PENDING");
    expect(classifySync({ status: "needs_review" })).toBe("NEEDS_REVIEW");
    expect(classifySync({ status: "synced" })).toBe("SYNCED");
    expect(classifySync({})).toBe("FAILED");
  });
  it("caps backoff including jitter and shows honest offline labels", () => {
    expect(retryDelayMs(0)).toBe(5000);
    expect(retryDelayMs(99, 5000)).toBe(1800000);
    expect(syncLabel("PENDING", false)).toBe("Waiting to sync");
    expect(syncLabel("PENDING", true)).toBe("Saved on this phone");
    expect(syncLabel("NEEDS_REVIEW", true)).toBe("Needs review");
  });
  it("exports the exact approved-seconds column contract", () => {
    const row = Object.fromEntries(
      PAYROLL_COLUMNS.map((c) => [c, c.includes("seconds") ? 90 : "test"]),
    );
    const csv = payrollCsv([row]);
    expect(csv.split("\r\n")[0]).toBe(PAYROLL_COLUMNS.join(","));
    expect(csv).toContain('"90"');
  });
});
