import { expect, it } from "vitest";
import { displayDate, displayInstant } from "../../shared/display-date";
it("formats date-only records without shifting their day", () => {
  expect(displayDate("2026-10-14")).toBe("14 Oct 2026");
  expect(displayDate("2027-01-01")).toBe("1 Jan 2027");
});
it("formats evidence in the company's timezone with 24-hour time", () => {
  expect(displayInstant("2026-10-14T22:30:00Z", "Africa/Windhoek")).toBe("15 Oct 2026, 00:30");
});
