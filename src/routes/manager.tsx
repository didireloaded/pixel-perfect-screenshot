import { createFileRoute } from "@tanstack/react-router";
import { EmployeeShell, DemoBanner } from "@/components/app/EmployeeShell";

export const Route = createFileRoute("/manager")({
  head: () => ({ meta: [
    { title: "Manager — Shiftline" },
    { name: "description", content: "Manager in Shiftline (demo)." },
    { property: "og:title", content: "Manager — Shiftline" },
    { property: "og:description", content: "Manager in Shiftline (demo)." },
  ] }),
  component: () => (
    <EmployeeShell title="Manager">
      <DemoBanner />
      <p className="card-surface p-5 text-sm text-muted-foreground">This screen isn't built yet.</p>
    </EmployeeShell>
  ),
});
