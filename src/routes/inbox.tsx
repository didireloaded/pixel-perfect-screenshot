import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarDays, Megaphone } from "lucide-react";
import { EmployeeShell } from "@/components/app/EmployeeShell";
import { Button } from "@/components/ui/button";
import { useAttendance } from "@/lib/app-store";

export const Route = createFileRoute("/inbox")({ component: Inbox });
type Section = "Messages" | "News" | "Events";

function Inbox() {
  const d = useAttendance();
  const [section, setSection] = useState<Section>("Messages");
  const messages = d.messages.filter(
    (message) => d.role === "manager" || message.recipientId === d.me || message.senderId === d.me,
  );
  const roots = messages.filter((message) => message.id === message.threadId);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const news = d.notices.filter((notice) => notice.kind !== "event");
  const events = d.notices.filter((notice) => notice.kind === "event");
  const counts = { Messages: roots.length, News: news.length, Events: events.length };
  return (
    <EmployeeShell title="Inbox">
      <section className="card-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          From your company
        </p>
        <h2 className="mt-1 text-2xl font-bold">Stay in the loop</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Direct messages, company news and upcoming events in one place.
        </p>
        <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-muted p-1">
          {(["Messages", "News", "Events"] as const).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setSection(name)}
              aria-pressed={section === name}
              className={`rounded-xl px-2 py-3 text-xs font-semibold ${section === name ? "bg-white text-primary shadow-sm" : "text-muted-foreground"}`}
            >
              {name}
              <span className="ml-1 opacity-60">{counts[name]}</span>
            </button>
          ))}
        </div>
      </section>
      {section === "Messages" && (
        <section className="space-y-3" aria-label="Direct messages">
          {!messages.length && (
            <p className="card-surface p-5 text-sm text-muted-foreground">
              No direct messages yet. Your manager can start a conversation here.
            </p>
          )}
          {roots.map((root) => {
            const thread = messages
              .filter((m) => m.threadId === root.id)
              .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
            return (
              <article key={root.id} className="card-surface p-5">
                <h3 className="font-bold">{root.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{root.senderName}</p>
                <div className="mt-4 space-y-3">
                  {thread.map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[85%] rounded-2xl p-3 text-sm ${message.senderId === d.me ? "ml-auto bg-primary text-white" : "bg-muted"}`}
                    >
                      <p className="whitespace-pre-wrap">{message.body}</p>
                      <p className="mt-1 text-xs opacity-70">
                        {new Date(message.sentAt).toLocaleString()}
                      </p>
                      {message.recipientId === d.me && !message.readAt && (
                        <button
                          className="mt-2 text-xs underline"
                          disabled={d.busy || !d.online}
                          onClick={() => void d.command("read_message", { id: message.id })}
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <form
                  className="mt-4 flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const body = replies[root.id]?.trim();
                    if (body)
                      void d.command("reply_message", { threadId: root.id, body }).then((ok) => {
                        if (ok) setReplies((prev) => ({ ...prev, [root.id]: "" }));
                      });
                  }}
                >
                  <input
                    aria-label={`Reply to ${root.senderName}`}
                    className="min-w-0 flex-1 rounded-xl bg-muted px-3 py-2 text-sm"
                    maxLength={2000}
                    placeholder="Write a reply…"
                    value={replies[root.id] ?? ""}
                    onChange={(e) => setReplies((prev) => ({ ...prev, [root.id]: e.target.value }))}
                  />
                  <Button disabled={d.busy || !d.online || !replies[root.id]?.trim()}>Send</Button>
                </form>
              </article>
            );
          })}
        </section>
      )}
      {section === "News" && (
        <section className="space-y-3" aria-label="Company news">
          {!news.length && (
            <p className="card-surface p-5 text-sm text-muted-foreground">No company news yet.</p>
          )}
          {news.map((notice) => (
            <article key={notice.id} className="card-surface p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-tint-cream text-warning">
                  <Megaphone className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase text-primary">
                    {notice.kind.replaceAll("_", " ")}
                  </p>
                  <h3 className="mt-1 font-bold">{notice.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {notice.startsOn}
                    {notice.endsOn !== notice.startsOn ? `–${notice.endsOn}` : ""}
                  </p>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                {notice.body}
              </p>
              {notice.requiresAck && !notice.acknowledged && (
                <Button
                  variant="soft"
                  size="sm"
                  className="mt-4"
                  disabled={d.busy || !d.online}
                  onClick={() => void d.command("ack_notice", { id: notice.id })}
                >
                  Acknowledge
                </Button>
              )}
            </article>
          ))}
        </section>
      )}
      {section === "Events" && (
        <section className="space-y-3" aria-label="Company events">
          {!events.length && (
            <p className="card-surface p-5 text-sm text-muted-foreground">
              No company events scheduled.
            </p>
          )}
          {events.map((event) => (
            <article key={event.id} className="card-surface flex gap-3 p-5">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-tint-blue text-info">
                <CalendarDays />
              </span>
              <div className="min-w-0">
                <h3 className="font-bold">{event.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {event.startsOn}
                  {event.startsTime ? ` · ${event.startsTime}` : ""}
                </p>
                <p className="mt-2 text-sm">{event.body}</p>
                <Link
                  to="/calendar"
                  className="mt-3 inline-block text-xs font-semibold text-primary"
                >
                  View calendar →
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </EmployeeShell>
  );
}
