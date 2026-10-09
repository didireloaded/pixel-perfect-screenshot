import { createFileRoute } from "@tanstack/react-router";
import { EmployeeShell, DemoBanner } from "@/components/app/EmployeeShell";

export const Route = createFileRoute("/hours")({
  head: () => ({ meta: [
    { title: "My hours — Shiftline" },
    { name: "description", content: "My hours in Shiftline (demo)." },
    { property: "og:title", content: "My hours — Shiftline" },
    { property: "og:description", content: "My hours in Shiftline (demo)." },
  ] }),
  component: () => (
    <EmployeeShell title="My hours">
      <DemoBanner />
      <p className="card-surface p-5 text-sm text-muted-foreground">This screen isn't built yet.</p>
    </EmployeeShell>
  ),
});
