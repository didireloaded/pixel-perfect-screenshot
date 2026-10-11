import { useMemo, useState, type FormEvent } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Filter,
  MessageCircle,
  Plus,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Job, JobStep, JobTeamMember, JobComment } from "../../../shared/attendance";
const columns = [
  { key: "assigned", label: "Planned", tone: "blue" },
  { key: "in_progress", label: "In Progress", tone: "orange" },
  { key: "completed", label: "Completed", tone: "purple" },
] as const;
const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
export function ManagerJobBoard({
  jobs,
  steps,
  team,
  comments = [],
  names,
  today,
  onAdd,
  onComment,
  onMove,
  onStep,
  onAddStep,
}: {
  jobs: Job[];
  steps: JobStep[];
  team: JobTeamMember[];
  comments?: JobComment[];
  names: (id: string) => string;
  today: string;
  onAdd: () => void;
  onComment?: (jobId: string, body: string) => Promise<boolean>;
  onMove?: (jobId: string, status: Job["status"]) => Promise<boolean>;
  onStep?: (stepId: string, done: boolean) => Promise<boolean>;
  onAddStep?: (jobId: string, label: string) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [date, setDate] = useState("");
  const [sort, setSort] = useState<"soonest" | "latest">("soonest");
  const [multi, setMulti] = useState(false);
  const [filters, setFilters] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [stepDraft, setStepDraft] = useState("");
  const [sending, setSending] = useState(false);
  const visible = useMemo(
    () =>
      jobs
        .filter(
          (job) =>
            (!date || job.date === date) &&
            (!multi || team.filter((member) => member.jobId === job.id).length > 1) &&
            `${job.title} ${job.destination} ${names(job.assignee)}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort(
          (a, b) =>
            (sort === "soonest" ? 1 : -1) *
            `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`),
        ),
    [jobs, date, multi, names, query, sort, team],
  );
  const selected = jobs.find((job) => job.id === selectedId);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !draft.trim() || !onComment) return;
    setSending(true);
    try {
      if (await onComment(selected.id, draft.trim())) setDraft("");
    } finally {
      setSending(false);
    }
  };
  return (
    <section className="manager-board" aria-label="Task board">
      <div className="manager-board-title">
        <div>
          <h1>Tasks</h1>
          <p>Good work starts with a clear plan.</p>
        </div>
        <div>
          <button
            className={`project-icon-button ${filters ? "selected" : ""}`}
            aria-label="Toggle task filters"
            aria-expanded={filters}
            onClick={() => setFilters((value) => !value)}
          >
            <SlidersHorizontal size={18} />
          </button>
          <button className="manager-add-button" onClick={onAdd}>
            <Plus size={16} /> Create Task
          </button>
        </div>
      </div>
      <div className="manager-board-filters">
        <label className="manager-search">
          <Search size={16} />
          <input
            aria-label="Search tasks"
            placeholder="Find a task or team member"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <span className="manager-board-count">{visible.length} tasks</span>
        <button onClick={() => setSort((value) => (value === "soonest" ? "latest" : "soonest"))}>
          <SlidersHorizontal size={15} />
          {sort === "soonest" ? "Soonest first" : "Latest first"}
        </button>
      </div>
      {filters && (
        <div className="manager-filter-panel">
          <label className="manager-date">
            <CalendarDays size={16} />
            <input
              aria-label="Filter by date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <button aria-pressed={multi} onClick={() => setMulti((value) => !value)}>
            <Filter size={15} /> Multi-person teams
          </button>
          <button
            onClick={() => {
              setDate("");
              setMulti(false);
              setQuery("");
            }}
          >
            <X size={15} />
            Clear filters
          </button>
        </div>
      )}
      <div className="manager-board-columns">
        {columns.map((column) => {
          const items = visible.filter((job) => job.status === column.key);
          return (
            <section
              key={column.key}
              className="manager-board-column"
              onDragOver={(event) => {
                if (onMove) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/plain");
                if (onMove && jobs.some((job) => job.id === id)) void onMove(id, column.key);
              }}
            >
              <div className="manager-board-column-head">
                <h2>{column.label}</h2>
                <span>{items.length}</span>
                <button onClick={onAdd} aria-label={`Create task in ${column.label}`}>
                  <Plus size={17} />
                </button>
              </div>
              <div className="manager-board-stack">
                {items.map((job) => {
                  const taskSteps = steps.filter((step) => step.jobId === job.id);
                  const done = taskSteps.filter((step) => step.completedAt).length;
                  const progress =
                    job.status === "completed"
                      ? 100
                      : taskSteps.length
                        ? Math.round((done / taskSteps.length) * 100)
                        : 0;
                  const members = team.filter((member) => member.jobId === job.id);
                  const count = comments.filter((comment) => comment.jobId === job.id).length;
                  const people = members.length
                    ? members.map((member) => member.name)
                    : [names(job.assignee)];
                  return (
                    <button
                      key={job.id}
                      className="manager-job-card"
                      draggable={Boolean(onMove)}
                      onDragStart={(event) => event.dataTransfer.setData("text/plain", job.id)}
                      onClick={() => {
                        setSelectedId(job.id);
                        setDraft("");
                      }}
                    >
                      <div className="manager-job-tag-row">
                        <span className={`manager-task-tag ${column.tone}`}>
                          {job.destination || column.label}
                        </span>
                        <span className="manager-task-status">
                          {job.date > today ? "Upcoming" : column.label}
                        </span>
                      </div>
                      <h3>{job.title}</h3>
                      <p className="manager-job-description">
                        {job.instructions ||
                          "Open this task to see the schedule and assigned team."}
                      </p>
                      <p className="manager-job-meta">
                        <CalendarDays size={12} />
                        {job.date} · {job.start}–{job.end}
                      </p>
                      <div className="manager-job-progress">
                        <span>
                          {taskSteps.length
                            ? `${done}/${taskSteps.length} steps`
                            : job.status === "completed"
                              ? "Complete"
                              : "No checklist"}
                        </span>
                        <b>{progress}%</b>
                      </div>
                      <div className="manager-progress-track">
                        <span style={{ width: `${progress}%` }} />
                      </div>
                      <div className="manager-job-footer">
                        <div
                          className="manager-avatar-stack"
                          aria-label={`Assigned team: ${people.join(", ")}`}
                        >
                          {people.slice(0, 4).map((name, index) => (
                            <span key={`${name}-${index}`} title={name}>
                              {initials(name)}
                            </span>
                          ))}
                          {people.length > 4 && <span>+{people.length - 4}</span>}
                        </div>
                        <span>
                          <Users size={13} />
                          {people.length}
                        </span>
                        <span>
                          <MessageCircle size={13} />
                          {count}
                        </span>
                      </div>
                    </button>
                  );
                })}
                {!items.length && (
                  <div className="manager-board-empty">
                    <CheckCircle2 size={24} />
                    <p>No {column.label.toLowerCase()} tasks</p>
                    <small>
                      {query || date || multi
                        ? "Try adjusting your filters."
                        : "Tasks will appear here as work moves forward."}
                    </small>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent className="manager-task-detail translate-x-0 translate-y-0">
          <DialogTitle>{selected?.title || "Task details"}</DialogTitle>
          <DialogDescription>
            {selected?.date} · {selected?.start}–{selected?.end} · {selected?.destination}
          </DialogDescription>
          {selected && (
            <>
              <p className="manager-detail-copy">
                {selected.instructions || "No instructions added."}
              </p>
              <div className="manager-detail-assignee">
                <Users size={16} />
                {names(selected.assignee)} · {selected.status.replaceAll("_", " ")}
              </div>
              {onMove && (
                <label className="manager-status-control">
                  Move task
                  <select
                    value={selected.status}
                    onChange={(event) =>
                      void onMove(selected.id, event.target.value as Job["status"])
                    }
                  >
                    {columns.map((column) => (
                      <option key={column.key} value={column.key}>
                        {column.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <h3>Assigned team</h3>
              <div className="manager-detail-team">
                {(team.filter((member) => member.jobId === selected.id).length
                  ? team
                      .filter((member) => member.jobId === selected.id)
                      .map((member) => member.name)
                  : [names(selected.assignee)]
                ).map((name) => (
                  <span key={name}>{name}</span>
                ))}
              </div>
              <h3>Checklist</h3>
              <div className="manager-detail-steps">
                {steps
                  .filter((step) => step.jobId === selected.id)
                  .map((step) => (
                    <p key={step.id}>
                      {onStep ? (
                        <label>
                          <input
                            type="checkbox"
                            checked={Boolean(step.completedAt)}
                            onChange={(event) => void onStep(step.id, event.target.checked)}
                          />
                          {step.label}
                        </label>
                      ) : (
                        <>
                          {step.completedAt ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                          {step.label}
                        </>
                      )}
                    </p>
                  ))}
                {!steps.some((step) => step.jobId === selected.id) && <p>No checklist added.</p>}
              </div>
              {onAddStep && (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (stepDraft.trim() && (await onAddStep(selected.id, stepDraft.trim())))
                      setStepDraft("");
                  }}
                >
                  <label htmlFor="manager-new-step">Checklist item</label>
                  <input
                    id="manager-new-step"
                    value={stepDraft}
                    maxLength={200}
                    onChange={(event) => setStepDraft(event.target.value)}
                  />
                  <button disabled={!stepDraft.trim()}>Add checklist item</button>
                </form>
              )}
              <h3>Comments</h3>
              <div className="manager-detail-comments">
                {comments
                  .filter((comment) => comment.jobId === selected.id)
                  .map((comment) => (
                    <article key={comment.id}>
                      <b>{comment.authorName}</b>
                      <time>{new Date(comment.createdAt).toLocaleString()}</time>
                      <p>{comment.body}</p>
                    </article>
                  ))}
                {!comments.some((comment) => comment.jobId === selected.id) && (
                  <p className="manager-detail-muted">Start the conversation with a team update.</p>
                )}
              </div>
              {onComment ? (
                <form onSubmit={send}>
                  <label htmlFor="manager-task-comment">Add a comment</label>
                  <textarea
                    id="manager-task-comment"
                    maxLength={2000}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Write an update for the team"
                  />
                  <button disabled={!draft.trim() || sending}>
                    {sending ? "Posting…" : "Post comment"}
                  </button>
                </form>
              ) : (
                <p className="manager-detail-muted">Connect your account to manage this task.</p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
