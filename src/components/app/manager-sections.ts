import {
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
  Settings2,
  ShieldCheck,
  Users,
  CheckSquare,
  ScrollText,
  Monitor,
} from "lucide-react";

export const managerGroups = [
  {
    label: "WORKSPACE",
    items: [
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
      { name: "Corrections", icon: FileText },
      { name: "Policies", icon: Settings2 },
      { name: "Audit", icon: ScrollText },
      { name: "Kiosk", icon: Monitor },
    ],
  },
] as const;
export type ManagerSection = (typeof managerGroups)[number]["items"][number]["name"];
