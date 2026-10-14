import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Waypoints,
  X,
} from "lucide-react";
import { managerGroups, type ManagerSection } from "./manager-sections";
import { canViewManagerSection } from "../../../shared/permissions";
import type { AccessRole } from "../../../shared/attendance";

export function ManagerFrame({
  active,
  accessRole,
  onSelect,
  company = "Your company",
  logoUrl,
  managerName = "Manager",
  onRefresh,
  onSignOut,
  notificationCount = 0,
  insights,
  children,
}: {
  active: ManagerSection;
  accessRole?: AccessRole | undefined;
  onSelect: (section: ManagerSection) => void;
  company?: string;
  logoUrl?: string | undefined;
  managerName?: string;
  onRefresh?: () => void;
  onSignOut?: () => void;
  notificationCount?: number;
  insights?: ReactNode;
  children: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const account = useRef<HTMLDivElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!expanded || !window.matchMedia("(max-width: 760px)").matches) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const mainElement = main.current;
    document.body.style.overflow = "hidden";
    if (mainElement) mainElement.inert = true;
    navigation.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
      if (event.key !== "Tab") return;
      const buttons = navigation.current?.querySelectorAll<HTMLButtonElement>("button");
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const resized = () => {
      if (!window.matchMedia("(max-width: 760px)").matches) setExpanded(false);
    };
    document.addEventListener("keydown", key);
    window.addEventListener("resize", resized);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (mainElement) mainElement.inert = false;
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", resized);
      previous?.focus();
    };
  }, [expanded]);
  useEffect(() => {
    if (!accountOpen) return;
    const close = (event: PointerEvent) => {
      if (!account.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
    };
  }, [accountOpen]);
  const select = (section: ManagerSection) => {
    onSelect(section);
    setSearch("");
    if (window.innerWidth < 760) setExpanded(false);
  };
  const matches = managerGroups
    .flatMap((group) => group.items.map((item) => ({ name: item.name, icon: item.icon })))
    .filter(
      (item) =>
        canViewManagerSection(accessRole, item.name) &&
        item.name.toLowerCase().includes(search.toLowerCase()),
    );
  return (
    <div className={`project-shell ${expanded ? "nav-expanded" : ""}`}>
      {expanded && (
        <button
          className="project-mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setExpanded(false)}
        />
      )}
      <div className="project-workspace">
        <aside ref={navigation} className="project-sidebar" aria-label="Manager navigation">
          <button
            className="project-brand"
            aria-label={`${company} · toggle navigation`}
            onClick={() => setExpanded((value) => !value)}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-9 w-9 rounded-lg object-contain" />
            ) : (
              <Waypoints size={30} strokeWidth={1.8} />
            )}
            <span>
              {company}
              <small>Shiftline workspace</small>
            </span>
          </button>
          <div className="project-nav-scroll">
            {managerGroups.map((group) => (
              <section key={group.label} className="project-nav-group">
                <p className="project-group-heading">{group.label}</p>
                <div className="project-nav-links">
                  {group.items
                    .filter((item) => canViewManagerSection(accessRole, item.name))
                    .map(({ name, icon: Icon }) => (
                      <button
                        type="button"
                        key={name}
                        onClick={() => select(name)}
                        aria-label={name}
                        title={name}
                        aria-current={active === name ? "page" : undefined}
                        className={`project-nav-link ${active === name ? "active" : ""}`}
                      >
                        <Icon size={19} strokeWidth={1.65} />
                        <span>{name}</span>
                      </button>
                    ))}
                </div>
              </section>
            ))}
          </div>
          <button
            className="project-sidebar-logout"
            title={"Sign out"}
            aria-label={"Sign out"}
            onClick={onSignOut}
          >
            <LogOut size={20} />
            <span>{"Sign out"}</span>
          </button>
        </aside>
        <main ref={main} className="project-main">
          <header className="project-topbar">
            <button
              className="project-icon-button"
              aria-label="Toggle navigation"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="project-search-wrap">
              <label className="project-nav-search">
                <Search size={18} />
                <input
                  aria-label="Search workspace"
                  placeholder="Search your workspace"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setSearch("");
                    if (event.key === "Enter" && matches[0]) select(matches[0].name);
                  }}
                />
              </label>
              {search && (
                <div className="project-search-results">
                  {matches.map(({ name, icon: Icon }) => (
                    <button key={name} onClick={() => select(name)}>
                      <Icon size={16} />
                      {name}
                    </button>
                  ))}
                  {!matches.length && <p>No matching sections</p>}
                </div>
              )}
            </div>
            <div className="project-top-actions">
              <button
                className="project-icon-button"
                title="Refresh records"
                aria-label="Refresh records"
                onClick={onRefresh}
              >
                <RefreshCw size={18} />
              </button>
              <button
                className="project-icon-button"
                aria-label="Open notifications"
                onClick={() => select("Notifications")}
              >
                <Bell size={19} />
                {notificationCount > 0 && (
                  <span className="project-notification-count" aria-hidden="true">
                    {notificationCount > 99 ? "99+" : notificationCount}
                  </span>
                )}
              </button>
              <button
                className="project-icon-button"
                aria-label="Open calendar"
                onClick={() => select("Calendar")}
              >
                <CalendarDays size={19} />
              </button>
              <div className="project-account" ref={account}>
                <button
                  className="project-account-button"
                  onClick={() => setAccountOpen((value) => !value)}
                  aria-expanded={accountOpen}
                  aria-label="Account menu"
                >
                  <span className="project-account-avatar">
                    {managerName
                      .split(" ")
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                  <span className="project-account-name">{managerName}</span>
                  <ChevronDown size={15} />
                </button>
                {accountOpen && (
                  <div className="project-account-menu">
                    <b>{company}</b>
                    {canViewManagerSection(accessRole, "Settings") && (
                      <button
                        onClick={() => {
                          select("Settings");
                          setAccountOpen(false);
                        }}
                      >
                        Company settings
                      </button>
                    )}
                    <button onClick={onSignOut}>{"Sign out"}</button>
                  </div>
                )}
              </div>
            </div>
          </header>
          <div className="project-company-line">
            <span>{company}</span>
            <span>Workspace / {active}</span>
          </div>
          <div className={`project-content-layout ${insights ? "has-insights" : ""}`}>
            <div className="project-content-primary">
              {active !== "Tasks" && (
                <div className="project-page-head">
                  <h1>{active}</h1>
                  <p>
                    {active === "Overview" || active === "Views"
                      ? "Here’s what’s happening with your team today."
                      : active === "Map"
                        ? "Current work locations during active shifts."
                        : active === "Employees"
                          ? "Find people by department and work role."
                          : active === "Project management"
                            ? "Job briefs, progress and assigned teams."
                            : active === "Settings"
                              ? "Workplace settings and attendance rules."
                              : `Your ${active.toLowerCase()}, all in one place.`}
                  </p>
                </div>
              )}
              <div className="project-main-content">{children}</div>
            </div>
            {insights && (
              <aside className="project-insights" aria-label="Team insights">
                {insights}
              </aside>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
