import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "./EmployeeShell";
import { useAttendance } from "@/lib/app-store";
import { replaceWorkerCode } from "@/lib/backend";
import type { WorkerCredentials } from "../../../shared/worker-signup";

export function WorkerAccessPanel() {
  const d = useAttendance();
  const [issued, setIssued] = useState<(WorkerCredentials & { name: string }) | null>(null);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const staff = d.employees.filter(
    (employee) => employee.role === "employee" || (d.accessRole === "owner" && employee.codeLogin),
  );
  return (
    <section className="card-surface p-5">
      <h2 className="text-lg font-bold">Your team</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Workers register with their name and phone number. Check who they are before approving
        access. Phone numbers have not been verified.
      </p>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {issued && (
        <div role="status" className="mt-4 rounded-2xl bg-tint-cream p-4">
          <h3 className="font-bold">Replacement code · {issued.name}</h3>
          <p className="mt-2 text-sm">
            Employee number: <strong>{issued.employeeNo}</strong>
          </p>
          <p className="mt-2 text-sm">
            Access code: <code className="select-all font-bold">{issued.accessCode}</code>
          </p>
          <p className="mt-2 text-xs">
            Share this code privately. It replaces the previous login code and is shown only here.
            Existing signed-in sessions remain signed in.
          </p>
          <Button variant="ghost" className="mt-2" onClick={() => setIssued(null)}>
            Hide code
          </Button>
        </div>
      )}
      <div className="mt-4 space-y-3">
        {!staff.length && (
          <p className="text-sm text-muted-foreground">No employees have registered yet.</p>
        )}
        {staff.map((employee) => {
          const status = employee.accessStatus ?? "active";
          const disabled = d.busy || resetting || !d.online;
          return (
            <article key={employee.id} className="rounded-2xl bg-muted p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold">{employee.name}</h3>
                <StatusPill
                  tone={
                    status === "active" && employee.activated
                      ? "ok"
                      : status === "rejected"
                        ? "bad"
                        : "warn"
                  }
                >
                  {status === "pending"
                    ? "Awaiting approval"
                    : status === "rejected"
                      ? "Not approved"
                      : employee.activated
                        ? "Joined"
                        : "Staff record"}
                </StatusPill>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {employee.no} · {employee.team || "No team"} ·{" "}
                {d.sites.find((site) => site.id === employee.siteId)?.name}
              </p>
              {employee.email && <p className="mt-2 break-all text-sm">{employee.email}</p>}
              {employee.phone && <p className="mt-1 text-sm">{employee.phone}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {employee.codeLogin && status !== "active" && (
                  <Button
                    variant="chip"
                    disabled={disabled}
                    onClick={() =>
                      void d.command("review_worker_access", {
                        employeeId: employee.id,
                        status: "active",
                        expectedStatus: status,
                      })
                    }
                  >
                    Approve access
                  </Button>
                )}
                {employee.codeLogin && status === "pending" && (
                  <Button
                    variant="ghost"
                    disabled={disabled}
                    onClick={() =>
                      void d.command("review_worker_access", {
                        employeeId: employee.id,
                        status: "rejected",
                        expectedStatus: status,
                      })
                    }
                  >
                    Reject registration
                  </Button>
                )}
                {employee.codeLogin && status !== "rejected" && (
                  <Button
                    variant="ghost"
                    disabled={disabled}
                    onClick={async () => {
                      setResetting(true);
                      setIssued(null);
                      setError("");
                      try {
                        setIssued({
                          ...(await replaceWorkerCode(employee.id)),
                          name: employee.name,
                        });
                      } catch (failure) {
                        setError(
                          failure instanceof Error ? failure.message : "Could not replace code",
                        );
                      } finally {
                        setResetting(false);
                      }
                    }}
                  >
                    Replace login code
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
