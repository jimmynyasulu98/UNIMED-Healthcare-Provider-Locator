import { validateNearbySearchParams } from "./nearby-search.ts";

export const MAX_ROAD_DISTANCE_KM = 500;

const DECIMAL_NUMBER =
  /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const MAX_POSTGRES_BIGINT = BigInt("9223372036854775807");

export type RoadSearchField =
  | "latitude"
  | "longitude"
  | "max_road_distance_km"
  | "service_id"
  | "category";

export type RoadSearchCriteria = {
  latitude: number;
  longitude: number;
  maxRoadDistanceKm: number | null;
  serviceId: string | null;
  category: string | null;
};

export type RoadRouteCriteria = {
  latitude: number;
  longitude: number;
  providerId: string;
};

export type RoadSearchValidationError = {
  field: RoadSearchField | "provider_id";
  message: string;
};

export type RoadSearchValidationResult =
  | { ok: true; value: RoadSearchCriteria }
  | { ok: false; errors: RoadSearchValidationError[] };

export type RoadRouteValidationResult =
  | { ok: true; value: RoadRouteCriteria }
  | { ok: false; errors: RoadSearchValidationError[] };

function validateCoordinatesAndFilters(searchParams: URLSearchParams) {
  const nearbyParams = new URLSearchParams();

  for (const value of searchParams.getAll("latitude")) {
    nearbyParams.append("latitude", value);
  }

  for (const value of searchParams.getAll("longitude")) {
    nearbyParams.append("longitude", value);
  }

  nearbyParams.set("radius_km", "1");

  for (const value of searchParams.getAll("service_id")) {
    nearbyParams.append("service_id", value);
  }

  for (const value of searchParams.getAll("category")) {
    nearbyParams.append("category", value);
  }

  return validateNearbySearchParams(nearbyParams);
}

function validatePositiveBigint(
  searchParams: URLSearchParams,
  field: "provider_id",
  label: string,
  errors: RoadSearchValidationError[]
) {
  const values = searchParams.getAll(field);

  if (values.length !== 1 || !POSITIVE_INTEGER.test(values[0]?.trim())) {
    errors.push({
      field,
      message:
        values.length > 1
          ? `${label} must be provided once.`
          : `${label} must be a valid positive ID.`,
    });
    return null;
  }

  const value = values[0].trim();

  try {
    if (BigInt(value) > MAX_POSTGRES_BIGINT) {
      throw new RangeError(`${label} is outside the supported range.`);
    }
  } catch {
    errors.push({
      field,
      message: `${label} must be a valid positive ID.`,
    });
    return null;
  }

  return value;
}

export function validateRoadSearchParams(
  searchParams: URLSearchParams
): RoadSearchValidationResult {
  const sharedValidation = validateCoordinatesAndFilters(searchParams);
  const errors: RoadSearchValidationError[] = [];

  if (!sharedValidation.ok) {
    for (const error of sharedValidation.errors) {
      if (error.field !== "radius_km") {
        errors.push({
          field: error.field as Exclude<
            RoadSearchField,
            "max_road_distance_km"
          >,
          message: error.message,
        });
      }
    }
  }

  const maximumValues = searchParams.getAll("max_road_distance_km");
  let maxRoadDistanceKm: number | null = null;

  if (maximumValues.length > 1) {
    errors.push({
      field: "max_road_distance_km",
      message: "Maximum road distance must be provided once.",
    });
  } else if (maximumValues.length === 1) {
    const value = maximumValues[0].trim();

    if (!DECIMAL_NUMBER.test(value) || !Number.isFinite(Number(value))) {
      errors.push({
        field: "max_road_distance_km",
        message: "Maximum road distance must be a finite number.",
      });
    } else {
      maxRoadDistanceKm = Number(value);

      if (
        maxRoadDistanceKm <= 0 ||
        maxRoadDistanceKm > MAX_ROAD_DISTANCE_KM
      ) {
        errors.push({
          field: "max_road_distance_km",
          message: `Maximum road distance must be greater than 0 and at most ${MAX_ROAD_DISTANCE_KM} km.`,
        });
      }
    }
  }

  if (errors.length > 0 || !sharedValidation.ok) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      latitude: sharedValidation.value.latitude,
      longitude: sharedValidation.value.longitude,
      maxRoadDistanceKm,
      serviceId: sharedValidation.value.serviceId,
      category: sharedValidation.value.category,
    },
  };
}

export function validateRoadRouteParams(
  searchParams: URLSearchParams
): RoadRouteValidationResult {
  const coordinateParams = new URLSearchParams();

  for (const value of searchParams.getAll("latitude")) {
    coordinateParams.append("latitude", value);
  }

  for (const value of searchParams.getAll("longitude")) {
    coordinateParams.append("longitude", value);
  }

  const sharedValidation = validateCoordinatesAndFilters(coordinateParams);
  const errors: RoadSearchValidationError[] = [];

  if (!sharedValidation.ok) {
    for (const error of sharedValidation.errors) {
      if (error.field !== "radius_km") {
        errors.push({
          field: error.field as Exclude<
            RoadSearchField,
            "max_road_distance_km"
          >,
          message: error.message,
        });
      }
    }
  }

  const providerId = validatePositiveBigint(
    searchParams,
    "provider_id",
    "Provider",
    errors
  );

  if (errors.length > 0 || !sharedValidation.ok || providerId === null) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      latitude: sharedValidation.value.latitude,
      longitude: sharedValidation.value.longitude,
      providerId,
    },
  };
}
