import {
  House,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Clock3,
  FileBarChart2,
  FileText,
  LayoutGrid,
  MapPinned,
  Megaphone,
  MessageSquare,
  NotebookPen,
  Search,
  ShieldCheck,
  Users,
  CheckSquare,
  Monitor,
  Bell,
} from "lucide-react";

export const managerGroups = [
  {
    label: "WORKSPACE",
    items: [
      { name: "Overview", icon: House },
      { name: "Tasks", icon: ClipboardList },
      { name: "Calendar", icon: CalendarDays },
      { name: "Notes", icon: NotebookPen },
      { name: "Reports", icon: FileBarChart2 },
      { name: "Views", icon: LayoutGrid },
    ],
  },
  {
    label: "PROJECTS",
    items: [
      { name: "Project management", icon: BriefcaseBusiness },
      { name: "Attendance", icon: Clock3 },
      { name: "Map", icon: MapPinned },
      { name: "Messages", icon: MessageSquare },
    ],
  },
  {
    label: "MANAGE",
    items: [
      { name: "Team", icon: Users },
      { name: "Requests", icon: CheckSquare },
      { name: "Announcements", icon: Megaphone },
      { name: "Notifications", icon: Bell },
      { name: "Corrections", icon: FileText },
      { name: "Employees", icon: Users },
      { name: "Employee Access", icon: Monitor },
    ],
  },
] as const;
export type ManagerSection = (typeof managerGroups)[number]["items"][number]["name"] | "Settings";
