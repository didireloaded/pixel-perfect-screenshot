import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateAccount, AccessWaiting, SignIn } from "../../worker-ui/src/screens/Auth";
const api = vi.hoisted(() => ({
  registerWorker: vi.fn(),
  signInWorker: vi.fn(),
  snapshot: vi.fn(),
  signOut: vi.fn(),
}));
const state = vi.hoisted(() => ({ setPhase: vi.fn(), toast: vi.fn() }));
vi.mock("../../worker-ui/src/backend", () => api);
vi.mock("../../worker-ui/src/state", () => ({ useApp: () => state }));
beforeEach(() => {
  vi.clearAllMocks();
  api.registerWorker.mockResolvedValue({ employeeNo: "SL-100001", accessCode: "aB7!xy2?" });
  api.snapshot.mockResolvedValue({
    onboarding: true,
    workerAccess: {
      status: "pending",
      name: "Worker Name",
      employeeNo: "SL-100001",
      phone: "+264811234567",
    },
  });
});
afterEach(cleanup);
const fill = () => {
  fireEvent.change(screen.getByLabelText("Company registration code"), {
    target: { value: "ABCDEF1234567890" },
  });
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Worker Name" } });
  fireEvent.change(screen.getByLabelText("Job title"), {
    target: { value: "Lighting technician" },
  });
  fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "+264811234567" } });
};
describe("worker onboarding", () => {
  it("uses a company code with name and phone and keeps credentials visible until saved", async () => {
    render(<CreateAccount />);
    expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    await screen.findByRole("heading", { name: "Save your access details" });
    expect(screen.getByText("SL-100001")).toBeInTheDocument();
    expect(screen.getByText("aB7!xy2?")).toBeInTheDocument();
    expect(api.registerWorker).toHaveBeenCalledWith(
      {
        fullName: "Worker Name",
        phone: "+264811234567",
        jobTitle: "Lighting technician",
      },
      "ABCDEF1234567890",
    );
    expect(state.setPhase).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(state.setPhase).toHaveBeenCalledWith("waiting"));
    expect(api.signInWorker).toHaveBeenCalledWith("SL-100001", "aB7!xy2?");
  });
  it("shows registration failures without fake credentials or success", async () => {
    api.registerWorker.mockRejectedValue(new Error("Phone already registered"));
    render(<CreateAccount />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    await screen.findByText("Phone already registered");
    expect(screen.queryByText("Save your access details")).not.toBeInTheDocument();
  });
  it("uses employee number and private code for sign in", async () => {
    api.snapshot.mockResolvedValue({ onboarding: false });
    render(<SignIn />);
    fireEvent.change(screen.getByLabelText("Employee number"), { target: { value: "SL-100001" } });
    fireEvent.change(screen.getByLabelText("Access code"), { target: { value: "aB7!xy2?" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    await waitFor(() => expect(state.setPhase).toHaveBeenCalledWith("app"));
    expect(api.signInWorker).toHaveBeenCalledWith("SL-100001", "aB7!xy2?");
  });
  it("shows only the pending worker profile and enters the app after actual approval", async () => {
    render(<AccessWaiting />);
    await screen.findByText("SL-100001 · +264811234567");
    expect(state.setPhase).not.toHaveBeenCalled();
    api.snapshot.mockResolvedValue({ onboarding: false });
    fireEvent.click(screen.getByRole("button", { name: "Check approval" }));
    await waitFor(() => expect(state.setPhase).toHaveBeenCalledWith("app"));
  });
  it("keeps rejected accounts outside the app and permits sign out", async () => {
    api.snapshot.mockResolvedValue({
      onboarding: true,
      workerAccess: {
        status: "rejected",
        name: "Worker",
        employeeNo: "SL-100001",
        phone: "+264811234567",
      },
    });
    render(<AccessWaiting />);
    await screen.findByRole("heading", { name: "Contact your manager" });
    expect(state.setPhase).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(state.setPhase).toHaveBeenCalledWith("welcome"));
    expect(api.signOut).toHaveBeenCalledOnce();
  });
});
