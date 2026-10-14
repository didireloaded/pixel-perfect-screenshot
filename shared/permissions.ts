import type { AccessRole } from "./attendance";
export const accessRoleLabels: Record<AccessRole, string> = {
  owner: "Owner",
  hr: "HR manager",
  operations: "Operations manager",
  worker: "Worker",
};
export function canViewManagerSection(role: AccessRole | undefined, section: string) {
  if (!role || role === "owner") return true; // Compatibility with pre-upgrade snapshots.
  if (role === "worker") return false;
  if (
    [
      "Overview",
      "Employees",
      "Requests",
      "Messages",
      "Announcements",
      "Notes",
      "Notifications",
    ].includes(section)
  )
    return true;
  return role === "hr"
    ? ["Team", "Employee Access", "Attendance", "Reports"].includes(section)
    : [
        "Attendance",
        "Tasks",
        "Calendar",
        "Project management",
        "Views",
        "Map",
        "Reports",
        "Workplace reports",
        "Corrections",
      ].includes(section);
}
