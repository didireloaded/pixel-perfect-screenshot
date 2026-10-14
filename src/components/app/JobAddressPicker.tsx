import { useEffect, useRef, useState } from "react";
import type { Map, Marker } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

export interface JobAddress {
  address: string;
  latitude: number | null;
  longitude: number | null;
}
const validPoint = (value: JobAddress) =>
  value.latitude != null &&
  value.longitude != null &&
  Number.isFinite(value.latitude) &&
  Number.isFinite(value.longitude) &&
  Math.abs(value.latitude) <= 90 &&
  Math.abs(value.longitude) <= 180;
interface AddressFeature {
  id?: string;
  geometry: { coordinates: number[] };
  properties: { full_address?: string; name?: string; place_formatted?: string };
}
export function JobAddressPicker({
  value,
  onChange,
  proximity,
}: {
  value: JobAddress;
  onChange: (value: JobAddress) => void;
  proximity?: [number, number] | undefined;
}) {
  const token = import.meta.env["VITE_MAPBOX_ACCESS_TOKEN"] as string | undefined;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const marker = useRef<Marker | null>(null);
  const latest = useRef({ value, onChange });
  const [suggestions, setSuggestions] = useState<AddressFeature[]>([]);
  const [message, setMessage] = useState("");
  const [searching, setSearching] = useState(false);
  const centerLng = proximity?.[0] ?? 17.08,
    centerLat = proximity?.[1] ?? -22.57;
  useEffect(() => {
    latest.current = { value, onChange };
  }, [value, onChange]);
  useEffect(() => {
    if (!token || value.address.trim().length < 3 || value.latitude != null) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      setMessage("");
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
        url.search = new URLSearchParams({
          q: value.address,
          access_token: token,
          permanent: "true",
          autocomplete: "true",
          country: "na",
          types: "address,street,place,locality,neighborhood",
          limit: "5",
          proximity: `${centerLng},${centerLat}`,
        }).toString();
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok)
          throw new Error(
            response.status === 401 || response.status === 403
              ? "Mapbox search or permanent-storage access is not enabled for this token."
              : "Address search is unavailable. You can confirm the location on the map.",
          );
        const result = (await response.json()) as { features?: AddressFeature[] };
        const features = (result.features ?? []).filter(
          (feature) =>
            feature.geometry?.coordinates?.length === 2 &&
            feature.geometry.coordinates.every(Number.isFinite) &&
            Math.abs(feature.geometry.coordinates[0]!) <= 180 &&
            Math.abs(feature.geometry.coordinates[1]!) <= 90,
        );
        if (active) {
          setSuggestions(features);
          setMessage(
            features.length
              ? ""
              : "No address suggestions in Namibia. Search the venue’s street, suburb or town, or enter its name and confirm its exact pin on the map.",
          );
        }
      } catch (cause) {
        if (active) {
          setSuggestions([]);
          setMessage(
            cause instanceof Error && cause.name !== "AbortError"
              ? cause.message
              : "Address search timed out. Confirm the pin on the map.",
          );
        }
      } finally {
        clearTimeout(timeout);
        if (active) setSearching(false);
      }
    }, 500);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [token, value.address, value.latitude, centerLng, centerLat]);
  useEffect(() => {
    if (!token || !container.current) return;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    void import("mapbox-gl")
      .then(({ default: mapbox }) => {
        if (disposed || !container.current) return;
        const initial = latest.current.value;
        const instance = new mapbox.Map({
          container: container.current,
          accessToken: token,
          style: "mapbox://styles/mapbox/streets-v12",
          center: validPoint(initial)
            ? [initial.longitude!, initial.latitude!]
            : [centerLng, centerLat],
          zoom: validPoint(initial) ? 15 : 11,
        });
        map.current = instance;
        instance.addControl(new mapbox.NavigationControl());
        const pin = new mapbox.Marker({ color: "#7c3aed", draggable: true });
        marker.current = pin;
        if (validPoint(initial))
          pin.setLngLat([initial.longitude!, initial.latitude!]).addTo(instance);
        const pick = (longitude: number, latitude: number) =>
          latest.current.onChange({ ...latest.current.value, longitude, latitude });
        instance.on("click", (event) => pick(event.lngLat.lng, event.lngLat.lat));
        pin.on("dragend", () => {
          const point = pin.getLngLat();
          pick(point.lng, point.lat);
        });
        instance.on("error", () =>
          setMessage("The map is unavailable. Enter the confirmed coordinates below."),
        );
        observer = new ResizeObserver(() => instance.resize());
        observer.observe(container.current);
      })
      .catch(() => {
        if (!disposed) setMessage("The map is unavailable. Enter the confirmed coordinates below.");
      });
    return () => {
      disposed = true;
      observer?.disconnect();
      marker.current?.remove();
      marker.current = null;
      map.current?.remove();
      map.current = null;
    };
  }, [token, centerLng, centerLat]);
  useEffect(() => {
    if (!map.current || !marker.current) return;
    if (!validPoint(value)) {
      marker.current.remove();
      return;
    }
    marker.current.setLngLat([value.longitude!, value.latitude!]).addTo(map.current);
    map.current.flyTo({ center: [value.longitude!, value.latitude!], zoom: 15 });
  }, [value]);
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        Job address or destination
        <input
          required
          maxLength={200}
          className="mt-2 w-full rounded-xl border border-border bg-muted p-3"
          value={value.address}
          onChange={(event) => {
            setMessage("");
            onChange({ address: event.target.value, latitude: null, longitude: null });
          }}
          autoComplete="off"
          placeholder="Search an address, suburb or town in Namibia"
        />
      </label>
      {searching && (
        <p role="status" className="text-xs">
          Searching Namibia…
        </p>
      )}
      {suggestions.length > 0 && (
        <div
          role="group"
          aria-label="Address suggestions"
          className="rounded-xl border overflow-hidden"
        >
          {suggestions.map((feature, index) => {
            const label =
              feature.properties.full_address ??
              [feature.properties.name, feature.properties.place_formatted]
                .filter(Boolean)
                .join(", ");
            return (
              <button
                key={feature.id ?? index}
                type="button"
                className="block w-full text-left p-3 hover:bg-muted border-b last:border-0"
                onClick={() => {
                  onChange({
                    address: label.slice(0, 200),
                    longitude: feature.geometry.coordinates[0]!,
                    latitude: feature.geometry.coordinates[1]!,
                  });
                  setSuggestions([]);
                  setMessage("");
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Suggestions are limited to Namibia. Search the physical venue’s address, suburb or town;
        event names may not be listed. Check the pin before saving, or enter the venue name and
        click its exact position on the map.
      </p>
      {token ? (
        <div
          ref={container}
          aria-label="Choose job location on map"
          style={{ height: 240 }}
          className="rounded-xl overflow-hidden"
        />
      ) : (
        <p role="status" className="text-xs">
          Mapbox is not configured. Enter the confirmed coordinates.
        </p>
      )}
      {message && (
        <p role="status" className="text-xs">
          {message}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {(["latitude", "longitude"] as const).map((field) => (
          <label className="text-sm capitalize" key={field}>
            {field}
            <input
              className="mt-1 w-full rounded-xl border bg-muted p-2"
              type="number"
              step="any"
              min={field === "latitude" ? -90 : -180}
              max={field === "latitude" ? 90 : 180}
              required
              value={value[field] ?? ""}
              onChange={(event) =>
                onChange({
                  ...value,
                  [field]: event.target.value === "" ? null : Number(event.target.value),
                })
              }
            />
          </label>
        ))}
      </div>
    </div>
  );
}
