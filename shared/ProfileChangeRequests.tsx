import { useEffect, useRef, useState } from "react";
import type {
  ContactProfile,
  ProfileChangeData,
  ProfileChangeRpc,
} from "./profile-change-requests";
const fields = [
  ["name", "Name", 100],
  ["contactPhone", "Contact phone", 40],
  ["jobTitle", "Job title", 100],
  ["bio", "Bio", 1000],
] as const;
export function ProfileChangeRequests({
  rpc,
  manager = false,
  onChanged,
  refreshKey = 0,
}: {
  rpc: ProfileChangeRpc;
  manager?: boolean;
  employees?: { id: string; name: string }[];
  onChanged?: () => void;
  refreshKey?: string | number | object;
}) {
  const [data, setData] = useState<ProfileChangeData>();
  const [profile, setProfile] = useState<ContactProfile>({
    name: "",
    contactPhone: "",
    jobTitle: "",
    bio: "",
  });
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = useRef(false);
  useEffect(() => {
    let active = true;
    rpc("list", {})
      .then((v) => {
        if (active) {
          setData(v);
          if (!dirty.current) setProfile(v.currentProfile);
        }
      })
      .catch(() => {
        if (active) setError("Could not load profile requests.");
      });
    return () => {
      active = false;
    };
  }, [rpc, refreshKey]);
  async function run(action: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const result = await rpc(action, payload);
      setData(result);
      dirty.current = false;
      setProfile(result.currentProfile);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save profile request.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card-surface space-y-4 rounded-2xl border p-4">
      <h2 className="font-bold">Profile change requests</h2>
      {!manager && (
        <>
          <p className="text-sm text-muted-foreground">
            Request contact details changes for HR review. Your employee number, sign-in phone and
            access code stay unchanged.
          </p>
          {fields.map(([key, label, max]) => (
            <label className="block text-sm" key={key}>
              {label}
              <textarea
                rows={key === "bio" ? 3 : 1}
                className="block w-full rounded-xl border bg-background p-2"
                maxLength={max}
                value={profile[key]}
                onChange={(e) => {
                  dirty.current = true;
                  setProfile({ ...profile, [key]: e.target.value });
                }}
              />
            </label>
          ))}
          <button
            className="rounded-xl border px-3 py-2"
            disabled={
              busy ||
              !data ||
              !profile.name.trim() ||
              data.requests.some((r) => r.decision === "pending")
            }
            onClick={() => void run("submit", { ...profile })}
          >
            Request changes
          </button>
        </>
      )}
      {manager && (
        <p className="text-sm text-muted-foreground">
          Review contact changes independently. Approval does not change account credentials or
          company permissions.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {data?.requests.length === 0 && (
        <p className="text-sm text-muted-foreground">No profile requests.</p>
      )}
      {data?.requests.map((r) => (
        <article className="rounded-xl border p-3 space-y-2" key={r.id}>
          <p className="font-semibold">
            {r.name} · {r.decision}
          </p>
          <p className="text-xs text-muted-foreground">
            Submitted {new Date(r.submittedAt).toLocaleString()}
          </p>
          {fields
            .filter(([key]) => r.original[key] !== r.proposed[key])
            .map(([key, label]) => (
              <div className="text-sm break-words" key={key}>
                <strong>{label}</strong>
                <p className="text-muted-foreground">Previous: {r.original[key] || "Not set"}</p>
                <p>Requested: {r.proposed[key] || "Not set"}</p>
              </div>
            ))}
          {r.reason && <p className="text-sm">Review: {r.reason}</p>}
          {manager && r.decision === "pending" && (
            <>
              <label className="block text-sm">
                Review reason
                <textarea
                  className="block w-full rounded-xl border bg-background p-2"
                  maxLength={1000}
                  value={reasons[r.id] ?? ""}
                  onChange={(e) => setReasons({ ...reasons, [r.id]: e.target.value })}
                />
              </label>
              <div className="flex gap-2">
                {(["approved", "declined"] as const).map((decision) => (
                  <button
                    className="rounded-xl border px-3 py-2"
                    key={decision}
                    disabled={busy || !reasons[r.id]?.trim()}
                    onClick={() =>
                      void run("review", { requestId: r.id, decision, reason: reasons[r.id] })
                    }
                  >
                    {decision === "approved" ? "Approve" : "Decline"}
                  </button>
                ))}
              </div>
            </>
          )}
        </article>
      ))}
    </section>
  );
}
