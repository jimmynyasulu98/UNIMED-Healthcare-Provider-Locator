import assert from "node:assert/strict";
import test from "node:test";

import { LatestRequestCoordinator } from "../src/lib/latest-request.ts";
import { validateNearbySearchParams } from "../src/lib/nearby-search.ts";

function validate(query) {
  return validateNearbySearchParams(new URLSearchParams(query));
}

test("accepts the documented UNIMA Clinic search origin", () => {
  const result = validate({
    latitude: "-15.385343687941972",
    longitude: "35.332129450877574",
    radius_km: "5",
    service_id: "2",
    category: "Clinic",
  });

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.deepEqual(result.value, {
      latitude: -15.385343687941972,
      longitude: 35.332129450877574,
      radiusKm: 5,
      serviceId: "2",
      category: "Clinic",
    });
  }
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
