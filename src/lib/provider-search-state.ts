import type { NearbySearchCriteria } from "./nearby-search";
import type { Provider, SearchOrigin } from "../types/provider";

export const MISSING_STARTING_LOCATION_MESSAGE =
  "Choose your location, select a starting point, or click the map.";

export type LocationSelectionSource =
  | "none"
  | "current"
  | "map"
  | "provider"
  | "manual";

export type SearchDraft = {
  latitude: string;
  longitude: string;
  locationSource: LocationSelectionSource;
  locationLabel: string | null;
  startingPointId: string;
  radiusKm: string;
  serviceId: string;
  category: string;
};

export function createDefaultSearchDraft(): SearchDraft {
  return {
    latitude: "",
    longitude: "",
    locationSource: "none",
    locationLabel: null,
    startingPointId: "",
    radiusKm: "5",
    serviceId: "",
    category: "",
  };
}

function numbersOrTextMatch(first: string, second: string) {
  const firstValue = first.trim();
  const secondValue = second.trim();

  if (firstValue === "" || secondValue === "") {
    return firstValue === secondValue;
  }

  const firstNumber = Number(firstValue);
  const secondNumber = Number(secondValue);

  if (Number.isFinite(firstNumber) && Number.isFinite(secondNumber)) {
    return firstNumber === secondNumber;
  }

  return firstValue === secondValue;
}

export function locationDraftsMatch(
  first: SearchDraft,
  second: SearchDraft
) {
  return (
    numbersOrTextMatch(first.latitude, second.latitude) &&
    numbersOrTextMatch(first.longitude, second.longitude) &&
    first.locationSource === second.locationSource &&
    first.locationLabel === second.locationLabel &&
    first.startingPointId === second.startingPointId
  );
}

export function searchDraftsMatch(
  first: SearchDraft,
  second: SearchDraft
) {
  return (
    locationDraftsMatch(first, second) &&
    numbersOrTextMatch(first.radiusKm, second.radiusKm) &&
    first.serviceId.trim() === second.serviceId.trim() &&
    first.category.trim() === second.category.trim()
  );
}

function selectLocation(
  draft: SearchDraft,
  origin: SearchOrigin,
  source: Exclude<LocationSelectionSource, "none" | "manual">,
  label: string,
  startingPointId = ""
): SearchDraft {
  return {
    ...draft,
    latitude: String(origin.latitude),
    longitude: String(origin.longitude),
    locationSource: source,
    locationLabel: label,
    startingPointId,
  };
}

export function selectCurrentLocation(
  draft: SearchDraft,
  origin: SearchOrigin
) {
  return selectLocation(
    draft,
    origin,
    "current",
    "Your current location"
  );
}

export function selectMapLocation(
  draft: SearchDraft,
  origin: SearchOrigin
) {
  return selectLocation(
    draft,
    origin,
    "map",
    "Selected point on map"
  );
}

export function selectProviderLocation(
  draft: SearchDraft,
  provider: Provider
) {
  return selectLocation(
    draft,
    {
      latitude: provider.latitude,
      longitude: provider.longitude,
    },
    "provider",
    provider.name,
    provider.id
  );
}

export function clearSelectedLocation(draft: SearchDraft): SearchDraft {
  return {
    ...draft,
    latitude: "",
    longitude: "",
    locationSource: "none",
    locationLabel: null,
    startingPointId: "",
  };
}

export function updateManualCoordinate(
  draft: SearchDraft,
  field: "latitude" | "longitude",
  value: string
): SearchDraft {
  return {
    ...draft,
    [field]: value,
    locationSource: "manual",
    locationLabel: "Manually entered location",
    startingPointId: "",
  };
}

export function isStartingLocationBlank(draft: SearchDraft) {
  return draft.latitude.trim() === "" && draft.longitude.trim() === "";
}

export function getValidDraftOrigin(
  draft: SearchDraft
): SearchOrigin | null {
  const latitudeText = draft.latitude.trim();
  const longitudeText = draft.longitude.trim();

  if (latitudeText === "" || longitudeText === "") {
    return null;
  }

  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);

  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

export function canonicalizeAppliedDraft(
  criteria: NearbySearchCriteria,
  submittedDraft: SearchDraft
): SearchDraft {
  return {
    ...submittedDraft,
    latitude: String(criteria.latitude),
    longitude: String(criteria.longitude),
    radiusKm: String(criteria.radiusKm),
    serviceId: criteria.serviceId ?? "",
    category: criteria.category ?? "",
  };
}

export function geolocationFailureMessage(code: number) {
  if (code === 1) {
    return "Location permission was denied. Choose on map or select a starting point instead.";
  }

  if (code === 2) {
    return "Your location is currently unavailable. Choose on map or select a starting point instead.";
  }

  return "Getting your location timed out. Try again, choose on map, or select a starting point.";
}
