export const MAX_SEARCH_RADIUS_KM = 100;

const DECIMAL_NUMBER =
  /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const MAX_POSTGRES_BIGINT = BigInt("9223372036854775807");

export type NearbySearchField =
  | "latitude"
  | "longitude"
  | "radius_km"
  | "service_id"
  | "category";

export type NearbySearchCriteria = {
  latitude: number;
  longitude: number;
  radiusKm: number;
  serviceId: string | null;
  category: string | null;
};

export type NearbySearchValidationError = {
  field: NearbySearchField;
  message: string;
};

export type NearbySearchValidationResult =
  | { ok: true; value: NearbySearchCriteria }
  | { ok: false; errors: NearbySearchValidationError[] };

type NumericField = "latitude" | "longitude" | "radius_km";

function readRequiredNumber(
  searchParams: URLSearchParams,
  field: NumericField,
  label: string,
  errors: NearbySearchValidationError[]
) {
  const values = searchParams.getAll(field);

  if (values.length !== 1 || values[0].trim() === "") {
    errors.push({
      field,
      message:
        values.length > 1
          ? `${label} must be provided once.`
          : `${label} is required.`,
    });
    return null;
  }

  const value = values[0].trim();

  if (!DECIMAL_NUMBER.test(value)) {
    errors.push({
      field,
      message: `${label} must be a finite number.`,
    });
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    errors.push({
      field,
      message: `${label} must be a finite number.`,
    });
    return null;
  }

  return number;
}

function readOptionalServiceId(
  searchParams: URLSearchParams,
  errors: NearbySearchValidationError[]
) {
  const values = searchParams.getAll("service_id");

  if (values.length === 0) return null;

  if (values.length > 1) {
    errors.push({
      field: "service_id",
      message: "Service must be provided once.",
    });
    return null;
  }

  const value = values[0].trim();

  if (!POSITIVE_INTEGER.test(value)) {
    errors.push({
      field: "service_id",
      message: "Service must be a valid positive ID.",
    });
    return null;
  }

  try {
    if (BigInt(value) > MAX_POSTGRES_BIGINT) {
      throw new RangeError("Service ID is outside the supported range.");
    }
  } catch {
    errors.push({
      field: "service_id",
      message: "Service must be a valid positive ID.",
    });
    return null;
  }

  return value;
}

function readOptionalCategory(
  searchParams: URLSearchParams,
  errors: NearbySearchValidationError[]
) {
  const values = searchParams.getAll("category");

  if (values.length === 0) return null;

  if (values.length > 1) {
    errors.push({
      field: "category",
      message: "Category must be provided once.",
    });
    return null;
  }

  const value = values[0].trim();

  if (value === "" || value.length > 30) {
    errors.push({
      field: "category",
      message: "Category must be a valid provider category.",
    });
    return null;
  }

  return value;
}

export function validateNearbySearchParams(
  searchParams: URLSearchParams
): NearbySearchValidationResult {
  const errors: NearbySearchValidationError[] = [];
  const latitude = readRequiredNumber(
    searchParams,
    "latitude",
    "Latitude",
    errors
  );
  const longitude = readRequiredNumber(
    searchParams,
    "longitude",
    "Longitude",
    errors
  );
  const radiusKm = readRequiredNumber(
    searchParams,
    "radius_km",
    "Radius",
    errors
  );
  const serviceId = readOptionalServiceId(searchParams, errors);
  const category = readOptionalCategory(searchParams, errors);

  if (latitude !== null && (latitude < -90 || latitude > 90)) {
    errors.push({
      field: "latitude",
      message: "Latitude must be between -90 and 90.",
    });
  }

  if (
    longitude !== null &&
    (longitude < -180 || longitude > 180)
  ) {
    errors.push({
      field: "longitude",
      message: "Longitude must be between -180 and 180.",
    });
  }

  if (
    radiusKm !== null &&
    (radiusKm <= 0 || radiusKm > MAX_SEARCH_RADIUS_KM)
  ) {
    errors.push({
      field: "radius_km",
      message: `Radius must be greater than 0 and at most ${MAX_SEARCH_RADIUS_KM} km.`,
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      latitude: latitude as number,
      longitude: longitude as number,
      radiusKm: radiusKm as number,
      serviceId,
      category,
    },
  };
}
