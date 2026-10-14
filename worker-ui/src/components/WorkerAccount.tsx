import { ThemedSelect } from "../../../shared/ThemedSelect";
import { displayDate, displayInstant } from "../../../shared/display-date";
import { useState, type FormEvent } from "react";
import {
  Bell,
  ChevronRight,
  ClipboardList,
  Coffee,
  FileText,
  HelpCircle,
  LogOut,
  MapPin,
  Moon,
  ShieldCheck,
  Sun,
  User,
} from "lucide-react";
import type { AttendanceSnapshot, EventType, RequestKind, Shift } from "../../../shared/attendance";
import { useApp } from "../state";
import { EmptyState, formatTime } from "./WorkerUI";
export type WorkerRun = (
  action: string,
  payload: Record<string, unknown>,
  success: string,
) => Promise<boolean>;
export function WorkerProfile({
  data,
  onRequests,
  onSignOut,
  onMonitoring,
  monitoring,
}: {
  data: AttendanceSnapshot;
  onRequests: () => void;
  onSignOut: () => void;
  onMonitoring: () => void;
  monitoring: boolean;
}) {
  const { isDark, setAppearance, reduceMotion, setReduceMotion } = useApp();
  const [privacy, setPrivacy] = useState(false);
  const [help, setHelp] = useState(false);
  const me = data.employees.find((employee) => employee.id === data.me)!;
  return (
    <>
      <div className="worker-profile-identity">
        <span>
          {me.name
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)}
        </span>
        <h2>{me.name}</h2>
        <p>
          {me.team || "Employee"} · {me.no}
        </p>
        <small>{data.company.name}</small>
        {data.company.logoUrl && (
          <img
            src={data.company.logoUrl}
            alt={`${data.company.name} logo`}
            className="mx-auto mt-3 h-12 w-12 rounded-lg object-contain"
          />
        )}
      </div>
      <div className="worker-profile-group">
        <p>YOUR WORK</p>
        <button onClick={onRequests}>
          <ClipboardList size={19} />
          <span>My requests</span>
          <ChevronRight size={17} />
        </button>
        <div className="worker-account-info">
          <User size={19} />
          <span>Employee number</span>
          <b>{me.no}</b>
        </div>
        <div className="worker-account-info">
          <MapPin size={19} />
          <span>Worksite</span>
          <b>{data.sites.find((site) => site.id === me.siteId)?.name ?? "Unassigned"}</b>
        </div>
      </div>
      <div className="worker-profile-group">
        <p>PREFERENCES & PRIVACY</p>
        <button onClick={() => setAppearance(isDark ? "light" : "dark")}>
          {isDark ? <Sun size={19} /> : <Moon size={19} />}
          <span>Appearance</span>
          <b>{isDark ? "Dark" : "Light"}</b>
          <ChevronRight size={17} />
        </button>
        <label className="worker-setting-row">
          <Coffee size={19} />
          <span>Reduce motion</span>
          <input
            type="checkbox"
            checked={reduceMotion}
            onChange={(event) => setReduceMotion(event.target.checked)}
          />
        </label>
        <button onClick={() => setPrivacy((value) => !value)} aria-expanded={privacy}>
          <ShieldCheck size={19} />
          <span>Location & privacy</span>
          <ChevronRight size={17} />
        </button>
        {privacy && (
          <div className="worker-profile-disclosure">
            <p>
              Worksite checks run only while this app is visible, during active work, until the
              tracking deadline. They stop during lunch, departures and after clock-out. Your
              manager sees worksite exit and return alerts, not a route.
            </p>
            <button onClick={onMonitoring}>
              {monitoring ? "Pause worksite checks" : "Enable worksite checks"}
            </button>
          </div>
        )}
      </div>
      <div className="worker-profile-group">
        <button onClick={() => setHelp((value) => !value)} aria-expanded={help}>
          <HelpCircle size={19} />
          <span>Help with Shiftline</span>
          <ChevronRight size={17} />
        </button>
        {help && (
          <div className="worker-profile-disclosure">
            <p>
              Clock in from Today at the start of your shift. Use Lunch for your break and Clock out
              when you finish. If a record is incorrect, open Calendar, choose the shift, and
              request a correction. Contact your manager through Inbox.
            </p>
          </div>
        )}
      </div>
      <button className="worker-signout" onClick={onSignOut}>
        <LogOut size={17} />
        Sign out
      </button>
    </>
  );
}
export function WorkerRequests({
  data,
  busy,
  run,
  correction,
}: {
  data: AttendanceSnapshot;
  busy: boolean;
  run: WorkerRun;
  correction?: Shift | null;
}) {
  const [kind, setKind] = useState<RequestKind>(correction ? "correction" : "leave");
  const [summary, setSummary] = useState(
    correction ? `Attendance correction · ${displayDate(correction.date)}` : "",
  );
  const [detail, setDetail] = useState("");
  const [leaveStart, setLeaveStart] = useState(data.today);
  const [leaveEnd, setLeaveEnd] = useState(data.today);
  const [hourly, setHourly] = useState(false);
  const [leaveStartTime, setLeaveStartTime] = useState("");
  const [leaveEndTime, setLeaveEndTime] = useState("");
  const [leaveId, setLeaveId] = useState(() => crypto.randomUUID());
  const correctionMode = kind === "correction" || kind === "missing_clocking";
  const shifts = data.shifts.filter((shift) => shift.employeeId === data.me);
  const [shiftId, setShiftId] = useState(correction?.id ?? shifts[0]?.id ?? "");
  const [eventId, setEventId] = useState("");
  const [eventType, setEventType] = useState<EventType>("clock_in");
  const [replacementAt, setReplacementAt] = useState("");
  const [validationError, setValidationError] = useState("");
  const corrections = data.corrections.filter((item) => item.employee_id === data.me);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setValidationError("");
    if (correctionMode && (!shiftId || !Number.isFinite(Date.parse(replacementAt)))) {
      setValidationError("Choose the assigned shift and the correct time.");
      return;
    }
    if (
      await run(
        correctionMode
          ? "request_correction"
          : kind === "leave"
            ? "create_leave_request"
            : "create_request",
        correctionMode
          ? {
              shiftId,
              eventId,
              eventType,
              replacementAt: new Date(replacementAt).toISOString(),
              reason: [summary.trim(), detail.trim()].filter(Boolean).join(" — "),
            }
          : kind === "leave"
            ? {
                id: leaveId,
                summary: summary.trim(),
                detail: detail.trim(),
                leaveStart,
                leaveEnd: hourly ? leaveStart : leaveEnd,
                leaveStartTime: hourly ? leaveStartTime : null,
                leaveEndTime: hourly ? leaveEndTime : null,
              }
            : { kind, summary: summary.trim(), detail: detail.trim() },
        "Request sent to your manager",
      )
    ) {
      setSummary("");
      setDetail("");
      setLeaveId(crypto.randomUUID());
    }
  };
  const requests = data.requests
    .filter((request) => request.employeeId === data.me)
    .sort((a, b) => b.submittedAt - a.submittedAt);
  return (
    <>
      <section className="worker-card">
        <h2 className="text-base font-semibold">New request</h2>
        <p className="worker-muted-copy">Send a request to your manager for review.</p>
        <form className="worker-request-form" onSubmit={(event) => void submit(event)}>
          <label>
            Request type
            <ThemedSelect value={kind} onValueChange={(value) => setKind(value as RequestKind)}>
              <option value="leave">Time off</option>
              <option value="correction">Attendance correction</option>
              <option value="missing_clocking">Missing clock-in or out</option>
              <option value="emergency">Emergency</option>
            </ThemedSelect>
          </label>
          {kind === "leave" && (
            <>
              <label>
                Leave duration
                <ThemedSelect
                  value={hourly ? "hourly" : "days"}
                  onValueChange={(value) => setHourly(value === "hourly")}
                >
                  <option value="days">Full day or multiple days</option>
                  <option value="hourly">Part of a day</option>
                </ThemedSelect>
              </label>
              <label>
                First day
                <input
                  type="date"
                  required
                  value={leaveStart}
                  onChange={(event) => setLeaveStart(event.target.value)}
                />
              </label>
              {!hourly && (
                <label>
                  Last day
                  <input
                    type="date"
                    required
                    min={leaveStart}
                    value={leaveEnd}
                    onChange={(event) => setLeaveEnd(event.target.value)}
                  />
                </label>
              )}
              {hourly && (
                <>
                  <label>
                    Start time
                    <input
                      type="time"
                      required
                      value={leaveStartTime}
                      onChange={(event) => setLeaveStartTime(event.target.value)}
                    />
                  </label>
                  <label>
                    End time
                    <input
                      type="time"
                      required
                      value={leaveEndTime}
                      onChange={(event) => setLeaveEndTime(event.target.value)}
                    />
                  </label>
                </>
              )}
            </>
          )}
          {correctionMode && (
            <>
              <label>
                Assigned shift
                <ThemedSelect
                  required
                  value={shiftId}
                  onValueChange={(value) => {
                    setShiftId(value);
                    setEventId("");
                  }}
                >
                  <option value="">Choose a shift</option>
                  {shifts.map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {displayDate(shift.date)} · {shift.start}–{shift.end}
                    </option>
                  ))}
                </ThemedSelect>
              </label>
              <label>
                Record to correct
                <ThemedSelect value={eventId} onValueChange={(value) => setEventId(value)}>
                  <option value="">Add a missing record</option>
                  {data.events
                    .filter((item) => item.shiftId === shiftId)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.type.replace(/_/g, " ")} ·{" "}
                        {formatTime(item.capturedAt, data.company.timezone)}
                      </option>
                    ))}
                </ThemedSelect>
              </label>
              {!eventId && (
                <label>
                  Missing action
                  <ThemedSelect
                    value={eventType}
                    onValueChange={(value) => setEventType(value as EventType)}
                  >
                    {(
                      [
                        "clock_in",
                        "start_lunch",
                        "end_lunch",
                        "start_job",
                        "end_job",
                        "start_personal",
                        "end_personal",
                        "clock_out",
                      ] as EventType[]
                    ).map((type) => (
                      <option key={type} value={type}>
                        {type.replace(/_/g, " ")}
                      </option>
                    ))}
                  </ThemedSelect>
                </label>
              )}
              <label>
                Correct date and time (your device timezone)
                <input
                  type="datetime-local"
                  required
                  value={replacementAt}
                  onChange={(event) => setReplacementAt(event.target.value)}
                />
              </label>
            </>
          )}
          <label>
            Summary
            <input
              required
              maxLength={120}
              placeholder="Dates or a short reason"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>
          <label>
            Details
            <textarea
              maxLength={2000}
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              placeholder="What should your manager know?"
            />
          </label>
          {validationError && <p role="alert">{validationError}</p>}
          <button
            className="worker-action"
            disabled={busy || !summary.trim() || (correctionMode && !shiftId)}
          >
            Send request
          </button>
        </form>
      </section>
      <div className="worker-section-heading">
        <h2>Your requests</h2>
        <span>{requests.length + corrections.length}</span>
      </div>
      {requests.map((request) => (
        <section className="worker-card" key={request.id}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold">{request.summary}</h3>
            <span className={`worker-request-status ${request.status}`}>{request.status}</span>
          </div>
          <p className="worker-muted-copy">{request.detail || request.kind.replace(/_/g, " ")}</p>
          {request.leaveStart && (
            <p className="my-2 text-xs">
              {displayDate(request.leaveStart)}–
              {displayDate(request.leaveEnd ?? request.leaveStart)}
              {request.leaveStartTime
                ? ` · ${request.leaveStartTime}–${request.leaveEndTime}`
                : " · Full days"}
            </p>
          )}
          <small className="text-[10px] text-sub">
            {displayInstant(request.submittedAt, data.company.timezone)}
          </small>
          {request.reason && (
            <p className="mt-3 rounded-xl bg-fill p-3 text-xs dark:bg-dfill">
              Manager: {request.reason}
            </p>
          )}
        </section>
      ))}
      {corrections.map((item) => (
        <section className="worker-card" key={item.id}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold">
              {item.event_type.replace(/_/g, " ")} correction
            </h3>
            <span className={`worker-request-status ${item.status}`}>
              {item.status.replace(/_/g, " ")}
            </span>
          </div>
          <p className="worker-muted-copy">{item.reason}</p>
          <small>{displayInstant(item.replacement_value.capturedAt, data.company.timezone)}</small>
          {item.decision_reason && (
            <p className="worker-muted-copy">Manager: {item.decision_reason}</p>
          )}
        </section>
      ))}
      {!requests.length && !corrections.length && (
        <EmptyState
          icon={<FileText size={26} />}
          title="No requests yet"
          description="Your requests and manager decisions appear here."
        />
      )}
    </>
  );
}
export function WorkerNotifications({
  data,
  onInbox,
  onRequests,
  onHours,
}: {
  data: AttendanceSnapshot;
  onInbox: () => void;
  onRequests: () => void;
  onHours: () => void;
}) {
  const messages = data.messages.filter(
    (message) => message.recipientId === data.me && !message.readAt,
  );
  const notices = data.notices.filter((notice) => notice.requiresAck && !notice.acknowledged);
  const decisions = data.requests.filter(
    (request) => request.employeeId === data.me && request.status !== "pending",
  );
  const reviewed = data.timesheets.filter(
    (sheet) => sheet.employeeId === data.me && sheet.status === "approved",
  );
  return (
    <>
      {!messages.length && !notices.length && !decisions.length && !reviewed.length && (
        <EmptyState
          icon={<Bell size={27} />}
          title="You’re all caught up"
          description="Messages, company updates and approvals will appear here."
        />
      )}
      {messages.map((message) => (
        <button className="worker-notification-row" key={message.id} onClick={onInbox}>
          <span className="worker-soft-icon">
            <Bell size={18} />
          </span>
          <span>
            <b>{message.title}</b>
            <p>{message.senderName} · New message</p>
          </span>
          <ChevronRight size={16} />
        </button>
      ))}
      {notices.map((notice) => (
        <button className="worker-notification-row" key={notice.id} onClick={onInbox}>
          <span className="worker-soft-icon">
            <FileText size={18} />
          </span>
          <span>
            <b>{notice.title}</b>
            <p>Company notice · Acknowledgement needed</p>
          </span>
          <ChevronRight size={16} />
        </button>
      ))}
      {decisions.map((request) => (
        <button className="worker-notification-row" key={request.id} onClick={onRequests}>
          <span className="worker-soft-icon">
            <ClipboardList size={18} />
          </span>
          <span>
            <b>{request.summary}</b>
            <p>Request {request.status}</p>
          </span>
          <ChevronRight size={16} />
        </button>
      ))}
      {reviewed.map((sheet) => (
        <button className="worker-notification-row" key={sheet.shiftId} onClick={onHours}>
          <span className="worker-soft-icon">
            <FileText size={18} />
          </span>
          <span>
            <b>Timesheet approved</b>
            <p>{displayDate(sheet.date)} · View your hours</p>
          </span>
          <ChevronRight size={16} />
        </button>
      ))}
    </>
  );
}
