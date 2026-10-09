import { createFileRoute } from "@tanstack/react-router";
import { EmployeeShell, DemoBanner } from "@/components/app/EmployeeShell";

export const Route = createFileRoute("/jobs")({
  head: () => ({ meta: [
    { title: "Jobs — Shiftline" },
    { name: "description", content: "Jobs in Shiftline (demo)." },
    { property: "og:title", content: "Jobs — Shiftline" },
    { property: "og:description", content: "Jobs in Shiftline (demo)." },
  ] }),
  component: () => (
    <EmployeeShell title="Jobs">
      <DemoBanner />
      <p className="card-surface p-5 text-sm text-muted-foreground">This screen isn't built yet.</p>
    </EmployeeShell>
  ),
});
