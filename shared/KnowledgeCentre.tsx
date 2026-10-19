import { useEffect, useState } from "react";
import { ThemedSelect } from "./ThemedSelect";
import type { KnowledgeResponse, KnowledgeRpc } from "./knowledge";
export function KnowledgeCentre({
  rpc,
  manager = false,
  onChanged,
  refreshKey,
}: {
  rpc: KnowledgeRpc;
  manager?: boolean;
  onChanged: () => void;
  refreshKey?: object;
}) {
  const [data, setData] = useState<KnowledgeResponse>({
      entries: [],
      acknowledgements: [],
      employees: [],
      me: "",
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(""),
    [articleId, setArticleId] = useState(""),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [category, setCategory] = useState("article"),
    [published, setPublished] = useState(false);
  useEffect(() => {
    let active = true;
    rpc("list", {})
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [rpc, refreshKey]);
  async function act(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      setData(await rpc(action, payload));
      onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update company knowledge");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const latest = data.entries.filter(
    (e) =>
      !data.entries.some((other) => other.article_id === e.article_id && other.version > e.version),
  );
  const visible = latest.filter((e) =>
    `${e.title} ${e.body}`.toLowerCase().includes(query.toLowerCase()),
  );
  const current = data.entries.find((e) => e.id === selected);
  const receipts = current ? data.acknowledgements.filter((a) => a.versionId === current.id) : [];
  const acknowledged = receipts.some((a) => a.employeeId === data.me);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (
      await act("create", {
        id: crypto.randomUUID(),
        ...(articleId ? { articleId } : {}),
        title,
        body,
        category,
        published,
      })
    ) {
      setArticleId("");
      setTitle("");
      setBody("");
      setPublished(false);
    }
  }
  function chooseArticle(id: string) {
    setArticleId(id);
    const e = latest.find((e) => e.article_id === id);
    setTitle(e?.title ?? "");
    setBody(e?.body ?? "");
    setCategory(e?.category ?? "article");
    setPublished(false);
  }
  return (
    <section
      className={manager ? "project-panel" : ""}
      style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 16, marginTop: 16 }}
    >
      <h3>Company knowledge & policies</h3>
      {error && <p role="alert">{error}</p>}
      <label>
        Search company knowledge
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {!visible.length && <p>No matching published articles or policies.</p>}
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {visible.map((e) => (
          <button
            type="button"
            key={e.id}
            onClick={() => setSelected(e.id)}
            style={{ textAlign: "left", padding: 12 }}
          >
            {e.title} · {e.category} · Version {e.version}
            {!e.published ? " · Draft" : ""}
          </button>
        ))}
      </div>
      {current && (
        <article style={{ marginTop: 16 }}>
          <h4>{current.title}</h4>
          <label>
            Version
            <ThemedSelect value={current.id} onValueChange={setSelected}>
              {data.entries
                .filter((e) => e.article_id === current.article_id)
                .sort((a, b) => b.version - a.version)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    Version {e.version}
                    {!e.published ? " · Draft" : ""}
                  </option>
                ))}
            </ThemedSelect>
          </label>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{current.body}</p>
          {current.category === "policy" && current.published && (
            <>
              <p>
                Acknowledgement confirms you have read this exact version. It is not an electronic
                signature.
              </p>
              <button
                disabled={busy || acknowledged}
                type="button"
                onClick={() => act("acknowledge", { versionId: current.id })}
              >
                {acknowledged ? "Acknowledged this version" : "I have read this version"}
              </button>
              {manager && (
                <>
                  <h4>Acknowledgements ({receipts.length})</h4>
                  {receipts.map((a) => (
                    <p key={a.employeeId}>
                      {a.employeeName} · {new Date(a.acknowledgedAt).toLocaleDateString()}
                    </p>
                  ))}
                  <h4>Not yet acknowledged</h4>
                  {data.employees
                    .filter((e) => !receipts.some((a) => a.employeeId === e.id))
                    .map((e) => (
                      <p key={e.id}>{e.name}</p>
                    ))}
                </>
              )}
            </>
          )}
        </article>
      )}
      {manager && (
        <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 20 }}>
          <h4>Create an article or policy version</h4>
          <p>
            Saved versions cannot be edited. To publish a draft or change text, create another
            version.
          </p>
          <label>
            Article
            <ThemedSelect value={articleId} onValueChange={chooseArticle}>
              <option value="">New article or policy</option>
              {latest.map((e) => (
                <option key={e.article_id} value={e.article_id}>
                  {e.title} · New version
                </option>
              ))}
            </ThemedSelect>
          </label>
          <label>
            Category
            <ThemedSelect value={category} onValueChange={setCategory} disabled={!!articleId}>
              <option value="article">Article</option>
              <option value="policy">Policy</option>
            </ThemedSelect>
          </label>
          <label>
            Title
            <input
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Plain text
            <textarea
              required
              maxLength={20000}
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <label style={{ display: "flex", gap: 8 }}>
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
            />
            Publish for employees now
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Saving…" : published ? "Publish new version" : "Save draft version"}
          </button>
        </form>
      )}
    </section>
  );
}
