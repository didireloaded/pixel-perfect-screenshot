import { PAYROLL_COLUMNS, type GrossRow } from "../../shared/attendance";
// Seconds remain integers. Escape both CSV syntax and spreadsheet formula prefixes.
export function payrollCsv(rows: Record<string, string | number>[]) {
  const legacyColumns = [
    "employeeNo",
    "name",
    "date",
    "regularMinutes",
    "overtimeMinutes",
    "lunchMinutes",
    "personalMinutes",
    "status",
  ];
  const columns = rows[0] && "employee_number" in rows[0] ? PAYROLL_COLUMNS : legacyColumns;
  const escape = (value: string | number | undefined) => {
    let text = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((c) => escape(row[c])).join(",")),
  ].join("\r\n");
}
export function downloadPayroll(rows: Record<string, string | number>[], filename: string) {
  const url = URL.createObjectURL(new Blob([payrollCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const GROSS_COLUMNS = [
  "employee_number",
  "shift_date",
  "regular_seconds",
  "overtime_seconds_approved",
  "hourly_rate_minor",
  "overtime_multiplier_bp",
  "currency",
  "gross_minor",
] as const;
export function grossCsv(rows: GrossRow[]) {
  const escape = (value: string | number) => {
    let text = String(value);
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return [
    GROSS_COLUMNS.join(","),
    ...rows.map((row) => GROSS_COLUMNS.map((column) => escape(row[column])).join(",")),
  ].join("\r\n");
}
export function downloadGrossRun(rows: GrossRow[], filename: string) {
  const url = URL.createObjectURL(new Blob([grossCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
