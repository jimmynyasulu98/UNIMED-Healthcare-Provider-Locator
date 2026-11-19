"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import ProviderSearchForm, {
  type GeolocationStatus,
  type SearchDraft,
} from "../../components/ProviderSearchForm";
import type {
  MapViewRequest,
  ProviderFocusRequest,
} from "../../components/ProviderMap";
import { LatestRequestCoordinator } from "../../lib/latest-request";
import {
  validateNearbySearchParams,
  type NearbySearchCriteria,
  type NearbySearchValidationError,
} from "../../lib/nearby-search";
import type {
  ApiErrorResponse,
  AppliedProviderSearch,
  NearbyProvider,
  NearbyProvidersResponse,
  Provider,
  ProvidersResponse,
  SearchOrigin,
  ServiceOption,
  ServicesResponse,
} from "../../types/provider";

const ProviderMap = dynamic(
  () => import("../../components/ProviderMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[520px] items-center justify-center rounded-xl bg-slate-100 text-slate-600 md:h-[640px]">
        Loading map…
      </div>
    ),
  }
);

const DEFAULT_DRAFT: SearchDraft = {
  latitude: "",
  longitude: "",
  radiusKm: "5",
  serviceId: "",
  category: "",
};

type InitialStatus = "loading" | "success" | "error";
type ResultsMode = "all" | "nearby";
type DisplayProvider = Provider | NearbyProvider;

function draftsMatch(first: SearchDraft, second: SearchDraft) {
  return (
    first.latitude === second.latitude &&
    first.longitude === second.longitude &&
    first.radiusKm === second.radiusKm &&
    first.serviceId === second.serviceId &&
    first.category === second.category
  );
}

function createSearchParams(draft: SearchDraft) {
  const searchParams = new URLSearchParams();
  searchParams.set("latitude", draft.latitude);
  searchParams.set("longitude", draft.longitude);
  searchParams.set("radius_km", draft.radiusKm);

  if (draft.serviceId.trim() !== "") {
    searchParams.set("service_id", draft.serviceId);
  }

  if (draft.category.trim() !== "") {
    searchParams.set("category", draft.category);
  }

  return searchParams;
}

function criteriaToDraft(criteria: NearbySearchCriteria): SearchDraft {
  return {
    latitude: String(criteria.latitude),
    longitude: String(criteria.longitude),
    radiusKm: String(criteria.radiusKm),
    serviceId: criteria.serviceId ?? "",
    category: criteria.category ?? "",
  };
}

async function readApiError(
  response: Response,
  fallback: string
) {
  try {
    const payload = (await response.json()) as ApiErrorResponse;

    if (payload.details?.length) {
      return payload.details.join(" ");
    }

    return payload.error || `${fallback} (${response.status}).`;
  } catch {
    return `${fallback} (${response.status}).`;
  }
}

function isNearbyProvider(
  provider: DisplayProvider
): provider is NearbyProvider {
  return "distance_km" in provider;
}

export default function ProvidersPage() {
  const [allProviders, setAllProviders] = useState<Provider[]>([]);
  const [displayedProviders, setDisplayedProviders] = useState<
    DisplayProvider[]
  >([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [initialStatus, setInitialStatus] =
    useState<InitialStatus>("loading");
  const [initialError, setInitialError] = useState<string | null>(
    null
  );
  const [reloadKey, setReloadKey] = useState(0);
  const [resultsMode, setResultsMode] =
    useState<ResultsMode>("all");
  const [draft, setDraft] = useState<SearchDraft>({
    ...DEFAULT_DRAFT,
  });
  const [appliedDraft, setAppliedDraft] = useState<SearchDraft>({
    ...DEFAULT_DRAFT,
  });
  const [appliedSearch, setAppliedSearch] =
    useState<AppliedProviderSearch | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    NearbySearchValidationError[]
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [geolocationStatus, setGeolocationStatus] =
    useState<GeolocationStatus>({ state: "idle", message: null });
  const [originNotice, setOriginNotice] = useState<string | null>(
    null
  );
  const [viewRequest, setViewRequest] = useState<MapViewRequest>({
    id: 0,
    mode: "all",
  });
  const [focusRequest, setFocusRequest] =
    useState<ProviderFocusRequest | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const geolocationRequestRef = useRef(0);
  const [requestCoordinator] = useState(
    () => new LatestRequestCoordinator()
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialData() {
      setInitialStatus("loading");
      setInitialError(null);

      try {
        const [providersResponse, servicesResponse] = await Promise.all([
          fetch("/api/providers", {
            signal: controller.signal,
            cache: "no-store",
          }),
          fetch("/api/services", {
            signal: controller.signal,
            cache: "no-store",
          }),
        ]);

        if (!providersResponse.ok) {
          throw new Error(
            await readApiError(
              providersResponse,
              "Unable to load providers"
            )
          );
        }

        if (!servicesResponse.ok) {
          throw new Error(
            await readApiError(
              servicesResponse,
              "Unable to load service options"
            )
          );
        }

        const [providersData, servicesData] = (await Promise.all([
          providersResponse.json(),
          servicesResponse.json(),
        ])) as [ProvidersResponse, ServicesResponse];

        if (controller.signal.aborted) return;

        setAllProviders(providersData.providers);
        setDisplayedProviders(providersData.providers);
        setServices(servicesData.services);
        setResultsMode("all");
        setAppliedSearch(null);
        setInitialStatus("success");
        setViewRequest((current) => ({
          id: current.id + 1,
          mode: "all",
        }));
      } catch (error) {
        if (controller.signal.aborted) return;

        setInitialStatus("error");
        setInitialError(
          error instanceof Error
            ? error.message
            : "Unable to load provider data."
        );
      }
    }

    void loadInitialData();

    return () => controller.abort();
  }, [reloadKey]);

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
      requestCoordinator.invalidate();
      geolocationRequestRef.current += 1;
    },
    [requestCoordinator]
  );

  const categories = useMemo(() => {
    const availableCategories = new Set<string>();

    for (const provider of allProviders) {
      if (provider.category) {
        availableCategories.add(provider.category);
      }
    }

    return Array.from(availableCategories).sort((first, second) =>
      first.localeCompare(second)
    );
  }, [allProviders]);

  const hasUnappliedChanges = !draftsMatch(draft, appliedDraft);

  const updateDraft = useCallback(
    (field: keyof SearchDraft, value: string) => {
      setDraft((current) => ({ ...current, [field]: value }));
      setValidationErrors([]);
      setSearchError(null);

      if (field === "latitude" || field === "longitude") {
        geolocationRequestRef.current += 1;
        setGeolocationStatus({ state: "idle", message: null });
        setOriginNotice("Coordinates edited manually.");
      }
    },
    []
  );

  const handleMapOriginSelect = useCallback(
    (origin: SearchOrigin) => {
      geolocationRequestRef.current += 1;
      setGeolocationStatus({ state: "idle", message: null });
      setOriginNotice(
        "Origin selected from the map. Apply the search to update results."
      );
      setValidationErrors([]);
      setSearchError(null);
      setDraft((current) => ({
        ...current,
        latitude: origin.latitude.toFixed(6),
        longitude: origin.longitude.toFixed(6),
      }));
    },
    []
  );

  const handleUseLocation = useCallback(() => {
    geolocationRequestRef.current += 1;
    const requestId = geolocationRequestRef.current;
    setOriginNotice(null);

    if (!("geolocation" in navigator)) {
      setGeolocationStatus({
        state: "error",
        message:
          "Location is unavailable in this browser. Enter coordinates or click the map instead.",
      });
      return;
    }

    setGeolocationStatus({
      state: "loading",
      message: "Waiting for your browser to provide a location…",
    });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (requestId !== geolocationRequestRef.current) return;

        setDraft((current) => ({
          ...current,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }));
        setValidationErrors([]);
        setSearchError(null);
        setGeolocationStatus({
          state: "success",
          message:
            "Location added to the inputs. Apply the search to update results.",
        });
      },
      (error) => {
        if (requestId !== geolocationRequestRef.current) return;

        const message =
          error.code === 1
            ? "Location permission was denied. Enter coordinates or click the map instead."
            : error.code === 2
              ? "Your location is currently unavailable. Enter coordinates or click the map instead."
              : "Getting your location timed out. Try again or enter coordinates manually.";

        setGeolocationStatus({ state: "error", message });
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 0,
      }
    );
  }, []);

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const submittedDraft = { ...draft };
    const searchParams = createSearchParams(submittedDraft);
    const validation = validateNearbySearchParams(searchParams);

    if (!validation.ok) {
      setValidationErrors(validation.errors);
      setSearchError(null);
      return;
    }

    const criteria = validation.value;
    const requestId = requestCoordinator.start();
    const controller = new AbortController();

    searchAbortRef.current?.abort();
    searchAbortRef.current = controller;
    setValidationErrors([]);
    setSearchError(null);
    setSearchLoading(true);

    const requestParams = new URLSearchParams({
      latitude: String(criteria.latitude),
      longitude: String(criteria.longitude),
      radius_km: String(criteria.radiusKm),
    });

    if (criteria.serviceId) {
      requestParams.set("service_id", criteria.serviceId);
    }

    if (criteria.category) {
      requestParams.set("category", criteria.category);
    }

    try {
      const response = await fetch(
        `/api/providers/nearby?${requestParams.toString()}`,
        {
          signal: controller.signal,
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error(
          await readApiError(response, "Unable to search providers")
        );
      }

      const data = (await response.json()) as NearbyProvidersResponse;

      if (
        controller.signal.aborted ||
        !requestCoordinator.isCurrent(requestId)
      ) {
        return;
      }

      const canonicalDraft = criteriaToDraft(criteria);
      const nextAppliedSearch: AppliedProviderSearch = {
        origin: data.origin,
        radius_km: data.radius_km,
        service_id: criteria.serviceId,
        category: criteria.category,
      };

      setDisplayedProviders(data.providers);
      setResultsMode("nearby");
      setAppliedSearch(nextAppliedSearch);
      setAppliedDraft(canonicalDraft);
      setDraft((current) =>
        draftsMatch(current, submittedDraft) ? canonicalDraft : current
      );
      setFocusRequest(null);
      setViewRequest((current) => ({
        id: current.id + 1,
        mode: "search",
        origin: data.origin,
        radiusKm: data.radius_km,
      }));
    } catch (error) {
      if (
        controller.signal.aborted ||
        !requestCoordinator.isCurrent(requestId)
      ) {
        return;
      }

      setSearchError(
        error instanceof Error
          ? error.message
          : "Unable to search providers."
      );
    } finally {
      if (requestCoordinator.isCurrent(requestId)) {
        setSearchLoading(false);
      }
    }
  };

  const handleReset = () => {
    searchAbortRef.current?.abort();
    requestCoordinator.invalidate();
    geolocationRequestRef.current += 1;
    setSearchLoading(false);
    setSearchError(null);
    setValidationErrors([]);
    setGeolocationStatus({ state: "idle", message: null });
    setOriginNotice(null);
    setDraft({ ...DEFAULT_DRAFT });
    setAppliedDraft({ ...DEFAULT_DRAFT });
    setDisplayedProviders(allProviders);
    setResultsMode("all");
    setAppliedSearch(null);
    setFocusRequest(null);
    setViewRequest((current) => ({
      id: current.id + 1,
      mode: "all",
    }));
  };

  const handleProviderFocus = (providerId: string) => {
    setFocusRequest((current) => ({
      id: (current?.id ?? 0) + 1,
      providerId,
    }));
  };

  const resultHeading =
    resultsMode === "all"
      ? `All providers (${displayedProviders.length})`
      : `Nearby results (${displayedProviders.length})`;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 md:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            Academic prototype
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            UNIMED Provider Locator
          </h1>

          <p className="mt-2 max-w-3xl text-slate-600">
            Find active healthcare providers in Zomba by origin,
            straight-line distance, service, and category.
          </p>
        </header>

        <ProviderSearchForm
          draft={draft}
          services={services}
          categories={categories}
          validationErrors={validationErrors}
          geolocationStatus={geolocationStatus}
          originNotice={originNotice}
          hasUnappliedChanges={hasUnappliedChanges}
          controlsDisabled={initialStatus !== "success"}
          searchLoading={searchLoading}
          onDraftChange={updateDraft}
          onSubmit={handleSearch}
          onUseLocation={handleUseLocation}
          onReset={handleReset}
        />

        {initialStatus === "loading" ? (
          <p
            role="status"
            className="mb-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-800"
          >
            Loading providers and filter options…
          </p>
        ) : initialStatus === "error" ? (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
          >
            <p>{initialError}</p>
            <button
              type="button"
              onClick={() => setReloadKey((current) => current + 1)}
              className="mt-3 min-h-11 rounded-lg bg-red-800 px-4 py-2 font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
            >
              Try loading again
            </button>
          </div>
        ) : null}

        {searchError ? (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800"
          >
            {searchError} The previous successful results remain displayed.
          </p>
        ) : null}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
          <aside
            id="provider-results"
            aria-labelledby="results-heading"
            aria-busy={searchLoading}
            className="order-2 lg:order-1"
          >
            <div className="mb-4">
              <h2 id="results-heading" className="text-xl font-bold">
                {resultHeading}
              </h2>

              {resultsMode === "nearby" && appliedSearch ? (
                <div className="mt-1 space-y-1 text-sm text-slate-600">
                  <p>
                    Within {appliedSearch.radius_km} km of the red origin
                    marker. Results are ordered nearest first.
                  </p>
                  <p>
                    Applied origin: {" "}
                    {appliedSearch.origin.latitude.toFixed(6)}, {" "}
                    {appliedSearch.origin.longitude.toFixed(6)}. Filters:{" "}
                    {appliedSearch.service_id
                      ? services.find(
                          (service) =>
                            service.id === appliedSearch.service_id
                        )?.name ?? "Selected service"
                      : "All services"}
                    {"; "}
                    {appliedSearch.category ?? "All categories"}.
                  </p>
                </div>
              ) : (
                <p className="mt-1 text-sm text-slate-600">
                  Showing every active provider with coordinates.
                </p>
              )}

              {searchLoading ? (
                <p role="status" className="mt-2 text-sm text-blue-700">
                  Searching while the previous results remain visible…
                </p>
              ) : null}
            </div>

            {initialStatus === "loading" ? (
              <p className="rounded-xl border border-slate-200 bg-white p-4 text-slate-600">
                Provider results are loading.
              </p>
            ) : displayedProviders.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-white p-4 text-slate-700">
                {resultsMode === "nearby"
                  ? "No providers match this applied search. The origin and radius remain visible on the map."
                  : "No active providers with coordinates are available."}
              </p>
            ) : (
              <div className="space-y-3 lg:max-h-[640px] lg:overflow-y-auto lg:pr-1">
                {displayedProviders.map((provider) => (
                  <article
                    key={provider.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md"
                  >
                    <button
                      type="button"
                      onClick={() => handleProviderFocus(provider.id)}
                      aria-label={`Focus ${provider.name} on the map`}
                      className="w-full p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
                    >
                      <span className="block font-semibold text-slate-950">
                        {provider.name}
                      </span>

                      <span className="mt-1 block text-sm font-medium text-blue-700">
                        {provider.category ?? "Category not specified"}
                      </span>

                      <span className="mt-2 block text-sm text-slate-600">
                        {provider.services.length
                          ? provider.services.join(", ")
                          : "Services not specified"}
                      </span>

                      {isNearbyProvider(provider) ? (
                        <span className="mt-3 block text-sm font-semibold text-slate-800">
                          Straight-line distance: {" "}
                          {provider.distance_km.toFixed(2)} km
                        </span>
                      ) : null}

                      <span className="mt-3 block text-xs font-semibold uppercase tracking-wide text-blue-700">
                        Show on map
                      </span>
                    </button>
                  </article>
                ))}
              </div>
            )}
          </aside>

          <section
            aria-labelledby="map-heading"
            className="order-1 min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-6 lg:order-2"
          >
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 id="map-heading" className="font-semibold">
                Provider map
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Click the map to copy an origin into the search inputs.
                Blue points are providers; red marks the applied origin.
              </p>
            </div>

            <ProviderMap
              providers={displayedProviders}
              appliedSearch={appliedSearch}
              viewRequest={viewRequest}
              focusRequest={focusRequest}
              onOriginSelect={handleMapOriginSelect}
            />
          </section>
        </div>

        <footer className="mt-6 rounded-xl bg-blue-50 px-4 py-3 text-sm text-slate-600">
          Straight-line distance is measured over the earth’s surface and
          is not road distance or travel time. Provider information is
          supplied for this academic demonstration, and map tiles require
          an internet connection.
        </footer>
      </div>
    </main>
  );
}
