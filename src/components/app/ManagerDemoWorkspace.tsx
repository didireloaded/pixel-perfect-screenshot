import { useEffect, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Job, JobStep, JobTeamMember, JobComment, Site } from "../../../shared/attendance";
import { deriveState, canTransition, STATE_LABEL } from "@/lib/attendance";
import type { AttendanceEvent, EventType } from "../../../shared/attendance";
import { ManagerFrame } from "./ManagerFrame";
import { ManagerJobBoard } from "./ManagerJobBoard";
import { ManagerCalendar } from "./ManagerCalendar";
import { ManagerOverview } from "./ManagerOverview";
import { ManagerInsights, type InsightData } from "./ManagerInsights";
import type { ManagerSection } from "./manager-sections";
type Note = { id: string; title: string; body: string };
type Review = {
  id: string;
  name: string;
  title: string;
  detail: string;
  status: string;
  reason: string;
};
type Chat = { id: string; person: string; body: string; from: string; at: string };
type Demo = {
  jobs: Job[];
  team: JobTeamMember[];
  steps: JobStep[];
  comments: JobComment[];
  notes: Note[];
  news: Note[];
  reviews: Review[];
  chats: Chat[];
  audit: string[];
  demoEvents: AttendanceEvent[];
  policies: { lunch: number; stop: string };
  locations: Record<string, string>;
};
const sites: Site[] = [
  {
    id: "office",
    name: "Windhoek West office",
    address: "Windhoek West",
    latitude: -22.5594,
    longitude: 17.0658,
    radiusM: 150,
    maxAccuracyM: 100,
    geofenceMode: "validate",
  },
  {
    id: "site",
    name: "North Gate site",
    address: "Northern industrial area",
    latitude: -22.5302,
    longitude: 17.0771,
    radiusM: 150,
    maxAccuracyM: 100,
    geofenceMode: "validate",
  },
];
const KEY = "shiftline-manager-demo-v1";
export function ManagerDemoWorkspace({
  onConnect,
  initialJobs,
  initialSteps,
  initialTeam,
  base,
}: {
  onConnect: () => void;
  initialJobs: Job[];
  initialSteps: JobStep[];
  initialTeam: JobTeamMember[];
  base: InsightData;
}) {
  const [seed] = useState<Demo>(() => ({
    jobs: initialJobs,
    steps: initialSteps,
    team: initialTeam,
    comments: [
      {
        id: "comment-seed",
        jobId: "j3",
        authorId: "priya",
        authorName: "Priya Kaur",
        body: "North gate inspection checklist is ready. Please confirm access.",
        createdAt: "2026-10-10T08:00:00Z",
      },
    ],
    notes: [
      {
        id: "n1",
        title: "Monday handover",
        body: "Confirm equipment delivery with David. North gate access opens at 09:00.",
      },
    ],
    news: [
      {
        id: "news1",
        title: "Safety briefing",
        body: "All site teams: meet at the office on Monday at 08:00.",
      },
    ],
    reviews: [
      {
        id: "r1",
        name: "Alex Martin",
        title: "Leave request",
        detail: "Annual leave · 16 October",
        status: "Pending",
        reason: "",
      },
      {
        id: "r2",
        name: "Priya Kaur",
        title: "Attendance correction",
        detail: "Missing clock-out on 9 October. Requested time: 17:00.",
        status: "Pending",
        reason: "",
      },
    ],
    chats: [
      {
        id: "m1",
        person: "priya",
        from: "Priya Kaur",
        body: "The inspection checklist is ready.",
        at: "08:32",
      },
    ],
    audit: ["Demo workspace opened"],
    demoEvents: [
      {
        id: "demo-lunch",
        shiftId: "shift-1",
        employeeId: "david",
        type: "start_lunch",
        capturedAt: new Date(`${base.today}T10:00:00Z`).getTime(),
        sync: "synced",
      },
    ],
    policies: { lunch: 60, stop: "17:00" },
    locations: {},
  }));
  const [data, setData] = useState<Demo>(seed);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) {
        const value = JSON.parse(saved);
        if (Array.isArray(value.jobs) && Array.isArray(value.audit)) setData({ ...seed, ...value });
      }
    } catch {
      toast.error("Could not read saved demo. Starting with sample records.");
    }
    setLoaded(true);
  }, [seed]);
  useEffect(() => {
    if (loaded)
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch {
        toast.error("Demo changes could not be saved on this device.");
      }
  }, [data, loaded]);
  const [section, setSection] = useState<ManagerSection>("Overview");
  const [create, setCreate] = useState(false);
  const [person, setPerson] = useState("priya");
  const [date, setDate] = useState(base.today);
  const [siteId, setSiteId] = useState("office");
  const [query, setQuery] = useState("");
  const name = (id: string) => base.employees.find((p) => p.id === id)?.name || "Manager";
  const update = (fn: (value: Demo) => Demo, description: string) => {
    setData((value) => {
      const next = fn(value);
      return {
        ...next,
        audit: [`${new Date().toLocaleString()} · ${description}`, ...next.audit].slice(0, 200),
      };
    });
    toast.success(description);
  };
  const submit = (event: FormEvent<HTMLFormElement>, fn: (form: FormData) => void | false) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (
      Array.from(
        form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          "input[required],textarea[required]",
        ),
      ).some((field) => !field.value.trim())
    ) {
      toast.error("Fill in all required fields.");
      return;
    }
    if (fn(new FormData(form)) !== false) form.reset();
  };
  const formValue = (form: FormData, key: string) => String(form.get(key) || "").trim();
  const events = [...base.events, ...data.demoEvents];
  const stateFor = (shiftId: string) =>
    deriveState(events.filter((event) => event.shiftId === shiftId));
  const workerState = (id: string) =>
    stateFor(
      base.shifts.find((shift) => shift.employeeId === id && shift.date === base.today)?.id || "",
    );
  const insights = {
    ...base,
    events,
    states: base.shifts.map((shift) => ({
      shiftId: shift.id,
      employeeId: shift.employeeId,
      state: stateFor(shift.id),
    })),
  };
  const move = async (id: string, status: Job["status"]) => {
    update(
      (value) => ({
        ...value,
        jobs: value.jobs.map((job) => (job.id === id ? { ...job, status } : job)),
        locations:
          status === "in_progress"
            ? (() => {
                const job = value.jobs.find((job) => job.id === id);
                const site = sites.find(
                  (site) =>
                    site.name === job?.destination || site.name.startsWith(job?.destination || "!"),
                );
                if (!site || !job) return value.locations;
                const members = value.team
                  .filter((member) => member.jobId === id)
                  .map((member) => member.employeeId);
                return {
                  ...value.locations,
                  ...Object.fromEntries(
                    (members.length ? members : [job.assignee]).map((employeeId) => [
                      employeeId,
                      site.id,
                    ]),
                  ),
                };
              })()
            : value.locations,
      }),
      `Task moved to ${status.replaceAll("_", " ")}`,
    );
    return true;
  };
  const comment = async (jobId: string, body: string) => {
    update(
      (value) => ({
        ...value,
        comments: [
          ...value.comments,
          {
            id: crypto.randomUUID(),
            jobId,
            body,
            authorId: "manager",
            authorName: "Alex Morgan",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
      "Comment posted",
    );
    return true;
  };
  const review = (id: string, status: string) => {
    const reason = (document.getElementById(`reason-${id}`) as HTMLInputElement)?.value.trim();
    if (!reason) {
      toast.error("Add a decision reason first.");
      return;
    }
    update(
      (value) => ({
        ...value,
        reviews: value.reviews.map((item) => (item.id === id ? { ...item, status, reason } : item)),
      }),
      `Review ${status.toLowerCase()}`,
    );
  };
  const notesForm = (news: boolean) => (
    <form
      className="project-panel demo-form"
      onSubmit={(event) =>
        submit(event, (form) => {
          const item = {
            id: crypto.randomUUID(),
            title: formValue(form, "title"),
            body: formValue(form, "body"),
          };
          update(
            (value) => ({
              ...value,
              [news ? "news" : "notes"]: [item, ...value[news ? "news" : "notes"]],
            }),
            news ? "Announcement published in demo" : "Note saved",
          );
        })
      }
    >
      <h2>{news ? "Publish company update" : "Write a note"}</h2>
      <label>
        Title
        <input name="title" required maxLength={120} />
      </label>
      <label>
        {news ? "Company message" : "Note"}
        <textarea name="body" required maxLength={4000} />
      </label>
      <button className="manager-add-button">{news ? "Publish announcement" : "Save note"}</button>
    </form>
  );
  return (
    <ManagerFrame
      active={section}
      onSelect={setSection}
      company="Project Inc."
      preview
      managerName="Alex Morgan"
      onConnect={onConnect}
      insights={
        ["Overview", "Tasks", "Views"].includes(section) ? (
          <ManagerInsights data={insights} onSelect={setSection} />
        ) : undefined
      }
    >
      <div className="demo-banner">
        <span>Interactive demo · changes saved on this browser · sample records</span>
        <button
          onClick={() => {
            setData(seed);
            toast.success("Demo reset to sample records");
          }}
        >
          Reset demo
        </button>
      </div>
      {section === "Overview" && (
        <ManagerOverview
          jobs={data.jobs}
          shifts={base.shifts}
          employees={base.employees}
          events={events}
          today={base.today}
          onSelect={setSection}
        />
      )}
      {section === "Tasks" && (
        <ManagerJobBoard
          jobs={data.jobs}
          steps={data.steps}
          team={data.team}
          comments={data.comments}
          names={name}
          today={base.today}
          onAdd={() => setCreate(true)}
          onMove={move}
          onComment={comment}
          onStep={async (stepId, done) => {
            update(
              (value) => ({
                ...value,
                steps: value.steps.map((step) =>
                  step.id === stepId
                    ? { ...step, completedAt: done ? new Date().toISOString() : null }
                    : step,
                ),
              }),
              "Checklist updated",
            );
            return true;
          }}
          onAddStep={async (jobId, label) => {
            update(
              (value) => ({
                ...value,
                steps: [
                  ...value.steps,
                  {
                    id: crypto.randomUUID(),
                    jobId,
                    label,
                    sortOrder: value.steps.filter((step) => step.jobId === jobId).length,
                    completedAt: null,
                  },
                ],
              }),
              "Checklist item added",
            );
            return true;
          }}
        />
      )}
      {section === "Calendar" && (
        <ManagerCalendar
          data={{ ...base, jobs: data.jobs, sites }}
          actionLabel="Schedule job"
          onCreate={() => setCreate(true)}
        />
      )}
      {section === "Notes" && (
        <div className="demo-two">
          {notesForm(false)}
          <div className="demo-note-grid">
            {data.notes.map((note) => (
              <article key={note.id} className="demo-note">
                <h2>{note.title}</h2>
                <p>{note.body}</p>
                <button
                  onClick={() =>
                    update(
                      (value) => ({
                        ...value,
                        notes: value.notes.filter((item) => item.id !== note.id),
                      }),
                      "Note removed",
                    )
                  }
                >
                  Delete note
                </button>
              </article>
            ))}
          </div>
        </div>
      )}
      {(section === "Reports" || section === "Attendance") && (
        <section className="project-panel">
          <div className="project-panel-head">
            <div>
              <h2>{section === "Reports" ? "Daily operations report" : "Attendance register"}</h2>
              <p>Choose a date to review current or historical work.</p>
            </div>
            <div className="demo-report-dates">
              <button
                aria-label="Previous report day"
                onClick={() => {
                  const next = new Date(`${date}T12:00:00Z`);
                  next.setUTCDate(next.getUTCDate() - 1);
                  setDate(next.toISOString().slice(0, 10));
                }}
              >
                <ChevronLeft size={18} />
              </button>
              <input
                aria-label="Report date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                onInput={(event) => setDate(event.currentTarget.value)}
              />
              <button
                aria-label="Next report day"
                onClick={() => {
                  const next = new Date(`${date}T12:00:00Z`);
                  next.setUTCDate(next.getUTCDate() + 1);
                  setDate(next.toISOString().slice(0, 10));
                }}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className="demo-metrics">
            <article>
              <span>Jobs</span>
              <b>{data.jobs.filter((job) => job.date === date).length}</b>
            </article>
            <article>
              <span>Completed</span>
              <b>
                {data.jobs.filter((job) => job.date === date && job.status === "completed").length}
              </b>
            </article>
            <article>
              <span>Scheduled workers</span>
              <b>{base.shifts.filter((shift) => shift.date === date).length}</b>
            </article>
          </div>
          <div className="demo-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Shift</th>
                  <th>Clock in</th>
                  <th>Clock out</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {base.shifts
                  .filter((shift) => shift.date === date)
                  .map((shift) => (
                    <tr key={shift.id}>
                      <td>{name(shift.employeeId)}</td>
                      <td>
                        {shift.start}–{shift.end}
                      </td>
                      <td>
                        {(() => {
                          const event = events.find(
                            (event) => event.shiftId === shift.id && event.type === "clock_in",
                          );
                          return event
                            ? new Date(event.capturedAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                timeZone: base.company.timezone,
                              })
                            : "Not recorded";
                        })()}
                      </td>
                      <td>
                        {(() => {
                          const event = events.find(
                            (event) => event.shiftId === shift.id && event.type === "clock_out",
                          );
                          return event
                            ? new Date(event.capturedAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                timeZone: base.company.timezone,
                              })
                            : "Not recorded";
                        })()}
                      </td>
                      <td>
                        {events.some(
                          (event) => event.shiftId === shift.id && event.type === "clock_out",
                        )
                          ? "Clocked out"
                          : stateFor(shift.id) === "on_lunch"
                            ? "On lunch"
                            : events.some((event) => event.shiftId === shift.id)
                              ? "Working"
                              : "Not clocked in"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!base.shifts.some((shift) => shift.date === date) && (
            <p>No attendance recorded on this date.</p>
          )}
          <h3>Job activity</h3>
          {data.jobs
            .filter((job) => job.date === date)
            .map((job) => (
              <div className="demo-list-row" key={job.id}>
                <b>{job.title}</b>
                <span>
                  {job.status.replaceAll("_", " ")} · {name(job.assignee)}
                </span>
              </div>
            ))}
          <button
            className="manager-add-button"
            onClick={() => {
              const rows = [
                ["Date", "Job", "Status", "Employee"],
                ...data.jobs
                  .filter((job) => job.date === date)
                  .map((job) => [job.date, job.title, job.status, name(job.assignee)]),
              ];
              const blob = new Blob(
                [
                  rows
                    .map((row) =>
                      row
                        .map(
                          (cell) =>
                            '"' +
                            (/^[=+\-@\t\r]/.test(cell) ? "'" + cell : cell).replaceAll('"', '""') +
                            '"',
                        )
                        .join(","),
                    )
                    .join("\n"),
                ],
                { type: "text/csv" },
              );
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `operations-${date}.csv`;
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export daily report
          </button>
        </section>
      )}
      {section === "Views" && (
        <div className="demo-project-grid">
          {base.employees.map((employee) => (
            <section className="project-panel" key={employee.id}>
              <h2>{employee.name}</h2>
              <span className="manager-task-tag purple">
                {STATE_LABEL[workerState(employee.id)]}
              </span>
              <p>
                {
                  data.jobs.filter((job) => job.assignee === employee.id && job.date === base.today)
                    .length
                }{" "}
                jobs today
              </p>
              <button
                onClick={() => {
                  setSection("Tasks");
                }}
              >
                Open task board
              </button>
            </section>
          ))}
        </div>
      )}
      {section === "Project management" && (
        <div className="demo-project-grid">
          {[...new Set(data.jobs.map((job) => job.destination))].map((destination) => {
            const jobs = data.jobs.filter((job) => job.destination === destination);
            return (
              <section className="project-panel" key={destination}>
                <span className="manager-task-tag purple">Worksite project</span>
                <h2>{destination}</h2>
                <p>
                  {jobs.length} tasks · {jobs.filter((job) => job.status === "completed").length}{" "}
                  completed
                </p>
                <progress
                  max={jobs.length}
                  value={jobs.filter((job) => job.status === "completed").length}
                />
                {jobs.map((job) => (
                  <div className="demo-list-row" key={job.id}>
                    <b>{job.title}</b>
                    <select
                      aria-label={`Status of ${job.title}`}
                      value={job.status}
                      onChange={(event) => void move(job.id, event.target.value as Job["status"])}
                    >
                      <option value="assigned">Planned</option>
                      <option value="in_progress">In progress</option>
                      <option value="completed">Completed</option>
                    </select>
                    <small>
                      {name(job.assignee)} · {job.date}
                    </small>
                  </div>
                ))}
                <button onClick={() => setCreate(true)}>Add task</button>
              </section>
            );
          })}
        </div>
      )}
      {section === "Map" && (
        <div className="project-map-layout">
          <section className="project-panel">
            <div className="project-panel-head">
              <h2>Worksite presence</h2>
              <select
                aria-label="Worksite"
                value={siteId}
                onChange={(event) => setSiteId(event.target.value)}
              >
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </div>
            <iframe
              className="project-map-frame"
              title="Worksite map"
              referrerPolicy="no-referrer"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${siteId === "office" ? "17.05,-22.57,17.08,-22.55" : "17.06,-22.54,17.09,-22.52"}&layer=mapnik&marker=${siteId === "office" ? "-22.5594,17.0658" : "-22.5302,17.0771"}`}
            />
            <p>Real base map; sample worksite assignments. This demo does not collect GPS.</p>
          </section>
          <section className="project-panel">
            <h2>Visible at this worksite</h2>
            {base.employees
              .filter(
                (employee) =>
                  ["working", "on_job"].includes(workerState(employee.id)) &&
                  (data.locations[employee.id] || "office") === siteId,
              )
              .map((employee) => (
                <div className="demo-list-row" key={employee.id}>
                  <b>{employee.name}</b>
                  <span>Assigned here · demo presence</span>
                  <button
                    onClick={() => {
                      setPerson(employee.id);
                      setSection("Messages");
                    }}
                  >
                    Message
                  </button>
                </div>
              ))}
            <h3>Location hidden</h3>
            {base.employees
              .filter((employee) => !["working", "on_job"].includes(workerState(employee.id)))
              .map((employee) => (
                <div className="demo-list-row" key={employee.id}>
                  <b>{employee.name}</b>
                  <span>{STATE_LABEL[workerState(employee.id)]} · location hidden</span>
                </div>
              ))}
            <p>
              Lunch, personal breaks and off-duty locations must not appear as active work
              locations.
            </p>
          </section>
        </div>
      )}
      {section === "Messages" && (
        <div className="demo-chat">
          <aside className="project-panel">
            <h2>Conversations</h2>
            {base.employees.map((employee) => (
              <button
                className={`demo-list-row ${person === employee.id ? "selected" : ""}`}
                key={employee.id}
                onClick={() => setPerson(employee.id)}
              >
                <b>{employee.name}</b>
                <span>
                  {data.chats.filter((chat) => chat.person === employee.id).at(-1)?.body ||
                    "Start a conversation"}
                </span>
              </button>
            ))}
          </aside>
          <section className="project-panel">
            <h2>{name(person)}</h2>
            <div className="demo-chat-history">
              {data.chats
                .filter((chat) => chat.person === person)
                .map((chat) => (
                  <article className={chat.from === "Alex Morgan" ? "outgoing" : ""} key={chat.id}>
                    <b>{chat.from}</b>
                    <p>{chat.body}</p>
                    <small>{chat.at}</small>
                  </article>
                ))}
            </div>
            <form
              className="demo-form"
              onSubmit={(event) =>
                submit(event, (form) =>
                  update(
                    (value) => ({
                      ...value,
                      chats: [
                        ...value.chats,
                        {
                          id: crypto.randomUUID(),
                          person,
                          from:
                            formValue(form, "sender") === "worker" ? name(person) : "Alex Morgan",
                          body: formValue(form, "body"),
                          at: new Date().toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          }),
                        },
                      ],
                    }),
                    "Demo message sent",
                  ),
                )
              }
            >
              <label>
                Message
                <textarea name="body" required maxLength={2000} />
              </label>
              <select name="sender" aria-label="Demo sender">
                <option value="manager">Send as manager</option>
                <option value="worker">Simulate worker reply</option>
              </select>
              <button className="manager-add-button">Send message</button>
            </form>
          </section>
        </div>
      )}
      {section === "Team" && (
        <section className="project-panel">
          <input
            placeholder="Find an employee"
            aria-label="Search employees"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="demo-project-grid">
            {base.employees
              .filter((employee) => employee.name.toLowerCase().includes(query.toLowerCase()))
              .map((employee) => (
                <article key={employee.id}>
                  <span className="project-presence-avatar">
                    {employee.name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")}
                  </span>
                  <h2>{employee.name}</h2>
                  <p>
                    {employee.team} · #{employee.no}
                  </p>
                  <p>
                    {data.jobs.filter((job) => job.assignee === employee.id).length} assigned tasks
                  </p>
                  <select
                    aria-label={`Worksite for ${employee.name}`}
                    value={data.locations[employee.id] || "office"}
                    onChange={(event) =>
                      update(
                        (value) => ({
                          ...value,
                          locations: { ...value.locations, [employee.id]: event.target.value },
                        }),
                        "Worksite assignment updated",
                      )
                    }
                  >
                    {sites.map((site) => (
                      <option value={site.id} key={site.id}>
                        {site.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      setPerson(employee.id);
                      setSection("Messages");
                    }}
                  >
                    Open conversation
                  </button>
                </article>
              ))}
          </div>
        </section>
      )}
      {(section === "Requests" || section === "Corrections") && (
        <div className="demo-project-grid">
          {data.reviews
            .filter((item) =>
              section === "Corrections"
                ? item.title.includes("correction")
                : !item.title.includes("correction"),
            )
            .map((item) => (
              <section className="project-panel" key={item.id}>
                <span className="manager-task-tag purple">{item.status}</span>
                <h2>{item.title}</h2>
                <b>{item.name}</b>
                <p>{item.detail}</p>
                {item.status === "Pending" ? (
                  <div className="demo-form">
                    <label>
                      Decision reason
                      <input id={`reason-${item.id}`} required />
                    </label>
                    <div>
                      <button onClick={() => review(item.id, "Approved")}>Approve</button>
                      <button onClick={() => review(item.id, "Rejected")}>Reject</button>
                    </div>
                  </div>
                ) : (
                  <p>Decision: {item.reason}</p>
                )}
              </section>
            ))}
        </div>
      )}
      {section === "Announcements" && (
        <div className="demo-two">
          {notesForm(true)}
          <section className="project-panel">
            <h2>Company news</h2>
            {data.news.map((item) => (
              <article className="demo-list-row" key={item.id}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <small>Demo announcement · saved locally</small>
                <button
                  onClick={() =>
                    update(
                      (value) => ({
                        ...value,
                        news: value.news.filter((news) => news.id !== item.id),
                      }),
                      "Announcement removed",
                    )
                  }
                >
                  Remove
                </button>
              </article>
            ))}
          </section>
        </div>
      )}
      {section === "Policies" && (
        <form
          className="project-panel demo-form"
          onSubmit={(event) =>
            submit(event, (form) =>
              update(
                (value) => ({
                  ...value,
                  policies: { lunch: Number(form.get("lunch")), stop: formValue(form, "stop") },
                }),
                "Demo policy saved",
              ),
            )
          }
        >
          <h2>Working day & privacy</h2>
          <label>
            Lunch allowance (minutes)
            <input
              name="lunch"
              type="number"
              min={0}
              max={180}
              defaultValue={data.policies.lunch}
              required
            />
          </label>
          <label>
            Tracking cut-off
            <input name="stop" type="time" defaultValue={data.policies.stop} required />
          </label>
          <p>
            Lunch and personal breaks hide worksite presence. Off-duty tracking is disabled. These
            settings affect sample records only.
          </p>
          <button className="manager-add-button">Save policy</button>
        </form>
      )}
      {section === "Audit" && (
        <section className="project-panel">
          <h2>Demo activity trail</h2>
          {data.audit.map((entry, index) => (
            <div className="demo-list-row" key={`${entry}-${index}`}>
              {entry}
            </div>
          ))}
        </section>
      )}
      {section === "Employee Access" && (
        <section className="project-panel">
          <h2>Employee Access</h2>
          {import.meta.env.DEV && <div className="demo-list-row"><div><strong>Alex Test · EMP-1042</strong><p>Reusable local activation code: <code>SHIFT-1042</code></p><p>Separate test database. Attendance changes stay local.</p><a href="http://127.0.0.1:8083/?test=employee" target="_blank" rel="noreferrer">Open test worker app</a></div></div>}
          <h3>Supervised attendance</h3>
          <p>
            Record attendance for a worker whose phone is unavailable. Every action records who was
            affected and the supervisor’s reason.
          </p>
          <form
            className="demo-form"
            onSubmit={(event) =>
              submit(event, (form) => {
                const id = formValue(form, "employee");
                const shift = base.shifts.find(
                  (shift) => shift.employeeId === id && shift.date === base.today,
                );
                const type = formValue(form, "action") as EventType;
                if (!shift || !canTransition(stateFor(shift.id), type)) {
                  toast.error(
                    "This action is not allowed in the employee’s current attendance state.",
                  );
                  return false;
                }
                const capturedAt = Math.max(
                  new Date(`${base.today}T12:00:00Z`).getTime(),
                  ...events
                    .filter((event) => event.shiftId === shift.id)
                    .map((event) => event.capturedAt + 60000),
                );
                const action: AttendanceEvent = {
                  id: crypto.randomUUID(),
                  employeeId: id,
                  shiftId: shift.id,
                  type,
                  capturedAt,
                  sync: "synced",
                  note: formValue(form, "reason"),
                };
                update(
                  (value) => ({ ...value, demoEvents: [...value.demoEvents, action] }),
                  `${name(id)} · ${type.replaceAll("_", " ")} · Supervisor Alex Morgan · ${formValue(form, "reason")}`,
                );
                return undefined;
              })
            }
          >
            <label>
              Employee
              <select name="employee">
                {base.employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Action
              <select name="action">
                <option value="clock_in">Clock in</option>
                <option value="start_lunch">Start lunch</option>
                <option value="end_lunch">Return from lunch</option>
                <option value="clock_out">Clock out</option>
                <option value="start_personal">Start personal break</option>
                <option value="end_personal">End personal break</option>
              </select>
            </label>
            <label>
              Reason
              <input
                name="reason"
                required
                minLength={5}
                placeholder="Phone unavailable; worker present"
              />
            </label>
            <button className="manager-add-button">Record supervised demo action</button>
          </form>
        </section>
      )}
      <Dialog open={create} onOpenChange={setCreate}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogTitle>Create task</DialogTitle>
          <DialogDescription>
            Schedule work, choose its location and assign the team.
          </DialogDescription>
          <form
            className="demo-form"
            onSubmit={(event) =>
              submit(event, (form) => {
                const id = crypto.randomUUID();
                const assignees = form.getAll("team").map(String);
                if (!assignees.length) {
                  toast.error("Choose at least one team member.");
                  return false;
                }
                const start = formValue(form, "start"),
                  end = formValue(form, "end");
                if (end <= start) {
                  toast.error("End time must be after start time.");
                  return false;
                }
                const job: Job = {
                  id,
                  shiftId: "demo-shift",
                  title: formValue(form, "title"),
                  instructions: formValue(form, "instructions"),
                  date: formValue(form, "date"),
                  start,
                  end,
                  destination: formValue(form, "destination"),
                  supervisor: "Alex Morgan",
                  status: "assigned",
                  assignee: assignees[0]!,
                };
                update(
                  (value) => ({
                    ...value,
                    jobs: [...value.jobs, job],
                    team: [
                      ...value.team,
                      ...assignees.map((employeeId) => ({
                        jobId: id,
                        employeeId,
                        name: name(employeeId),
                        team: "Operations",
                      })),
                    ],
                  }),
                  "Task created",
                );
                setCreate(false);
                return undefined;
              })
            }
          >
            <label>
              Task name
              <input name="title" required maxLength={120} />
            </label>
            <label>
              Instructions
              <textarea name="instructions" maxLength={2000} />
            </label>
            <label>
              Date
              <input name="date" type="date" defaultValue={base.today} required />
            </label>
            <div className="demo-two">
              <label>
                Starts
                <input name="start" type="time" defaultValue="09:00" required />
              </label>
              <label>
                Ends
                <input name="end" type="time" defaultValue="10:00" required />
              </label>
            </div>
            <label>
              Job location
              <select name="destination">
                {sites.map((site) => (
                  <option key={site.id}>{site.name}</option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>Assigned team</legend>
              {base.employees.map((employee) => (
                <label className="demo-checkbox" key={employee.id}>
                  <input type="checkbox" name="team" value={employee.id} />
                  {employee.name}
                </label>
              ))}
            </fieldset>
            <button className="manager-add-button">Create task</button>
          </form>
        </DialogContent>
      </Dialog>
    </ManagerFrame>
  );
}
