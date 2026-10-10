import { useMemo, useState, type FormEvent } from "react";
import {
  CalendarDays,
  Filter,
  MessageCircle,
  Plus,
  Search,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import type { Job, JobStep, JobTeamMember, JobComment } from "../../../shared/attendance";

const columns = [
  { key: "upcoming", label: "Upcoming", tone: "sky" },
  { key: "assigned", label: "Assigned", tone: "green" },
  { key: "in_progress", label: "In progress", tone: "orange" },
  { key: "completed", label: "Completed", tone: "rose" },
] as const;

export function ManagerJobBoard({
  jobs,
  steps,
  team,
  comments = [],
  names,
  today,
  onAdd,
  onComment,
}: {
  jobs: Job[];
  steps: JobStep[];
  team: JobTeamMember[];
  comments?: JobComment[];
  names: (id: string) => string;
  today: string;
  onAdd: () => void;
  onComment?: (jobId: string, body: string) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [date, setDate] = useState("");
  const [sort, setSort] = useState<"soonest" | "latest">("soonest");
  const [multi, setMulti] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
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
      <div className="manager-board-filters">
        <span className="manager-view-pill">▦ &nbsp; Pipeline view</span>
        <span className="manager-board-count">{visible.length} tasks</span>
        <label className="manager-search">
          <Search size={16} />
          <input
            aria-label="Search tasks"
            placeholder="Search tasks or workers"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="manager-date">
          <CalendarDays size={16} />
          <input
            aria-label="Filter by date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <button type="button" aria-pressed={multi} onClick={() => setMulti((value) => !value)}>
          <Filter size={16} /> Multi-person
        </button>
        <button
          type="button"
          onClick={() => setSort((value) => (value === "soonest" ? "latest" : "soonest"))}
        >
          <SlidersHorizontal size={16} /> {sort === "soonest" ? "Soonest" : "Latest"}
        </button>
        <button type="button" onClick={onAdd} className="manager-add-button">
          <Plus size={16} /> Add New
        </button>
      </div>
      <div className="manager-board-columns">
        {columns.map((column) => {
          const items = visible.filter((job) =>
            column.key === "upcoming"
              ? job.status === "assigned" && job.date > today
              : column.key === "assigned"
                ? job.status === "assigned" && job.date <= today
                : job.status === column.key,
          );
          return (
            <section key={column.key} className="manager-board-column">
              <div className="manager-board-column-head">
                <span className={`manager-board-marker ${column.tone}`} />
                <h3>{column.label}</h3>
                <small>{items.length} tasks</small>
              </div>
              <div className="manager-board-stack">
                {items.map((job) => {
                  const taskSteps = steps.filter((step) => step.jobId === job.id);
                  const done = taskSteps.filter((step) => step.completedAt).length;
                  const members = team.filter((member) => member.jobId === job.id);
                  const count = comments.filter((comment) => comment.jobId === job.id).length;
                  return (
                    <button
                      type="button"
                      key={job.id}
                      onClick={() => setSelectedId(job.id)}
                      className={`manager-job-card ${column.tone}`}
                    >
                      <div className="manager-job-card-inner">
                        <p className="manager-job-meta">
                          {job.date} · {job.start}–{job.end}
                        </p>
                        <h4>{job.title}</h4>
                        <p className="manager-job-description">
                          {job.instructions || job.destination || "No instructions added"}
                        </p>
                        <div className="manager-job-person">
                          <span>
                            {names(job.assignee)
                              .split(" ")
                              .map((part) => part[0])
                              .join("")
                              .slice(0, 2)}
                          </span>
                          <b>{names(job.assignee)}</b>
                          <small>
                            {taskSteps.length ? `${done}/${taskSteps.length} steps` : "Assigned"}
                          </small>
                        </div>
                      </div>
                      <div className="manager-job-footer">
                        <span>
                          <MessageCircle size={13} />
                          {count}
                        </span>
                        <span>
                          <Users size={13} />
                          {members.length || 1}
                        </span>
                        <span>{job.destination}</span>
                      </div>
                    </button>
                  );
                })}
                {items.length === 0 && (
                  <p className="manager-board-empty">No tasks in this stage</p>
                )}
                <button type="button" className="manager-column-add" onClick={onAdd}>
                  <Plus size={15} /> Add New
                </button>
              </div>
            </section>
          );
        })}
      </div>
      {selected && (
        <div className="manager-task-backdrop" onClick={() => setSelectedId(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.title} details`}
            className="manager-task-detail"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="manager-detail-close"
              aria-label="Close details"
              onClick={() => setSelectedId(null)}
            >
              ×
            </button>
            <p className="manager-eyebrow">TASK DETAIL</p>
            <h2>{selected.title}</h2>
            <p className="manager-detail-muted">
              {selected.date} · {selected.start}–{selected.end} · {selected.destination}
            </p>
            <p className="manager-detail-copy">
              {selected.instructions || "No instructions added."}
            </p>
            <div className="manager-detail-assignee">
              <Users size={16} /> {names(selected.assignee)} ·{" "}
              {selected.status.replaceAll("_", " ")}
            </div>
            <h3>Progress</h3>
            <div className="manager-detail-steps">
              {steps
                .filter((step) => step.jobId === selected.id)
                .map((step) => (
                  <p key={step.id}>
                    {step.completedAt ? "✓" : "○"} {step.label}
                  </p>
                ))}
              {!steps.some((step) => step.jobId === selected.id) && <p>No steps yet.</p>}
            </div>
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
                <p className="manager-detail-muted">No comments yet.</p>
              )}
            </div>
            <form onSubmit={send}>
              <label htmlFor="manager-task-comment">Add a comment</label>
              <textarea
                id="manager-task-comment"
                maxLength={2000}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Write an update for the team"
              />
              <button disabled={!draft.trim() || sending || !onComment}>Post comment</button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
