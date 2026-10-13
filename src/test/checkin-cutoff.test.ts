import { expect, it } from "vitest";
import { checkinClosed } from "../../shared/checkin-cutoff";
it("closes exactly at company knock-off time in its timezone", () => {
  expect(checkinClosed("Africa/Windhoek", "17:00", Date.parse("2026-10-14T14:59:59Z"))).toBe(false);
  expect(checkinClosed("Africa/Windhoek", "17:00", Date.parse("2026-10-14T15:00:00Z"))).toBe(true);
  expect(checkinClosed("Africa/Windhoek", "18:00", Date.parse("2026-10-14T15:00:00Z"))).toBe(false);
  expect(checkinClosed("Africa/Windhoek", "17:00", Date.parse("2026-10-14T22:00:00Z"))).toBe(false);
});
