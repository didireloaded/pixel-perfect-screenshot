import { useState } from "react";
import type { Site } from "../../../shared/attendance";
import { JobAddressPicker } from "./JobAddressPicker";
import { useAttendance } from "@/lib/app-store";
import { Button } from "@/components/ui/button";

export function WorkplacePin({ site }: { site: Site }) {
  const d = useAttendance();
  const [position, setPosition] = useState({ address: site.address, latitude: site.latitude, longitude: site.longitude });
  return (
    <section className="card-surface space-y-4 p-5">
      <h2 className="text-lg font-bold">Confirm workplace pin · {site.name}</h2>
      <p className="text-sm text-muted-foreground">
        Search the office address, then tap the map or drag the pin to its exact entrance. Saving
        confirms the workplace coordinates used for tracking and its existing geofence settings.
      </p>
      <JobAddressPicker value={position} onChange={setPosition} label="Workplace address search" />
      <Button disabled={d.busy || !d.online || position.latitude == null || position.longitude == null}
        onClick={() => void d.command("set_geofence", {
          siteId: site.id, latitude: position.latitude, longitude: position.longitude,
          mode: site.geofenceMode, radiusM: site.radiusM, maxAccuracyM: site.maxAccuracyM,
        })}>
        Save confirmed workplace pin
      </Button>
    </section>
  );
}
