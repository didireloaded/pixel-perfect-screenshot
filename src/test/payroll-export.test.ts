import { describe, it, expect } from "vitest";
import { payrollCsv } from "@/lib/payroll-export";
describe("payroll CSV", () => {
  it("exports integer minutes and escapes names, newlines and spreadsheet formulas", () => {
    const csv = payrollCsv([
      {
        employeeNo: '=HYPERLINK("bad")',
        name: "Last, First\nSecond",
        date: "2026-10-09",
        regularMinutes: 480,
        overtimeMinutes: 15,
        lunchMinutes: 60,
        personalMinutes: 0,
        status: "approved",
      },
    ]);
    expect(csv).toContain("regularMinutes,overtimeMinutes");
    expect(csv).toContain('"480","15"');
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('"Last, First\nSecond"');
  });
});
