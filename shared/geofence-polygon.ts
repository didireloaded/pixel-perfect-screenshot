// Spherical destination points use the same Earth radius as the server distance check.
export function geofencePolygon(latitude: number, longitude: number, radiusM: number): number[][] {
  const lat = (latitude * Math.PI) / 180,
    lng = (longitude * Math.PI) / 180,
    distance = radiusM / 6371000;
  const ring = Array.from({ length: 64 }, (_, i) => {
    const bearing = (i * 2 * Math.PI) / 64;
    const targetLat = Math.asin(
      Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(bearing),
    );
    const targetLng =
      lng +
      Math.atan2(
        Math.sin(bearing) * Math.sin(distance) * Math.cos(lat),
        Math.cos(distance) - Math.sin(lat) * Math.sin(targetLat),
      );
    return [(((targetLng * 180) / Math.PI + 540) % 360) - 180, (targetLat * 180) / Math.PI];
  });
  return [...ring, ring[0]!];
}
