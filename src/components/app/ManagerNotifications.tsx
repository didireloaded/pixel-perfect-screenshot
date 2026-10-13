import { useState } from "react";
import { Bell, ChevronRight, Check, Search } from "lucide-react";
import { useAttendance } from "@/lib/app-store";
import { managerNotifications } from "../../../shared/manager-notifications";
import type { ManagerSection } from "./manager-sections";
export function ManagerNotifications({
  onSelect,
}: {
  onSelect: (section: ManagerSection) => void;
}) {
  const d = useAttendance();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [query, setQuery] = useState("");
  const all = managerNotifications(d);
  const notifications = all.filter(
    (item) =>
      (!unreadOnly || !item.read) &&
      `${item.title} ${item.detail}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="project-panel">
      <div className="project-panel-head">
        <div>
          <h2>Notifications</h2>
          <p className="project-panel-sub">
            {all.filter((item) => !item.read).length} unread · registrations, requests, messages and
            worksite alerts
          </p>
        </div>
        <Bell size={22} />
      </div>
      <div className="my-5 flex flex-wrap gap-3">
        <button
          className={`sl-map-tool ${!unreadOnly ? "selected" : ""}`}
          aria-pressed={!unreadOnly}
          onClick={() => setUnreadOnly(false)}
        >
          All
        </button>
        <button
          className={`sl-map-tool ${unreadOnly ? "selected" : ""}`}
          aria-pressed={unreadOnly}
          onClick={() => setUnreadOnly(true)}
        >
          Unread
        </button>
        <label className="flex flex-1 gap-2 items-center rounded-xl bg-muted px-3">
          <Search size={16} />
          <input
            aria-label="Search notifications"
            className="w-full bg-transparent py-3 text-sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notifications"
          />
        </label>
      </div>
      <div className="space-y-3">
        {notifications.map((item) => (
          <article
            key={item.id}
            className={`flex gap-4 items-center rounded-2xl p-4 ${item.read ? "border border-border" : "bg-[#eee9fe]"}`}
          >
            <Bell size={18} className="shrink-0" />
            <button
              className="min-w-0 flex-1 text-left"
              onClick={async () => {
                if (item.read || (await d.command("read_manager_notification", { id: item.id })))
                  onSelect(item.section);
              }}
              disabled={d.busy || !d.online}
            >
              <b className="text-sm">{item.title}</b>
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{item.detail}</p>
              <small className="text-muted-foreground">
                {item.at
                  ? new Date(item.at).toLocaleString([], { timeZone: d.company.timezone })
                  : "Registration pending"}
              </small>
            </button>
            {!item.read && (
              <button
                className="project-icon-button"
                aria-label={`Mark read: ${item.title}`}
                disabled={d.busy || !d.online}
                onClick={() => void d.command("read_manager_notification", { id: item.id })}
              >
                <Check size={17} />
              </button>
            )}
            <ChevronRight size={17} />
          </article>
        ))}
      </div>
      {!notifications.length && (
        <p className="project-empty">
          {unreadOnly ? "You're all caught up." : "No matching notifications."}
        </p>
      )}
    </section>
  );
}
