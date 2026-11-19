import type { SearchDraft } from "./provider-search-state";

export function buildProviderSearchRequest(draft: SearchDraft) {
  const searchParams = new URLSearchParams();
  searchParams.set("latitude", draft.latitude);
  searchParams.set("longitude", draft.longitude);

  if (draft.mode === "straight-line") {
    searchParams.set("radius_km", draft.radiusKm);
  } else if (draft.maxRoadDistanceKm.trim() !== "") {
    searchParams.set(
      "max_road_distance_km",
      draft.maxRoadDistanceKm
    );
  }

  if (draft.serviceId.trim() !== "") {
    searchParams.set("service_id", draft.serviceId);
  }

  if (draft.category.trim() !== "") {
    searchParams.set("category", draft.category);
  }

  return {
    endpoint:
      draft.mode === "straight-line"
        ? "/api/providers/nearby"
        : "/api/providers/road",
    searchParams,
  } as const;
}
