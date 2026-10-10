import { useState, type ReactNode } from "react";
import { BriefcaseBusiness, ChevronDown, Search, ShieldCheck, LockKeyhole } from "lucide-react";
import { managerGroups, type ManagerSection } from "./manager-sections";

export function ManagerFrame({
  active,
  onSelect,
  company = "Project Inc.",
  preview = false,
  onRefresh,
  onSignOut,
  onConnect,
  children,
}: {
  active: ManagerSection;
  onSelect: (section: ManagerSection) => void;
  company?: string;
  preview?: boolean;
  onRefresh?: () => void;
  onSignOut?: () => void;
  onConnect?: () => void;
  children: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  return (
    <div className="project-shell">
      <div className="project-workspace">
        <aside className="project-sidebar" aria-label="Manager navigation">
          <div className="project-brand">
            <span className="project-brand-icon">
              <ShieldCheck size={23} />
            </span>
            <b>{company}</b>
            <span className="project-pro">PRO ✦</span>
          </div>
          <label className="project-nav-search">
            <Search size={17} />
            <input
              aria-label="Search navigation"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>⌘ K</kbd>
          </label>
          <div className="project-nav-scroll">
            {managerGroups.map((group) => {
              const items = group.items.filter((item) =>
                item.name.toLowerCase().includes(search.toLowerCase()),
              );
              if (!items.length) return null;
              return (
                <section key={group.label} className="project-nav-group">
                  <button
                    type="button"
                    className="project-group-heading"
                    onClick={() =>
                      setCollapsed((value) => ({ ...value, [group.label]: !value[group.label] }))
                    }
                  >
                    <span>{group.label}</span>
                    <ChevronDown size={15} className={collapsed[group.label] ? "-rotate-90" : ""} />
                  </button>
                  {!collapsed[group.label] && (
                    <div className="project-nav-links">
                      {items.map(({ name, icon: Icon }) => (
                        <button
                          type="button"
                          key={name}
                          onClick={() => onSelect(name)}
                          aria-current={active === name ? "page" : undefined}
                          className={`project-nav-link ${active === name ? "active" : ""}`}
                        >
                          <Icon size={17} />
                          <span>{name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
          <div className="project-sidebar-foot">
            <span className="project-foot-avatar">PI</span>
            <span>
              <b>{company}</b>
              <small>{preview ? "Design preview" : "Manager workspace"}</small>
            </span>
          </div>
        </aside>
        <main className="project-main">
          <div className="project-topbar">
            <div className="project-breadcrumb">
              <BriefcaseBusiness size={17} />
              <span>Home</span>
              <span>/</span>
              <span>Dashboard</span>
              <span>/</span>
              <b>{active}</b>
            </div>
            <div className="project-top-actions">
              {preview ? (
                <>
                  <span className="project-preview-tag">Design preview</span>
                  <button onClick={onConnect}>Connect live account</button>
                </>
              ) : (
                <>
                  <button onClick={onRefresh}>Refresh</button>
                  <button onClick={onSignOut}>Sign out</button>
                </>
              )}
            </div>
          </div>
          <div className="project-page-head">
            <div>
              <h1>
                {active === "Tasks" ? "Task board" : active}{" "}
                <span className="project-private">
                  <LockKeyhole size={12} /> Private
                </span>
              </h1>
              <p>
                {active === "Tasks"
                  ? "Track every assignment, task and team update"
                  : "Project Inc. workspace"}
              </p>
            </div>
            <div className="project-team-avatars" aria-label="Team workspace">
              <span>AM</span>
              <span>DO</span>
              <span>PK</span>
              <b>+ Team</b>
            </div>
          </div>
          <div className="project-main-content">{children}</div>
        </main>
      </div>
    </div>
  );
}
