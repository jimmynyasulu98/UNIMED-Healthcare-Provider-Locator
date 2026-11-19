"use client";

import { useEffect, useRef, type FormEvent } from "react";
import type { SearchDraft } from "../lib/provider-search-state";
import type {
  NearbySearchField,
  NearbySearchValidationError,
} from "../lib/nearby-search";
import type { Provider, ServiceOption } from "../types/provider";

export type GeolocationStatus = {
  state: "idle" | "loading" | "success" | "error";
  message: string | null;
};

type FilterField = "radiusKm" | "serviceId" | "category";

type ProviderSearchFormProps = {
  draft: SearchDraft;
  providers: Provider[];
  services: ServiceOption[];
  categories: string[];
  validationErrors: NearbySearchValidationError[];
  locationError: string | null;
  geolocationStatus: GeolocationStatus;
  mapSelectionMode: boolean;
  hasUnappliedChanges: boolean;
  controlsDisabled: boolean;
  searchLoading: boolean;
  onFilterChange: (field: FilterField, value: string) => void;
  onManualCoordinateChange: (
    field: "latitude" | "longitude",
    value: string
  ) => void;
  onStartingPointChange: (providerId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUseLocation: () => void;
  onChooseMap: () => void;
  onReset: () => void;
  onLayoutChange: () => void;
};

const RADIUS_OPTIONS = [1, 5, 10, 17, 20, 50];

const CONTROL_CLASS =
  "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-100 lg:min-h-10 lg:py-1.5";

const SECONDARY_BUTTON_CLASS =
  "min-h-11 w-full rounded-lg border border-blue-700 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-10 lg:py-1.5";

function hasFieldError(
  errors: NearbySearchValidationError[],
  field: NearbySearchField
) {
  return errors.some((error) => error.field === field);
}

export default function ProviderSearchForm({
  draft,
  providers,
  services,
  categories,
  validationErrors,
  locationError,
  geolocationStatus,
  mapSelectionMode,
  hasUnappliedChanges,
  controlsDisabled,
  searchLoading,
  onFilterChange,
  onManualCoordinateChange,
  onStartingPointChange,
  onSubmit,
  onUseLocation,
  onChooseMap,
  onReset,
  onLayoutChange,
}: ProviderSearchFormProps) {
  const advancedOptionsRef = useRef<HTMLDetailsElement>(null);
  const coordinateErrors = validationErrors.filter(
    (error) =>
      error.field === "latitude" || error.field === "longitude"
  );
  const filterErrors = validationErrors.filter(
    (error) =>
      error.field !== "latitude" && error.field !== "longitude"
  );
  const hasCoordinateErrors = coordinateErrors.length > 0;
  const showGeolocationMessage =
    geolocationStatus.state === "loading" ||
    geolocationStatus.state === "error";

  useEffect(() => {
    if (hasCoordinateErrors && advancedOptionsRef.current) {
      advancedOptionsRef.current.open = true;
    }
  }, [hasCoordinateErrors]);

  return (
    <section
      aria-labelledby="search-heading"
      className="shrink-0 rounded-xl border border-blue-100 bg-white px-3 py-1.5 shadow-sm md:px-4"
    >
      <h2 id="search-heading" className="sr-only">
        Find healthcare providers near you
      </h2>

      <form
        aria-label="Nearby provider search"
        className="space-y-1"
        noValidate
        onSubmit={onSubmit}
      >
        <fieldset className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-[auto_auto_minmax(230px,340px)_minmax(180px,1fr)] lg:items-end">
          <legend className="sr-only">Starting location</legend>

          <button
            type="button"
            onClick={onUseLocation}
            disabled={
              controlsDisabled || geolocationStatus.state === "loading"
            }
            className={`${SECONDARY_BUTTON_CLASS} self-end lg:w-auto`}
          >
            {geolocationStatus.state === "loading"
              ? "Getting location..."
              : "Use my location"}
          </button>

          <button
            type="button"
            onClick={onChooseMap}
            aria-pressed={mapSelectionMode}
            disabled={controlsDisabled}
            className={`${SECONDARY_BUTTON_CLASS} self-end lg:w-auto`}
          >
            {mapSelectionMode
              ? "Cancel map selection"
              : "Choose on map"}
          </button>

          <label className="block min-w-0">
            <span className="text-sm font-semibold text-slate-700">
              Starting point
            </span>
            <select
              value={draft.startingPointId}
              onChange={(event) =>
                onStartingPointChange(event.target.value)
              }
              disabled={controlsDisabled}
              className={`${CONTROL_CLASS} mt-0.5`}
            >
              <option value="">Choose a starting point</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </label>

          <div
            id="starting-location-summary"
            aria-live="polite"
            title={draft.locationLabel ?? "No starting location selected"}
            className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg bg-slate-50 px-3 text-sm text-slate-600 sm:col-span-2 lg:col-span-1 lg:min-h-10"
          >
            <span className="shrink-0">Starting:</span>
            <strong className="min-w-0 truncate text-slate-900">
              {draft.locationLabel ?? "Not selected"}
            </strong>
          </div>
        </fieldset>

        <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-[100px_minmax(180px,1fr)_minmax(160px,1fr)_auto_auto_auto] lg:items-end">
          <label className="block min-w-0">
            <span className="text-sm font-semibold text-slate-700">
              Radius
            </span>
            <select
              value={draft.radiusKm}
              onChange={(event) =>
                onFilterChange("radiusKm", event.target.value)
              }
              disabled={controlsDisabled}
              aria-invalid={hasFieldError(
                validationErrors,
                "radius_km"
              )}
              className={`${CONTROL_CLASS} mt-0.5`}
            >
              {RADIUS_OPTIONS.map((radius) => (
                <option key={radius} value={radius}>
                  {radius} km
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="text-sm font-semibold text-slate-700">
              Service
            </span>
            <select
              value={draft.serviceId}
              onChange={(event) =>
                onFilterChange("serviceId", event.target.value)
              }
              disabled={controlsDisabled}
              aria-invalid={hasFieldError(
                validationErrors,
                "service_id"
              )}
              className={`${CONTROL_CLASS} mt-0.5`}
            >
              <option value="">All services</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="text-sm font-semibold text-slate-700">
              Category
            </span>
            <select
              value={draft.category}
              onChange={(event) =>
                onFilterChange("category", event.target.value)
              }
              disabled={controlsDisabled}
              aria-invalid={hasFieldError(
                validationErrors,
                "category"
              )}
              className={`${CONTROL_CLASS} mt-0.5`}
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            disabled={controlsDisabled || searchLoading}
            className="min-h-11 w-full self-end rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-10 lg:w-auto lg:py-1.5"
          >
            {searchLoading ? "Searching..." : "Search nearby"}
          </button>

          <button
            type="button"
            onClick={onReset}
            disabled={controlsDisabled}
            aria-label="Reset search and filters and show all providers"
            className="min-h-11 w-full self-end rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-10 lg:w-auto lg:py-1.5"
          >
            Reset
          </button>

          <details
            ref={advancedOptionsRef}
            onToggle={onLayoutChange}
            className="min-w-0 self-end text-sm sm:[&[open]]:col-span-2 lg:[&[open]]:col-span-full"
          >
            <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-md px-2.5 font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:min-h-10">
              Advanced
            </summary>

            <div className="mt-1.5 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 sm:grid-cols-2 lg:max-w-2xl">
              <label className="block min-w-0">
                <span className="text-sm font-semibold text-slate-700">
                  Latitude
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={draft.latitude}
                  onChange={(event) =>
                    onManualCoordinateChange(
                      "latitude",
                      event.target.value
                    )
                  }
                  disabled={controlsDisabled}
                  aria-invalid={hasFieldError(
                    validationErrors,
                    "latitude"
                  )}
                  placeholder="e.g. -15.385344"
                  className={`${CONTROL_CLASS} mt-0.5`}
                />
              </label>

              <label className="block min-w-0">
                <span className="text-sm font-semibold text-slate-700">
                  Longitude
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={draft.longitude}
                  onChange={(event) =>
                    onManualCoordinateChange(
                      "longitude",
                      event.target.value
                    )
                  }
                  disabled={controlsDisabled}
                  aria-invalid={hasFieldError(
                    validationErrors,
                    "longitude"
                  )}
                  placeholder="e.g. 35.332129"
                  className={`${CONTROL_CLASS} mt-0.5`}
                />
              </label>

              {coordinateErrors.length > 0 ? (
                <div
                  role="alert"
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 sm:col-span-2"
                >
                  <p className="font-semibold">
                    Check the manual coordinates:
                  </p>
                  <ul className="mt-0.5 list-disc pl-5">
                    {coordinateErrors.map((error) => (
                      <li key={`${error.field}-${error.message}`}>
                        {error.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </details>

          {hasUnappliedChanges ? (
            <p
              role="status"
              className="text-sm font-medium text-amber-800 sm:col-span-2 lg:col-span-full"
            >
              Changes not applied.
            </p>
          ) : null}
        </div>

        {locationError ? (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
          >
            {locationError}
          </p>
        ) : null}

        {showGeolocationMessage && geolocationStatus.message ? (
          <p
            role={
              geolocationStatus.state === "error" ? "alert" : "status"
            }
            className={
              geolocationStatus.state === "error"
                ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                : "text-sm text-slate-600"
            }
          >
            {geolocationStatus.message}
          </p>
        ) : null}

        {filterErrors.length > 0 ? (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            <p className="font-semibold">Check the search options:</p>
            <ul className="mt-0.5 list-disc pl-5">
              {filterErrors.map((error) => (
                <li key={`${error.field}-${error.message}`}>
                  {error.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </form>
    </section>
  );
}
