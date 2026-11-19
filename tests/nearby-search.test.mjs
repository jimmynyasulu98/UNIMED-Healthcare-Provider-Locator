import assert from "node:assert/strict";
import test from "node:test";

import { LatestRequestCoordinator } from "../src/lib/latest-request.ts";
import { validateNearbySearchParams } from "../src/lib/nearby-search.ts";
import { buildProviderSearchRequest } from "../src/lib/provider-search-request.ts";
import { buildGoogleMapsDirectionsUrl } from "../src/lib/provider-directions.ts";
import {
  validateRoadRouteParams,
  validateRoadSearchParams,
} from "../src/lib/road-search.ts";
import {
  MISSING_STARTING_LOCATION_MESSAGE,
  canonicalizeAppliedDraft,
  canonicalizeRoadAppliedDraft,
  clearSelectedLocation,
  createDefaultSearchDraft,
  geolocationFailureMessage,
  getValidDraftOrigin,
  isStartingLocationBlank,
  locationDraftsMatch,
  searchDraftsMatch,
  selectCurrentLocation,
  selectMapLocation,
  selectProviderLocation,
  updateManualCoordinate,
} from "../src/lib/provider-search-state.ts";

const unimaClinic = {
  id: "10",
  name: "UNIMA Clinic",
  category: "University",
  district: "Zomba",
  address: null,
  phone: null,
  latitude: -15.385343687941972,
  longitude: 35.332129450877574,
  services: ["General OPD"],
};

test("builds a destination-only Google Maps directions link", () => {
  const directionsUrl = new URL(
    buildGoogleMapsDirectionsUrl({
      latitude: unimaClinic.latitude,
      longitude: unimaClinic.longitude,
    })
  );

  assert.equal(directionsUrl.origin, "https://www.google.com");
  assert.equal(directionsUrl.pathname, "/maps/dir/");
  assert.equal(directionsUrl.searchParams.get("api"), "1");
  assert.equal(
    directionsUrl.searchParams.get("destination"),
    "-15.385343687941972,35.332129450877574"
  );
  assert.equal(directionsUrl.searchParams.get("origin"), null);
  assert.equal(
    directionsUrl.searchParams.get("dir_action"),
    "navigate"
  );
});

function validate(query) {
  return validateNearbySearchParams(new URLSearchParams(query));
}

test("accepts the documented UNIMA Clinic search origin", () => {
  const result = validate({
    latitude: "-15.385343687941972",
    longitude: "35.332129450877574",
    radius_km: "5",
    service_id: "1",
    category: "University",
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.deepEqual(result.value, {
      latitude: -15.385343687941972,
      longitude: 35.332129450877574,
      radiusKm: 5,
      serviceId: "1",
      category: "University",
    });
  }
});

test("straight-line radius remains the default search mode", () => {
  const draft = createDefaultSearchDraft();
  const request = buildProviderSearchRequest(draft);

  assert.equal(draft.mode, "straight-line");
  assert.equal(draft.maxRoadDistanceKm, "");
  assert.equal(request.endpoint, "/api/providers/nearby");
  assert.equal(request.searchParams.get("radius_km"), "5");
  assert.equal(
    request.searchParams.has("max_road_distance_km"),
    false
  );
});

test("road mode uses its own optional distance parameter and endpoint", () => {
  const noMaximum = {
    ...createDefaultSearchDraft(),
    mode: "road",
    latitude: "-15.3853",
    longitude: "35.3321",
    serviceId: "1",
    category: "University",
  };
  const limited = { ...noMaximum, maxRoadDistanceKm: "12.5" };
  const noMaximumRequest = buildProviderSearchRequest(noMaximum);
  const limitedRequest = buildProviderSearchRequest(limited);

  assert.equal(noMaximumRequest.endpoint, "/api/providers/road");
  assert.equal(noMaximumRequest.searchParams.has("radius_km"), false);
  assert.equal(
    noMaximumRequest.searchParams.has("max_road_distance_km"),
    false
  );
  assert.equal(
    limitedRequest.searchParams.get("max_road_distance_km"),
    "12.5"
  );
  assert.equal(limitedRequest.searchParams.get("service_id"), "1");
  assert.equal(
    limitedRequest.searchParams.get("category"),
    "University"
  );
});

test("validates optional maximum road distance independently of radius", () => {
  const validUnlimited = validateRoadSearchParams(
    new URLSearchParams("latitude=-15&longitude=35")
  );
  const validLimited = validateRoadSearchParams(
    new URLSearchParams(
      "latitude=-15&longitude=35&max_road_distance_km=12.5"
    )
  );

  assert.equal(validUnlimited.ok, true);
  assert.equal(validLimited.ok, true);

  if (validUnlimited.ok && validLimited.ok) {
    assert.equal(validUnlimited.value.maxRoadDistanceKm, null);
    assert.equal(validLimited.value.maxRoadDistanceKm, 12.5);
  }

  for (const query of [
    "latitude=-15&longitude=35&max_road_distance_km=0",
    "latitude=-15&longitude=35&max_road_distance_km=Infinity",
    "latitude=-15&longitude=35&max_road_distance_km=501",
    "latitude=-15&longitude=35&max_road_distance_km=5&max_road_distance_km=10",
  ]) {
    assert.equal(
      validateRoadSearchParams(new URLSearchParams(query)).ok,
      false
    );
  }
});

test("validates a selected-provider route request", () => {
  const valid = validateRoadRouteParams(
    new URLSearchParams(
      "latitude=-15.3853&longitude=35.3321&provider_id=10"
    )
  );
  const invalid = validateRoadRouteParams(
    new URLSearchParams(
      "latitude=-15.3853&longitude=35.3321&provider_id=10%20OR%201%3D1"
    )
  );

  assert.equal(valid.ok, true);
  assert.equal(invalid.ok, false);
});

test("rejects missing and blank required values", () => {
  const missing = validate({ longitude: "35", radius_km: "5" });
  const blank = validate({
    latitude: "   ",
    longitude: "35",
    radius_km: "5",
  });

  assert.equal(missing.ok, false);
  assert.equal(blank.ok, false);

  if (!missing.ok && !blank.ok) {
    assert.equal(missing.errors[0].field, "latitude");
    assert.equal(blank.errors[0].field, "latitude");
  }
});

test("rejects non-finite, trailing-text, and duplicate values", () => {
  const nonFinite = validate({
    latitude: "Infinity",
    longitude: "35",
    radius_km: "5",
  });
  const trailingText = validate({
    latitude: "-15abc",
    longitude: "35",
    radius_km: "5",
  });
  const duplicateParams = new URLSearchParams(
    "latitude=-15&latitude=-14&longitude=35&radius_km=5"
  );
  const duplicate = validateNearbySearchParams(duplicateParams);

  assert.equal(nonFinite.ok, false);
  assert.equal(trailingText.ok, false);
  assert.equal(duplicate.ok, false);
});

test("enforces coordinate and radius ranges", () => {
  for (const query of [
    { latitude: "91", longitude: "35", radius_km: "5" },
    { latitude: "-15", longitude: "181", radius_km: "5" },
    { latitude: "-15", longitude: "35", radius_km: "0" },
    { latitude: "-15", longitude: "35", radius_km: "101" },
  ]) {
    assert.equal(validate(query).ok, false);
  }
});

test("rejects invalid optional filters", () => {
  const invalidService = validate({
    latitude: "-15",
    longitude: "35",
    radius_km: "5",
    service_id: "1 OR 1=1",
  });
  const blankCategory = new URLSearchParams(
    "latitude=-15&longitude=35&radius_km=5&category=%20"
  );

  assert.equal(invalidService.ok, false);
  assert.equal(validateNearbySearchParams(blankCategory).ok, false);
});

test("a newer search or reset invalidates an older response", () => {
  const requests = new LatestRequestCoordinator();
  const first = requests.start();
  const second = requests.start();

  assert.equal(requests.isCurrent(first), false);
  assert.equal(requests.isCurrent(second), true);

  requests.invalidate();

  assert.equal(requests.isCurrent(second), false);
});

test("current location creates a labelled draft without applying it", () => {
  const initial = createDefaultSearchDraft();
  const selected = selectCurrentLocation(initial, {
    latitude: -15.4,
    longitude: 35.3,
  });

  assert.equal(selected.locationSource, "current");
  assert.equal(selected.locationLabel, "Your current location");
  assert.equal(selected.startingPointId, "");
  assert.equal(selected.latitude, "-15.4");
  assert.equal(selected.longitude, "35.3");
  assert.equal(searchDraftsMatch(initial, selected), false);
});

test("geolocation failures suggest the other location choices", () => {
  assert.equal(
    geolocationFailureMessage(1),
    "Location permission was denied. Choose on map or select a starting point instead."
  );
  assert.equal(
    geolocationFailureMessage(2),
    "Your location is currently unavailable. Choose on map or select a starting point instead."
  );
  assert.match(geolocationFailureMessage(3), /choose on map/i);
});

test("map and provider selections use human-readable draft labels", () => {
  const initial = createDefaultSearchDraft();
  const mapSelection = selectMapLocation(initial, {
    latitude: -15.39,
    longitude: 35.34,
  });
  const providerSelection = selectProviderLocation(
    initial,
    unimaClinic
  );

  assert.equal(mapSelection.locationSource, "map");
  assert.equal(mapSelection.locationLabel, "Selected point on map");
  assert.equal(providerSelection.locationSource, "provider");
  assert.equal(providerSelection.locationLabel, "UNIMA Clinic");
  assert.equal(providerSelection.startingPointId, "10");
  assert.equal(
    Number(providerSelection.latitude),
    unimaClinic.latitude
  );
  assert.equal(
    Number(providerSelection.longitude),
    unimaClinic.longitude
  );
});

test("manual coordinate edits clear a previous location identity", () => {
  const providerSelection = selectProviderLocation(
    createDefaultSearchDraft(),
    unimaClinic
  );
  const manualSelection = updateManualCoordinate(
    providerSelection,
    "latitude",
    "-15.4"
  );

  assert.equal(manualSelection.locationSource, "manual");
  assert.equal(
    manualSelection.locationLabel,
    "Manually entered location"
  );
  assert.equal(manualSelection.startingPointId, "");
  assert.equal(
    manualSelection.longitude,
    providerSelection.longitude
  );
});

test("applied search metadata stays frozen when the draft changes", () => {
  const submitted = selectProviderLocation(
    createDefaultSearchDraft(),
    unimaClinic
  );
  const applied = canonicalizeAppliedDraft(
    {
      latitude: unimaClinic.latitude,
      longitude: unimaClinic.longitude,
      radiusKm: 5,
      serviceId: null,
      category: null,
    },
    submitted
  );
  const changedDraft = selectMapLocation(applied, {
    latitude: -15.4,
    longitude: 35.35,
  });

  assert.equal(applied.locationLabel, "UNIMA Clinic");
  assert.equal(changedDraft.locationLabel, "Selected point on map");
  assert.equal(locationDraftsMatch(applied, changedDraft), false);
  assert.equal(searchDraftsMatch(applied, changedDraft), false);
});

test("switching search mode is an unapplied change", () => {
  const submitted = selectProviderLocation(
    createDefaultSearchDraft(),
    unimaClinic
  );
  const applied = canonicalizeAppliedDraft(
    {
      latitude: unimaClinic.latitude,
      longitude: unimaClinic.longitude,
      radiusKm: 5,
      serviceId: null,
      category: null,
    },
    submitted
  );
  const roadDraft = { ...applied, mode: "road" };

  assert.equal(applied.mode, "straight-line");
  assert.equal(searchDraftsMatch(applied, roadDraft), false);
});

test("canonical road search keeps its own maximum and filters", () => {
  const submitted = {
    ...selectProviderLocation(createDefaultSearchDraft(), unimaClinic),
    mode: "road",
    maxRoadDistanceKm: "20.0",
    serviceId: "1",
  };
  const applied = canonicalizeRoadAppliedDraft(
    {
      latitude: unimaClinic.latitude,
      longitude: unimaClinic.longitude,
      maxRoadDistanceKm: 20,
      serviceId: "1",
      category: null,
    },
    submitted
  );

  assert.equal(applied.mode, "road");
  assert.equal(applied.maxRoadDistanceKm, "20");
  assert.equal(applied.radiusKm, "5");
  assert.equal(applied.locationLabel, "UNIMA Clinic");
});

test("semantically identical numeric values are not marked changed", () => {
  const first = selectMapLocation(createDefaultSearchDraft(), {
    latitude: -15,
    longitude: 35,
  });
  const second = {
    ...first,
    latitude: "-15.000000",
    longitude: "35.0",
    radiusKm: "5.0",
  };

  assert.equal(searchDraftsMatch(first, second), true);
});

test("an empty location uses the single friendly search message", () => {
  const initial = createDefaultSearchDraft();

  assert.equal(isStartingLocationBlank(initial), true);
  assert.equal(
    MISSING_STARTING_LOCATION_MESSAGE,
    "Choose your location, select a starting point, or click the map."
  );
});

test("a partial manual location does not create a draft map marker", () => {
  const partial = updateManualCoordinate(
    createDefaultSearchDraft(),
    "latitude",
    "-15.4"
  );

  assert.equal(isStartingLocationBlank(partial), false);
  assert.equal(getValidDraftOrigin(partial), null);
});

test("clearing or resetting removes location and filter state", () => {
  const selected = {
    ...selectProviderLocation(createDefaultSearchDraft(), unimaClinic),
    radiusKm: "20",
    serviceId: "1",
    category: "University",
  };
  const locationCleared = clearSelectedLocation(selected);
  const reset = createDefaultSearchDraft();

  assert.equal(locationCleared.locationSource, "none");
  assert.equal(locationCleared.locationLabel, null);
  assert.equal(locationCleared.latitude, "");
  assert.equal(locationCleared.longitude, "");
  assert.deepEqual(reset, {
    mode: "straight-line",
    latitude: "",
    longitude: "",
    locationSource: "none",
    locationLabel: null,
    startingPointId: "",
    radiusKm: "5",
    maxRoadDistanceKm: "",
    serviceId: "",
    category: "",
  });
});
