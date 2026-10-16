import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReportInterpretation } from "../components/app/ReportInterpretation";
const api = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../lib/backend", () => ({ reportInterpretation: api.read }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("labels generated text as a suggestion without offering attendance approval", async () => {
  api.read.mockResolvedValue({
    status: "ready",
    suggestion: {
      summary: "The report states that power failed.",
      questions: ["When was power restored?"],
    },
  });
  render(<ReportInterpretation incidentId="report" />);
  expect(await screen.findByText("The report states that power failed.")).toBeInTheDocument();
  expect(screen.getByText("When was power restored?")).toBeInTheDocument();
  expect(screen.getByText(/No attendance or pay records have changed/)).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("keeps provider failures separate from the original review workflow", async () => {
  api.read.mockRejectedValue(new Error("Unavailable"));
  render(<ReportInterpretation incidentId="report" />);
  expect(
    await screen.findByText(/Your original report and review workflow remain available/),
  ).toBeInTheDocument();
});
