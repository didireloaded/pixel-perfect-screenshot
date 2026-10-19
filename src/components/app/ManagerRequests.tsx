import { useState } from "react";
import { Search, CalendarDays, ChevronRight } from "lucide-react";
import { useAttendance } from "@/lib/app-store";
import { ThemedSelect } from "../../../shared/ThemedSelect";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RecordForm } from "./RecordForm";
import { StatusPill } from "./EmployeeShell";
import { CompanyLeave } from "./CompanyLeave";
import { LeaveChanges } from "./LeaveChanges";
import { leaveChanges, profileChanges } from "@/lib/backend";
import { ProfileChangeRequests } from "../../../shared/ProfileChangeRequests";
export function ManagerRequests() {
  const d = useAttendance();
  const [status, setStatus] = useState("pending"),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const name = (id: string) =>
    d.employees.find((employee) => employee.id === id)?.name ?? "Employee";
  const visible = d.requests
    .filter(
      (request) =>
        (!status || request.status === status) &&
        (!kind || request.kind === kind) &&
        `${name(request.employeeId)} ${request.summary}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.submittedAt - a.submittedAt);
  const request = d.requests.find((item) => item.id === selected);
  return (
    <>
      <CompanyLeave />
      {(!d.accessRole || ["owner", "hr"].includes(d.accessRole)) && (
        <ProfileChangeRequests
          rpc={profileChanges}
          manager
          onChanged={() => void d.refresh()}
          refreshKey={d.employees}
        />
      )}
      {(!d.accessRole || ["owner", "hr"].includes(d.accessRole)) && (
        <LeaveChanges
          refreshKey={d.requests}
          rpc={leaveChanges}
          onChanged={() => void d.refresh()}
          employees={d.employees}
        />
      )}
      <section className="project-panel">
        <div className="project-panel-head">
          <div>
            <h2>Leave & requests</h2>
            <p className="project-panel-sub">
              Review employee requests and keep decisions in sync.
            </p>
          </div>
          <CalendarDays size={22} />
        </div>
        <div className="my-5 flex flex-wrap gap-3">
          {[
            ["pending", "Pending"],
            ["approved", "Approved"],
            ["declined", "Declined"],
            ["cancelled", "Cancelled"],
            ["", "All"],
          ].map(([value, label]) => (
            <button
              key={label}
              className={`sl-map-tool ${status === value ? "selected" : ""}`}
              aria-pressed={status === value}
              onClick={() => setStatus(value!)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mb-5 flex flex-wrap gap-3">
          <label className="flex flex-1 items-center gap-2 rounded-xl bg-muted px-3">
            <Search size={16} />
            <input
              aria-label="Search requests"
              className="w-full bg-transparent py-3 text-sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search employee or reason"
            />
          </label>
          <ThemedSelect aria-label="Request type" value={kind} onValueChange={setKind}>
            <option value="">All requests</option>
            <option value="leave">Leave</option>
            <option value="emergency">Emergency</option>
            <option value="personal_departure">Personal departure</option>
            <option value="correction">Corrections</option>
            <option value="missing_clocking">Missing clocking</option>
          </ThemedSelect>
        </div>
        <div className="space-y-3">
          {visible.map((item) => (
            <button
              key={item.id}
              className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border p-4 text-left"
              onClick={() => setSelected(item.id)}
            >
              <div>
                <b className="text-sm">{name(item.employeeId)}</b>
                <p className="mt-1 text-sm">{item.summary}</p>
                <small className="text-muted-foreground">
                  {item.leaveStart
                    ? `${item.leaveStart}–${item.leaveEnd}${item.leaveStartTime ? ` · ${item.leaveStartTime}–${item.leaveEndTime}` : " · Full days"}`
                    : item.kind.replaceAll("_", " ")}
                </small>
              </div>
              <StatusPill
                tone={
                  item.status === "pending" ? "warn" : item.status === "approved" ? "ok" : "bad"
                }
              >
                {item.status}
              </StatusPill>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
        {!visible.length && <p className="project-empty">No requests match these filters.</p>}
        <Dialog open={!!request} onOpenChange={(open) => !open && setSelected(null)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogTitle>{request?.summary || "Request"}</DialogTitle>
            <DialogDescription>
              {request ? name(request.employeeId) : "Employee request"}
            </DialogDescription>
            {request && (
              <>
                {request.kind === "leave" && (
                  <p className="text-sm">
                    {d.accessRole === "operations"
                      ? "Leave details are managed by HR."
                      : request.leaveType
                        ? `Leave type: ${request.leaveType}`
                        : "Unclassified older request · not included in leave balances"}
                  </p>
                )}
                {request.kind === "leave" && !request.leaveType && request.status === "pending" && (
                  <RecordForm
                    title="Classify leave"
                    action="classify_leave_request"
                    label="Save leave type"
                    extra={{ id: request.id }}
                    fields={[
                      {
                        name: "leaveType",
                        label: "Leave type",
                        options: [
                          { value: "annual", label: "Annual" },
                          { value: "sick", label: "Sick" },
                          { value: "personal", label: "Personal" },
                          { value: "unpaid", label: "Unpaid" },
                        ],
                      },
                    ]}
                  />
                )}
                {request.leaveStart && (
                  <p className="rounded-xl bg-muted p-3 text-sm">
                    {request.leaveStart}–{request.leaveEnd}
                    {request.leaveStartTime
                      ? ` · ${request.leaveStartTime}–${request.leaveEndTime}`
                      : " · Full days"}
                  </p>
                )}
                <p className="whitespace-pre-wrap text-sm">
                  {request.detail || "No details shared."}
                </p>
                {(request.kind === "correction" || request.kind === "missing_clocking") && (
                  <p className="text-sm text-muted-foreground">
                    Use Corrections to approve changes to recorded attendance. This decision records
                    your response only.
                  </p>
                )}
                {request.status === "pending" && request.employeeId !== d.me && (
                  <RecordForm
                    title="Review request"
                    action="review_request"
                    extra={{ id: request.id }}
                    fields={[
                      {
                        name: "status",
                        label: "Decision",
                        options: [
                          { value: "approved", label: "Approve" },
                          { value: "declined", label: "Decline" },
                        ],
                      },
                      { name: "reason", label: "Reason" },
                    ]}
                  />
                )}
                {request.reason && (
                  <p className="rounded-xl bg-muted p-3 text-sm">
                    {request.reviewer}: {request.reason}
                  </p>
                )}
              </>
            )}
          </DialogContent>
        </Dialog>
      </section>
    </>
  );
}
