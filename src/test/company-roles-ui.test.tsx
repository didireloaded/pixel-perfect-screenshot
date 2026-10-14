import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ManagerFrame } from "../components/app/ManagerFrame";
import { AccountScreen } from "../components/app/AccountScreen";
const api = vi.hoisted(() => ({ signInWorker: vi.fn().mockResolvedValue(true) }));
vi.mock("../lib/backend", () => ({
  backendMode: "cloud",
  ...api,
  signIn: vi.fn(),
  uploadCompanyLogo: vi.fn(),
  resendConfirmation: vi.fn(),
  resetPassword: vi.fn(),
  updatePassword: vi.fn(),
}));
afterEach(cleanup);
it("shows operations navigation without employee access or company settings", () => {
  render(
    <ManagerFrame active="Overview" accessRole="operations" onSelect={vi.fn()}>
      <p>Operations view</p>
    </ManagerFrame>,
  );
  expect(screen.getByRole("button", { name: "Tasks" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Attendance" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Employee Access" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
  expect(screen.queryByRole("button", { name: "Company settings" })).not.toBeInTheDocument();
});
it("shows HR employee workflows without map navigation", () => {
  render(
    <ManagerFrame active="Overview" accessRole="hr" onSelect={vi.fn()}>
      <p>HR view</p>
    </ManagerFrame>,
  );
  expect(screen.getByRole("button", { name: "Employee Access" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Requests" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Map" })).not.toBeInTheDocument();
});
it("lets promoted staff sign in to the manager app with existing employee credentials", async () => {
  const authenticated = vi.fn().mockResolvedValue(undefined);
  render(
    <AccountScreen
      signed={false}
      error=""
      busy={false}
      onAuthenticated={authenticated}
      command={vi.fn()}
      logout={vi.fn()}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Sign in with employee number and access code" }),
  );
  fireEvent.change(screen.getByLabelText("Employee number"), { target: { value: "SL-123456" } });
  fireEvent.change(screen.getByLabelText("Access code"), { target: { value: "TEST1234" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(api.signInWorker).toHaveBeenCalledWith("SL-123456", "TEST1234"));
  expect(authenticated).toHaveBeenCalledOnce();
});
