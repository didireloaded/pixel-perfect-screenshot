import { useState, type FormEvent } from "react";
import type { CalendarJob } from "../../../shared/attendance";
import { useAttendance } from "@/lib/app-store";
import { JobAddressPicker, type JobAddress } from "./JobAddressPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function JobPlanLocationForm({ plan, onSaved }: { plan: CalendarJob; onSaved: () => void }) {
  const d = useAttendance();
  const [location, setLocation] = useState<JobAddress>({
    address: plan.address ?? "",
    latitude: plan.latitude ?? null,
    longitude: plan.longitude ?? null,
  });
  const site = d.sites.find((item) => item.latitude != null && item.longitude != null);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await d.command("update_job_plan_location", {
      id: plan.id,
      ...location,
      radiusM: Number(new FormData(event.currentTarget).get("radiusM")),
      expected: {
        address: plan.address ?? "",
        latitude: plan.latitude ?? null,
        longitude: plan.longitude ?? null,
        radiusM: plan.radiusM ?? 150,
      },
    });
    if (result) onSaved();
  };
  return (
    <form onSubmit={save} className="space-y-4">
      <p>
        {plan.title} · {plan.date}
      </p>
      <JobAddressPicker
        value={location}
        onChange={setLocation}
        proximity={
          site?.longitude != null && site.latitude != null
            ? [site.longitude, site.latitude]
            : undefined
        }
      />
      <label className="block text-sm">
        Job boundary (metres)
        <Input
          name="radiusM"
          type="number"
          min={100}
          max={5000}
          required
          defaultValue={plan.radiusM ?? 150}
        />
      </label>
      <Button disabled={d.busy || !d.online}>Save job location</Button>
    </form>
  );
}
