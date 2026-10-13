import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ManagerMessages } from "../components/app/TeamComms";
const { command } = vi.hoisted(() => ({ command: vi.fn() }));
vi.mock("../lib/app-store", () => ({
  useAttendance: () => ({
    me: "manager",
    online: true,
    busy: false,
    command,
    employees: [{ id: "worker", name: "Worker", role: "employee" }],
    messages: [
      {
        id: "thread",
        threadId: "thread",
        senderId: "manager",
        recipientId: "worker",
        title: "Site",
        body: "Hello",
        sentAt: "2026-10-13T08:00:00Z",
      },
      ...[1, 2].map((id) => ({
        id: `reply-${id}`,
        threadId: "thread",
        senderId: "worker",
        recipientId: "manager",
        body: `Reply ${id}`,
        sentAt: `2026-10-13T08:0${id}:00Z`,
      })),
    ],
  }),
}));
beforeEach(() => command.mockReset());
it("waits for each read receipt before saving the next", async () => {
  let release: (value: object) => void = () => {};
  command
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValue({});
  render(<ManagerMessages />);
  fireEvent.click(screen.getByRole("button", { name: /Worker 2/ }));
  expect(command).toHaveBeenCalledTimes(1);
  expect(command).toHaveBeenNthCalledWith(1, "read_message", { id: "reply-1" });
  release({});
  await waitFor(() => expect(command).toHaveBeenCalledTimes(2));
  expect(command).toHaveBeenNthCalledWith(2, "read_message", { id: "reply-2" });
});
it("stops receipts after a failed save", async () => {
  command.mockResolvedValue(null);
  render(<ManagerMessages />);
  fireEvent.click(screen.getByRole("button", { name: /Worker 2/ }));
  await waitFor(() => expect(command).toHaveBeenCalledTimes(1));
});
