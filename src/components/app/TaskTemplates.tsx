import { useEffect, useState } from "react";
import { ThemedSelect } from "../../../shared/ThemedSelect";
import type { TaskTemplateData, TaskTemplateRpc } from "../../../shared/task-templates";
export function TaskTemplates({
  rpc,
  jobs = [],
  onApplied,
}: {
  rpc: TaskTemplateRpc;
  jobs?: { id: string; title: string }[];
  onApplied?: () => void;
}) {
  const [data, setData] = useState<TaskTemplateData>();
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [checklist, setChecklist] = useState("");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    rpc("list", {})
      .then((v) => {
        if (active) setData(v);
      })
      .catch(() => {
        if (active) setError("Could not load templates.");
      });
    return () => {
      active = false;
    };
  }, [rpc]);
  async function run(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      setData(await rpc(action, payload));
      if (action === "save") {
        setTitle("");
        setInstructions("");
        setChecklist("");
      }
      if (action === "apply") onApplied?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save template.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card-surface space-y-4 p-5">
      <h2 className="font-bold">Reusable task templates</h2>
      <p className="text-sm text-muted-foreground">
        Save instructions and checklists for repeated work. Apply explicitly; templates never create
        workdays or clock anyone in.
      </p>
      <label className="block text-sm">
        Template title
        <input
          className="block w-full rounded-xl border bg-background p-2"
          value={title}
          maxLength={100}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        Instructions
        <textarea
          className="block w-full rounded-xl border bg-background p-2"
          maxLength={1000}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        Checklist — one item per line
        <textarea
          className="block w-full rounded-xl border bg-background p-2"
          value={checklist}
          maxLength={4830}
          onChange={(e) => setChecklist(e.target.value)}
        />
      </label>
      <button
        className="rounded-xl border px-3 py-2"
        disabled={busy || !title.trim()}
        onClick={() =>
          void run("save", {
            title,
            instructions,
            checklist: checklist
              .split("\n")
              .map((v) => v.trim())
              .filter(Boolean),
          })
        }
      >
        Save template
      </button>
      {error && <p role="alert">{error}</p>}
      <label className="block text-sm">
        Apply checklist to task
        <ThemedSelect
          className="block w-full rounded-xl border bg-background p-2"
          value={selected}
          onValueChange={setSelected}
        >
          <option value="">Choose existing task</option>
          {jobs.map((j) => (
            <option value={j.id} key={j.id}>
              {j.title}
            </option>
          ))}
        </ThemedSelect>
      </label>
      {data?.templates.length === 0 && (
        <p className="text-sm text-muted-foreground">No templates yet.</p>
      )}
      {data?.templates.map((t) => (
        <article className="rounded-xl border p-3 space-y-2" key={t.id}>
          <h3 className="font-semibold">{t.title}</h3>
          <p className="whitespace-pre-wrap text-sm">{t.instructions}</p>
          <ul className="list-disc pl-5 text-sm">
            {t.checklist.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-xl border px-3 py-2"
              disabled={busy || !selected || t.checklist.length === 0}
              onClick={() => void run("apply", { templateId: t.id, jobId: selected })}
            >
              Apply checklist
            </button>
            <button
              className="rounded-xl border px-3 py-2"
              disabled={busy}
              onClick={() => void run("archive", { templateId: t.id })}
            >
              Archive
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
