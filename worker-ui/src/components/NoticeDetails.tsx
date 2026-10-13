import { useState } from "react";
import { ChevronRight, Check } from "lucide-react";
import type { CompanyNotice } from "../../../shared/attendance";
import { WorkerCard, WorkerSheet, WorkerAction } from "./WorkerUI";
export function NoticeCard({
  notice,
  busy,
  onAcknowledge,
}: {
  notice: CompanyNotice;
  busy: boolean;
  onAcknowledge: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <WorkerCard>
        <button className="w-full text-left" onClick={() => setOpen(true)}>
          <p className="worker-eyebrow">
            {notice.kind === "event" ? "COMPANY EVENT" : "COMPANY UPDATE"}
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">{notice.title}</h3>
            <ChevronRight size={16} />
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-sub">{notice.body}</p>
          <p className="mt-3 text-xs font-semibold text-brand">Read update</p>
        </button>
      </WorkerCard>
      {open && (
        <WorkerSheet title={notice.title} onClose={() => setOpen(false)}>
          <p className="text-xs text-sub">
            {notice.startsOn}
            {notice.endsOn !== notice.startsOn ? ` – ${notice.endsOn}` : ""}
            {notice.startsTime ? ` · ${notice.startsTime}` : ""}
          </p>
          <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed">{notice.body}</p>
          {notice.requiresAck && (
            <div className="mt-5">
              {notice.acknowledged ? (
                <p className="flex gap-2 text-xs text-ok">
                  <Check size={16} /> You acknowledged this update
                </p>
              ) : (
                <WorkerAction disabled={busy} onClick={() => void onAcknowledge()}>
                  {busy ? "Saving…" : "I’ve read this update"}
                </WorkerAction>
              )}
            </div>
          )}
        </WorkerSheet>
      )}
    </>
  );
}
