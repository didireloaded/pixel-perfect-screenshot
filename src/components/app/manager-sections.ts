import {
  House,
  BriefcaseBusiness,
  LayoutGrid,
  CalendarDays,
  ClipboardList,
  Clock3,
  FileBarChart2,
  FileText,
  MapPinned,
  Megaphone,
  MessageSquare,
  NotebookPen,
  ShieldCheck,
  Users,
  UserCheck,
  CheckSquare,
  Monitor,
  Bell,
} from "lucide-react";

export const managerGroups = [
  {
    label: "OPERATIONS",
    items: [
      { name: "Overview", icon: House },
      { name: "Attendance", icon: Clock3 },
      { name: "Tasks", icon: ClipboardList },
      { name: "Calendar", icon: CalendarDays },
      { name: "Project management", icon: BriefcaseBusiness },
      { name: "Views", icon: LayoutGrid },
      { name: "Map", icon: MapPinned },
    ],
  },
  {
    label: "PEOPLE & ACCESS",
    items: [
      { name: "Employees", icon: Users },
      { name: "Team", icon: UserCheck },
      { name: "Requests", icon: CheckSquare },
      { name: "Employee Access", icon: Monitor },
      { name: "Messages", icon: MessageSquare },
    ],
  },
  {
    label: "COMPLIANCE & RECORDS",
    items: [
      { name: "Reports", icon: FileBarChart2 },
      { name: "Workplace reports", icon: ShieldCheck },
      { name: "Corrections", icon: FileText },
      { name: "Announcements", icon: Megaphone },
      { name: "Notes", icon: NotebookPen },
      { name: "Notifications", icon: Bell },
    ],
  },
] as const;

export type ManagerSection =
  | (typeof managerGroups)[number]["items"][number]["name"]
  | "Settings"
  | "Project management"
  | "Views";
