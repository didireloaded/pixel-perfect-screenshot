import { createFileRoute } from "@tanstack/react-router";
import { EmployeeShell, DemoBanner } from "@/components/app/EmployeeShell";

export const Route = createFileRoute("/requests")({
  head: () => ({ meta: [
    { title: "Requests — Shiftline" },
    { name: "description", content: "Requests in Shiftline (demo)." },
    { property: "og:title", content: "Requests — Shiftline" },
    { property: "og:description", content: "Requests in Shiftline (demo)." },
  ] }),
  component: () => (
    <EmployeeShell title="Requests">
      <DemoBanner />
      <p className="card-surface p-5 text-sm text-muted-foreground">This screen isn't built yet.</p>
    </EmployeeShell>
  ),
});
