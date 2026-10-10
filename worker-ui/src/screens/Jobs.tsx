import { useRef, useState } from "react";
import {
  Briefcase, ChevronRight, MapPin, Map, Check, Clock, Phone, Mail,
  Paperclip, TriangleAlert, CheckCheck, Image as ImageIcon, Flag,
} from "lucide-react";
import { useApp } from "../state";
import {
  Page, DetailPage, Card, Segmented, Pill, EmptyState, Button, Avatar,
  Group, statusTone, Sheet,
} from "../ui";
import { JOBS, JOB_SUPERVISOR, JOB_DONE, BLOCKER_CATEGORIES, TEAM_CONTACT, Job } from "../data";
import { cn } from "../utils/cn";

type Bucket = "today" | "upcoming" | "completed";

export default function JobsScreen() {
  const { push, jobState } = useApp();
  const [bucket, setBucket] = useState<Bucket>("today");
  const list = JOBS.filter((j) =>
    bucket === "completed"
      ? j.bucket === "completed" || jobState[j.id].status === "completed"
      : j.bucket === bucket && jobState[j.id].status !== "completed"
  );

  return (
    <Page title="Jobs">
      <Segmented
        className="mt-4"
        value={bucket}
        onChange={setBucket}
        options={[
          { value: "today", label: "Today" },
          { value: "upcoming", label: "Upcoming" },
          { value: "completed", label: "Completed" },
        ]}
      />
      {list.length === 0 ? (
        <Card className="mt-5">
          <EmptyState
            icon={<Briefcase size={26} />}
            title="No jobs here"
            message={bucket === "today" ? "You have no jobs assigned for today." : bucket === "upcoming" ? "Nothing scheduled ahead — new jobs will appear here." : "Completed jobs will show up here."}
          />
        </Card>
      ) : (
        <Card className="mt-5">
          {list.map((j, i) => {
            const js = jobState[j.id];
            const label = js.status === "completed" ? "Completed" : js.status === "inprogress" ? "In progress" : "Assigned";
            const prog = j.tasks.length ? js.done.length / j.tasks.length : 0;
            return (
              <button
                key={j.id}
                onClick={() => push("jobDetails", { id: j.id })}
                className={cn(
                  "press-row flex w-full items-center gap-3 px-4 py-3.5 text-left",
                  i < list.length - 1 && "border-b border-sep/80 dark:border-dsep/70"
                )}
              >
                <span className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]",
                  js.status === "completed" ? "bg-ok/12 text-[#248A3D] dark:text-[#30D158]" : "bg-brand-soft text-brand dark:bg-brand/20 dark:text-[#9D91F2]"
                )}>
                  {js.status === "completed" ? <Check size={18} strokeWidth={2.6} /> : <Briefcase size={18} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold text-ink dark:text-white">{j.title}</span>
                  <span className="mt-0.5 block text-[13px] tabular-nums text-sub dark:text-dsub">
                    {j.dateLabel.split(" · ")[0] === "Today" ? j.time : `${j.dateLabel.split(" · ")[0]} · ${j.time}`} · {j.site}
                  </span>
                  {js.status === "inprogress" && prog > 0 && prog < 1 && (
                    <span className="mt-1.5 block h-[4px] w-28 overflow-hidden rounded-full bg-fill dark:bg-dfill">
                      <span className="block h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${prog * 100}%` }} />
                    </span>
                  )}
                </span>
                <Pill tone={statusTone(label)}>{label}</Pill>
                <ChevronRight size={17} className="shrink-0 text-sub/70 dark:text-dsub/70" />
              </button>
            );
          })}
        </Card>
      )}
      <p className="mt-4 px-2 text-center text-[13px] text-sub dark:text-dsub">
        Jobs are assigned by your manager and sync automatically.
      </p>
    </Page>
  );
}

// ─── Job details ───────────────────────────────────────────────────────────
export function JobDetails({ params }: { params?: Record<string, any> }) {
  const app = useApp();
  const { pop, jobState, toggleTask, setJobStatus, att } = app;
  const job: Job = JOBS.find((j) => j.id === params?.id) ?? JOBS[0];
  const sup = JOB_SUPERVISOR[job.id];
  const js = jobState[job.id];
  const doneCriteria: string[] = JOB_DONE[job.id] ?? [];
  const jobBlockers = app.blockers.filter((b) => b.jobId === job.id);
  const jobAttachments = app.attachments.filter((a) => a.jobId === job.id);
  const handover = app.handovers[job.id];
  const [blockerOpen, setBlockerOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const done = js.done.length;
  const total = job.tasks.length;
  const allDone = done === total;
  const label = js.status === "completed" ? "Completed" : js.status === "inprogress" ? "In progress" : "Assigned";

  const primaryAction = () => {
    if (js.status === "assigned") {
      setJobStatus(job.id, "inprogress");
      if (att.status === "working") app.startJobAtt(job.id);
      app.toast(`Started · ${job.title}`);
    } else if (js.status === "inprogress") {
      if (att.activeJobId === job.id) app.returnFromJob();
      if (allDone) {
        // Handover first: the next person needs to know what was finished.
        setHandoverOpen(true);
      } else {
        app.toast("Progress saved", "info");
      }
    }
  };

  const finishJob = (note: string, state: "completed" | "blocked") => {
    app.saveHandover(job.id, note, state);
    if (state === "completed") {
      setJobStatus(job.id, "completed");
      app.toast("Job completed · handover saved");
    } else {
      app.toast("Marked as blocked · supervisor notified", "info");
    }
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <DetailPage title="Job Details" onBack={pop} noPad>
        <div className="px-5 pb-36 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink dark:text-white">{job.title}</h1>
              <p className="mt-1.5 flex items-center gap-1.5 text-[15px] tabular-nums text-sub dark:text-dsub">
                <Clock size={14} /> {job.dateLabel} · {job.time}
              </p>
            </div>
            <Pill tone={statusTone(label)} dot>{label}</Pill>
          </div>

          <Group header="Location" className="mt-7">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-info/12 text-info">
                <MapPin size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold text-ink dark:text-white">{job.site}</span>
                <span className="mt-0.5 block text-[13px] text-sub dark:text-dsub">{job.address}</span>
              </span>
              <a
                href={`https://maps.apple.com/?q=${encodeURIComponent(`${job.site}, ${job.address}`)}`}
                target="_blank"
                rel="noreferrer"
                className="press flex shrink-0 items-center gap-1 rounded-full bg-fill px-3 py-1.5 text-[13px] font-semibold text-info dark:bg-dfill"
              >
                <Map size={13} /> Directions
              </a>
            </div>
          </Group>

          <Group header="Instructions" className="mt-6">
            <div className="px-4 py-3.5">
              <p className="text-[15px] leading-relaxed text-ink dark:text-white">{job.description}</p>
              {job.notes && (
                <p className="mt-3 rounded-xl bg-warn/10 px-3.5 py-2.5 text-[14px] leading-snug text-[#C47608] dark:bg-warn/15 dark:text-[#FFB340]">
                  {job.notes}
                </p>
              )}
            </div>
          </Group>

          {doneCriteria.length > 0 && (
            <Group
              header="What “done” means"
              className="mt-6"
              footer="Your supervisor signs off against these, not against how busy the job felt."
            >
              <div className="space-y-2.5 px-4 py-3.5">
                {doneCriteria.map((c) => (
                  <p key={c} className="flex items-start gap-2.5 text-[14.5px] leading-snug text-ink dark:text-white">
                    <CheckCheck size={16} className="mt-px shrink-0 text-ok" />
                    {c}
                  </p>
                ))}
              </div>
            </Group>
          )}

          {sup && (
            <Group header="Supervisor" className="mt-6" footer="Your supervisor for this job signs off the completed checklist.">
              <div className="flex items-center gap-3 px-4 py-3.5">
                <Avatar initials={sup.initials} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold text-ink dark:text-white">{sup.name}</span>
                  <span className="text-[13px] text-sub dark:text-dsub">{sup.role}</span>
                </span>
                <button
                  onClick={() => app.toast(`Message drafted to ${sup.name}`, "info")}
                  className="press shrink-0 rounded-full bg-fill px-3.5 py-1.5 text-[13px] font-semibold text-brand dark:bg-dfill"
                >
                  Message
                </button>
              </div>
            </Group>
          )}

          <Group header="Assigned team" className="mt-6" footer="Team members on this job at the same time as you.">
            {job.team.map((m, i) => {
              const contact = TEAM_CONTACT[m.initials];
              return (
                <div
                  key={m.name}
                  className={cn("flex items-center gap-3 px-4 py-3", i < job.team.length - 1 && "border-b border-sep/80 dark:border-dsep/70")}
                >
                  <Avatar initials={m.initials} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15.5px] font-medium text-ink dark:text-white">{m.name}</span>
                    <span className="block truncate text-[13px] text-sub dark:text-dsub">{m.role}</span>
                  </span>
                  {contact && (
                    <span className="flex shrink-0 gap-1.5">
                      <a
                        href={`tel:${contact.phone.replace(/\s/g, "")}`}
                        className="press flex h-9 w-9 items-center justify-center rounded-full bg-ok/12 text-[#248A3D] dark:text-[#30D158]"
                        aria-label={`Call ${m.name}`}
                      >
                        <Phone size={15} />
                      </a>
                      <a
                        href={`mailto:${contact.email}`}
                        className="press flex h-9 w-9 items-center justify-center rounded-full bg-info/12 text-info"
                        aria-label={`Email ${m.name}`}
                      >
                        <Mail size={15} />
                      </a>
                    </span>
                  )}
                </div>
              );
            })}
          </Group>

          <Group
            header={`Checklist · ${done} of ${total} done`}
            className="mt-6"
            footer={js.status === "assigned" ? "Start the job to begin checking off tasks." : undefined}
          >
            <div className="px-4 py-1">
              <div className="mb-1 mt-2.5 h-[5px] overflow-hidden rounded-full bg-fill dark:bg-dfill">
                <div className="h-full rounded-full bg-ok transition-all duration-500" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
              </div>
            </div>
            {job.tasks.map((t, i) => {
              const checked = js.done.includes(i);
              const disabled = js.status === "assigned";
              return (
                <button
                  key={i}
                  disabled={disabled || js.status === "completed"}
                  onClick={() => toggleTask(job.id, i)}
                  className={cn(
                    "press-row flex w-full items-center gap-3 px-4 py-3 text-left",
                    i < total - 1 && "border-b border-sep/80 dark:border-dsep/70",
                    disabled && "opacity-50"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200",
                      checked ? "border-ok bg-ok" : "border-sub/40 dark:border-dsub/40"
                    )}
                  >
                    {checked && <Check size={14} strokeWidth={3} className="text-white" />}
                  </span>
                  <span className={cn("text-[15px] leading-snug transition-colors", checked ? "text-sub line-through dark:text-dsub" : "text-ink dark:text-white")}>
                    {t}
                  </span>
                </button>
              );
            })}
          </Group>

          {/* ── Proof of work ── */}
          <Group
            header="Photos and documents"
            className="mt-6"
            footer="Attach something only when it is genuine proof of work — a signed sheet, a damage photo, a delivery note."
          >
            {jobAttachments.length === 0 ? (
              <div className="px-4 py-3.5">
                <p className="text-[14px] text-sub dark:text-dsub">Nothing attached to this job yet.</p>
              </div>
            ) : (
              jobAttachments.map((a, i) => (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3",
                    i < jobAttachments.length - 1 && "border-b border-sep/70 dark:border-dsep/70"
                  )}
                >
                  {a.url ? (
                    <img src={a.url} alt={a.name} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-fill text-sub dark:bg-dfill dark:text-dsub">
                      {a.kind === "photo" ? <ImageIcon size={17} /> : <Paperclip size={17} />}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium text-ink dark:text-white">{a.name}</span>
                    <span className="block text-[12px] tabular-nums text-sub dark:text-dsub">
                      {a.size} ·{" "}
                      {new Date(a.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                  <Pill tone={a.url ? "orange" : "green"}>{a.url ? "Saved on phone" : "Confirmed"}</Pill>
                </div>
              ))
            )}
            <div className="border-t border-sep/70 px-4 py-3 dark:border-dsep/70">
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  app.addAttachment(job.id, f);
                  app.toast(`${f.name} attached · saved on this phone`);
                  e.target.value = "";
                }}
              />
              <Button variant="secondary" size="md" onClick={() => fileRef.current?.click()}>
                <Paperclip size={17} /> Add Photo or Document
              </Button>
            </div>
          </Group>

          {/* ── Blockers ── */}
          <Group
            header="Blockers"
            className="mt-6"
            footer="Reporting a blocker tells your supervisor immediately. It never marks the job as failed."
          >
            {jobBlockers.length === 0 ? (
              <div className="px-4 py-3.5">
                <p className="text-[14px] text-sub dark:text-dsub">No blockers reported on this job.</p>
              </div>
            ) : (
              jobBlockers.map((b, i) => (
                <div
                  key={b.id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3",
                    i < jobBlockers.length - 1 && "border-b border-sep/70 dark:border-dsep/70"
                  )}
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bad/12 text-bad">
                    <TriangleAlert size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold text-ink dark:text-white">{b.category}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-sub dark:text-dsub">{b.note}</span>
                  </span>
                  <Pill tone={b.status === "Acknowledged" ? "green" : "orange"}>{b.status}</Pill>
                </div>
              ))
            )}
            {js.status !== "completed" && (
              <div className="border-t border-sep/70 px-4 py-3 dark:border-dsep/70">
                <Button variant="destructive" size="md" onClick={() => setBlockerOpen(true)}>
                  <Flag size={17} /> Report a Blocker
                </Button>
              </div>
            )}
          </Group>

          {/* ── Handover ── */}
          {handover && (
            <Group header="Handover note" className="mt-6" footer="Visible to the next person assigned to this job and to your supervisor.">
              <div className="px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <Pill tone={handover.state === "completed" ? "green" : "red"}>
                    {handover.state === "completed" ? "Completed" : "Left blocked"}
                  </Pill>
                  <span className="text-[12px] tabular-nums text-sub dark:text-dsub">
                    {new Date(handover.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink dark:text-white">{handover.note}</p>
              </div>
            </Group>
          )}
        </div>
      </DetailPage>

      {/* floating primary action */}
      {js.status !== "completed" && (
        <div className="absolute inset-x-0 bottom-0 z-30 px-5 pb-9 pt-3">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-page via-page/90 to-transparent dark:from-dpage dark:via-dpage/90" />
          <div className="relative">
            <Button onClick={primaryAction} variant={js.status === "inprogress" && allDone ? "success" : "primary"}>
              {js.status === "assigned" ? "Start Job" : allDone ? "Complete & Return From Job" : "Return From Job"}
            </Button>
          </div>
        </div>
      )}

      <BlockerSheet
        open={blockerOpen}
        onClose={() => setBlockerOpen(false)}
        jobTitle={job.title}
        onSend={(category, note) => {
          app.reportBlocker(job.id, category, note);
          setBlockerOpen(false);
          app.toast("Blocker sent to your supervisor");
        }}
      />

      <HandoverSheet
        open={handoverOpen}
        onClose={() => setHandoverOpen(false)}
        jobTitle={job.title}
        outstanding={total - done}
        onSave={(note, state) => {
          finishJob(note, state);
          setHandoverOpen(false);
        }}
      />
    </div>
  );
}

// ─── Blocker report ────────────────────────────────────────────────────────
function BlockerSheet({
  open, onClose, jobTitle, onSend,
}: {
  open: boolean;
  onClose: () => void;
  jobTitle: string;
  onSend: (category: string, note: string) => void;
}) {
  const [cat, setCat] = useState<string>(BLOCKER_CATEGORIES[0].label);
  const [note, setNote] = useState("");
  const safety = cat === "Safety concern";
  return (
    <Sheet open={open} onClose={onClose} title="Report a Blocker">
      <div className="space-y-3.5">
        <p className="px-1 text-[13.5px] leading-snug text-sub dark:text-dsub">
          {jobTitle} · your supervisor is notified straight away.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {BLOCKER_CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.label)}
              className={cn(
                "press rounded-btn px-3 py-2.5 text-left transition-all",
                cat === c.label
                  ? "bg-bad text-white shadow-[0_4px_14px_rgba(255,59,48,0.3)]"
                  : "bg-fill text-ink dark:bg-dfill dark:text-white"
              )}
            >
              <span className="block text-[14px] font-semibold leading-tight">{c.label}</span>
              <span className={cn("mt-0.5 block text-[11.5px] leading-tight", cat === c.label ? "text-white/75" : "text-sub dark:text-dsub")}>
                {c.hint}
              </span>
            </button>
          ))}
        </div>
        {safety && (
          <p className="anim-fade-in rounded-xl bg-bad/10 px-3.5 py-2.5 text-[13px] font-medium leading-snug text-bad">
            Stop work first. If anyone is in danger, call your supervisor before sending this.
          </p>
        )}
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What is blocking you, and what would unblock it?"
          className="w-full resize-none rounded-card bg-fill px-4 py-3 text-[15px] leading-relaxed text-ink outline-none placeholder:text-sub/70 focus:ring-2 focus:ring-brand/60 dark:bg-dfill dark:text-white"
        />
        <Button
          variant="destructive"
          disabled={!note.trim()}
          onClick={() => {
            onSend(cat, note.trim());
            setNote("");
          }}
        >
          <Flag size={18} /> Send Blocker
        </Button>
        <Button variant="plain" size="md" onClick={onClose}>Cancel</Button>
      </div>
    </Sheet>
  );
}

// ─── Handover note ─────────────────────────────────────────────────────────
function HandoverSheet({
  open, onClose, jobTitle, outstanding, onSave,
}: {
  open: boolean;
  onClose: () => void;
  jobTitle: string;
  outstanding: number;
  onSave: (note: string, state: "completed" | "blocked") => void;
}) {
  const [state, setState] = useState<"completed" | "blocked">("completed");
  const [note, setNote] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title="Handover">
      <div className="space-y-3.5">
        <p className="px-1 text-[13.5px] leading-snug text-sub dark:text-dsub">
          {jobTitle} · so the next person knows exactly where this stands.
        </p>
        <Segmented
          value={state}
          onChange={(v) => setState(v as "completed" | "blocked")}
          options={[
            { value: "completed", label: "Completed" },
            { value: "blocked", label: "Left blocked" },
          ]}
        />
        {outstanding > 0 && state === "completed" && (
          <p className="rounded-xl bg-warn/12 px-3.5 py-2.5 text-[13px] leading-snug text-[#C47608] dark:text-[#FFB340]">
            {outstanding} checklist {outstanding > 1 ? "steps are" : "step is"} still unticked. Mention them below so
            nobody assumes they were done.
          </p>
        )}
        <textarea
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            state === "completed"
              ? "What was finished, and anything the next person should know?"
              : "What is blocked, why, and what is needed to unblock it?"
          }
          className="w-full resize-none rounded-card bg-fill px-4 py-3 text-[15px] leading-relaxed text-ink outline-none placeholder:text-sub/70 focus:ring-2 focus:ring-brand/60 dark:bg-dfill dark:text-white"
        />
        <Button
          variant={state === "completed" ? "success" : "destructive"}
          disabled={!note.trim()}
          onClick={() => {
            onSave(note.trim(), state);
            setNote("");
          }}
        >
          {state === "completed" ? <><Check size={18} /> Save & Complete Job</> : <><Flag size={18} /> Save & Mark Blocked</>}
        </Button>
        <Button variant="plain" size="md" onClick={onClose}>Not yet</Button>
      </div>
    </Sheet>
  );
}
