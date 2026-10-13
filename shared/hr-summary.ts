import type { AttendanceSnapshot } from "./attendance";
export function hrSummary(
  data: Pick<AttendanceSnapshot, "employees" | "events" | "shifts" | "today" | "requests">,
) {
  const employees = data.employees.filter(
    (employee) =>
      employee.role === "employee" &&
      (!employee.accessStatus || employee.accessStatus === "active"),
  );
  const ids = new Set(employees.map((employee) => employee.id));
  const todayShifts = new Set(
    data.shifts.filter((shift) => shift.date === data.today).map((shift) => shift.id),
  );
  const present = new Set(
    data.events
      .filter(
        (event) =>
          event.type === "clock_in" &&
          event.shiftId &&
          todayShifts.has(event.shiftId) &&
          ids.has(event.employeeId),
      )
      .map((event) => event.employeeId),
  );
  const onLeave = new Set(
    data.requests
      .filter(
        (request) =>
          request.kind === "leave" &&
          request.status === "approved" &&
          request.leaveStart &&
          request.leaveEnd &&
          request.leaveStart <= data.today &&
          request.leaveEnd >= data.today &&
          !request.leaveStartTime &&
          ids.has(request.employeeId),
      )
      .map((request) => request.employeeId),
  );
  const noCheckIn = employees.filter(
    (employee) => !present.has(employee.id) && !onLeave.has(employee.id),
  );
  return {
    employees,
    present,
    onLeave,
    noCheckIn,
    pendingLeave: data.requests.filter(
      (request) => request.kind === "leave" && request.status === "pending",
    ),
  };
}
