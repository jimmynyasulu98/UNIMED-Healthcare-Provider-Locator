import type { SearchOrigin } from "../types/provider";

const GOOGLE_MAPS_DIRECTIONS_URL =
  "https://www.google.com/maps/dir/";

export function buildGoogleMapsDirectionsUrl(
  destination: SearchOrigin
) {
  const url = new URL(GOOGLE_MAPS_DIRECTIONS_URL);

  url.searchParams.set("api", "1");
  url.searchParams.set(
    "destination",
    `${destination.latitude},${destination.longitude}`
  );
  url.searchParams.set("dir_action", "navigate");

  return url.toString();
}
