"use client";

import type { FormEvent } from "react";
import type {
  NearbySearchField,
  NearbySearchValidationError,
} from "../lib/nearby-search";
import type { ServiceOption } from "../types/provider";

export type SearchDraft = {
  latitude: string;
  longitude: string;
  radiusKm: string;
  serviceId: string;
  category: string;
};

export type GeolocationStatus = {
  state: "idle" | "loading" | "success" | "error";
  message: string | null;
};

type ProviderSearchFormProps = {
  draft: SearchDraft;
  services: ServiceOption[];
  categories: string[];
  validationErrors: NearbySearchValidationError[];
  geolocationStatus: GeolocationStatus;
  originNotice: string | null;
  hasUnappliedChanges: boolean;
  controlsDisabled: boolean;
  searchLoading: boolean;
  onDraftChange: (field: keyof SearchDraft, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUseLocation: () => void;
  onReset: () => void;
};

const RADIUS_OPTIONS = [1, 5, 10, 17, 20, 50];

function hasFieldError(
  errors: NearbySearchValidationError[],
  field: NearbySearchField
) {
  return errors.some((error) => error.field === field);
}

export default function ProviderSearchForm({
  draft,
  services,
  categories,
  validationErrors,
  geolocationStatus,
  originNotice,
  hasUnappliedChanges,
  controlsDisabled,
  searchLoading,
  onDraftChange,
  onSubmit,
  onUseLocation,
  onReset,
}: ProviderSearchFormProps) {
  return (
    <section
      aria-labelledby="search-heading"
      className="mb-6 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="search-heading" className="text-xl font-bold">
            Find providers near an origin
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Click the map, enter coordinates, or choose your current
            location. Filters are applied only after you submit.
          </p>
        </div>

        {hasUnappliedChanges ? (
          <p
            role="status"
            className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800"
          >
            Inputs changed — apply them to update the results and map.
          </p>
        ) : null}
      </div>

      <form
        aria-label="Nearby provider search"
        className="mt-5 space-y-4"
        noValidate
        onSubmit={onSubmit}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <label className="block lg:col-span-2">
            <span className="text-sm font-semibold text-slate-700">
              Latitude
            </span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={draft.latitude}
              onChange={(event) =>
                onDraftChange("latitude", event.target.value)
              }
              aria-invalid={hasFieldError(
                validationErrors,
                "latitude"
              )}
              placeholder="e.g. -15.385344"
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
            />
          </label>

          <label className="block lg:col-span-2">
            <span className="text-sm font-semibold text-slate-700">
              Longitude
            </span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={draft.longitude}
              onChange={(event) =>
                onDraftChange("longitude", event.target.value)
              }
              aria-invalid={hasFieldError(
                validationErrors,
                "longitude"
              )}
              placeholder="e.g. 35.332129"
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
            />
          </label>

          <label className="block lg:col-span-2">
            <span className="text-sm font-semibold text-slate-700">
              Radius
            </span>
            <select
              value={draft.radiusKm}
              onChange={(event) =>
                onDraftChange("radiusKm", event.target.value)
              }
              aria-invalid={hasFieldError(
                validationErrors,
                "radius_km"
              )}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
            >
              {RADIUS_OPTIONS.map((radius) => (
                <option key={radius} value={radius}>
                  {radius} km
                </option>
              ))}
            </select>
          </label>

          <label className="block lg:col-span-3">
            <span className="text-sm font-semibold text-slate-700">
              Service
            </span>
            <select
              value={draft.serviceId}
              onChange={(event) =>
                onDraftChange("serviceId", event.target.value)
              }
              aria-invalid={hasFieldError(
                validationErrors,
                "service_id"
              )}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
            >
              <option value="">All services</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block lg:col-span-3">
            <span className="text-sm font-semibold text-slate-700">
              Category
            </span>
            <select
              value={draft.category}
              onChange={(event) =>
                onDraftChange("category", event.target.value)
              }
              aria-invalid={hasFieldError(
                validationErrors,
                "category"
              )}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
        </div>

        {validationErrors.length > 0 ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <p className="font-semibold">Check the search inputs:</p>
            <ul className="mt-1 list-disc pl-5">
              {validationErrors.map((error) => (
                <li key={`${error.field}-${error.message}`}>
                  {error.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {geolocationStatus.message ? (
          <p
            role={
              geolocationStatus.state === "error" ? "alert" : "status"
            }
            className={
              geolocationStatus.state === "error"
                ? "text-sm text-red-700"
                : "text-sm text-slate-600"
            }
          >
            {geolocationStatus.message}
          </p>
        ) : originNotice ? (
          <p role="status" className="text-sm text-slate-600">
            {originNotice}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={onUseLocation}
            disabled={
              controlsDisabled || geolocationStatus.state === "loading"
            }
            className="min-h-11 rounded-lg border border-blue-700 px-4 py-2 font-semibold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {geolocationStatus.state === "loading"
              ? "Getting location…"
              : "Use my location"}
          </button>

          <button
            type="submit"
            disabled={controlsDisabled || searchLoading}
            className="min-h-11 rounded-lg bg-blue-700 px-5 py-2 font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {searchLoading
              ? "Finding providers…"
              : "Find nearby providers"}
          </button>

          <button
            type="button"
            onClick={onReset}
            disabled={controlsDisabled}
            className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Show all providers
          </button>
        </div>
      </form>
    </section>
  );
}
