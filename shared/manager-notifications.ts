import type { AttendanceSnapshot } from "./attendance";
export type ManagerNotification = {
  id: string;
  title: string;
  detail: string;
  at?: number | undefined;
  section: "Requests" | "Messages" | "Team" | "Map";
  read: boolean;
};
export function managerNotifications(data: AttendanceSnapshot): ManagerNotification[] {
  const read = new Set(data.readNotificationIds ?? []);
  const name = (id: string) =>
    data.employees.find((employee) => employee.id === id)?.name ?? "Employee";
  return [
    ...data.requests.map((request) => ({
      id: `request:${request.id}`,
      title: `${name(request.employeeId)} requested ${request.kind === "leave" ? "time off" : request.kind.replaceAll("_", " ")}`,
      detail: request.summary,
      at: request.submittedAt,
      section: "Requests" as const,
    })),
    ...data.messages
      .filter((message) => message.recipientId === data.me)
      .map((message) => ({
        id: `message:${message.id}`,
        title: `Message from ${name(message.senderId)}`,
        detail: message.body,
        at: Date.parse(message.sentAt),
        section: "Messages" as const,
      })),
    ...data.employees
      .filter((employee) => employee.role === "employee" && employee.accessStatus === "pending")
      .map((employee) => ({
        id: `employee:${employee.id}`,
        title: `${employee.name} is awaiting approval`,
        detail: `Employee ${employee.no}`,
        at: undefined,
        section: "Team" as const,
      })),
    ...data.siteAlerts.map((alert) => ({
      id: `alert:${alert.id}`,
      title: `${name(alert.employeeId)} ${alert.kind === "exit" ? "left the work boundary" : "returned to the work boundary"}`,
      detail: `Location accuracy ±${Math.round(alert.accuracyM)}m. Review before taking attendance action.`,
      at: Date.parse(alert.observedAt),
      section: "Map" as const,
    })),
  ]
    .map((item) => ({ ...item, read: read.has(item.id) }))
    .sort(
      (a, b) =>
        Number(a.read) - Number(b.read) ||
        (b.at ?? Number.MAX_SAFE_INTEGER) - (a.at ?? Number.MAX_SAFE_INTEGER),
    );
}
