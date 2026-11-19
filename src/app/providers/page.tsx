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
} from "../../components/ProviderSearchForm";
import type {
  MapViewRequest,
  ProviderFocusRequest,
} from "../../components/ProviderMap";
import { LatestRequestCoordinator } from "../../lib/latest-request";
import { buildProviderSearchRequest } from "../../lib/provider-search-request";
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
  type SearchDraft,
} from "../../lib/provider-search-state";
import {
  validateNearbySearchParams,
  type NearbySearchCriteria,
  type NearbySearchValidationError,
} from "../../lib/nearby-search";
import {
  validateRoadSearchParams,
  type RoadSearchCriteria,
  type RoadSearchValidationError,
} from "../../lib/road-search";
import type {
  ApiErrorResponse,
  AppliedProviderSearch,
  NearbyProvider,
  NearbyProvidersResponse,
  Provider,
  ProvidersResponse,
  RoadProvider,
  RoadProvidersResponse,
  RoadRouteResponse,
  SearchOrigin,
  ServiceOption,
  ServicesResponse,
} from "../../types/provider";

const ProviderMap = dynamic(
  () => import("../../components/ProviderMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[380px] w-full flex-1 items-center justify-center bg-slate-100 text-slate-600 lg:min-h-0">
        Loading map…
      </div>
    ),
  }
);

type InitialStatus = "loading" | "success" | "error";
type ResultsMode = "all" | "search";
type DisplayProvider = Provider | NearbyProvider | RoadProvider;
type AppliedSearchView = AppliedProviderSearch & {
  locationLabel: string;
};

type SearchValidationError =
  | NearbySearchValidationError
  | RoadSearchValidationError;

type ValidatedSearch =
  | { mode: "straight-line"; criteria: NearbySearchCriteria }
  | { mode: "road"; criteria: RoadSearchCriteria };

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

function isRoadProvider(
  provider: DisplayProvider
): provider is RoadProvider {
  return "route_status" in provider;
}

type ProviderResultCardProps = {
  provider: DisplayProvider;
  routeLoading: boolean;
  onSelect: (providerId: string) => void;
};

function ProviderResultCard({
  provider,
  routeLoading,
  onSelect,
}: ProviderResultCardProps) {
  const visibleServices = provider.services.slice(0, 2);
  const additionalServices = provider.services.slice(2);

  return (
    <article className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md">
      <div className="min-w-0 px-3 pt-2.5">
        <h3 className="break-words text-sm font-semibold leading-5 text-slate-950">
          {provider.name}
        </h3>

        <p className="mt-0.5 text-xs font-medium text-blue-700">
          {provider.category ?? "Category not specified"}
        </p>

        {visibleServices.length > 0 ? (
          <div className="mt-1.5 text-xs leading-4 text-slate-600">
            <span className="font-semibold text-slate-700">
              Services: {" "}
            </span>
            <span className="break-words">
              {visibleServices.join(", ")}
            </span>

            {additionalServices.length > 0 ? (
              <details className="mt-0.5">
                <summary className="-ml-1 inline-flex min-h-11 cursor-pointer items-center rounded-sm px-1 font-semibold text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:min-h-9">
                  Show {additionalServices.length} more
                </summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {additionalServices.map((service, index) => (
                    <li
                      key={`${service}-${index}`}
                      className="break-words"
                    >
                      {service}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : (
          <p className="mt-1.5 text-xs text-slate-600">
            Services not specified
          </p>
        )}
      </div>

      <div className="mt-2 flex min-h-10 items-center justify-between gap-2 border-t border-slate-100 px-3 py-1.5">
        {isNearbyProvider(provider) ? (
          <p className="min-w-0 text-xs font-semibold text-slate-700">
            Straight-line distance: {" "}
            {provider.distance_km.toFixed(2)} km
          </p>
        ) : isRoadProvider(provider) ? (
          <p className="min-w-0 text-xs font-semibold text-slate-700">
            {provider.route_status === "reachable" &&
            provider.road_distance_km !== null
              ? `Road distance: ${provider.road_distance_km.toFixed(2)} km`
              : provider.route_status === "snap-too-far"
                ? "Too far from the routable road network"
                : "No road route available"}
          </p>
        ) : (
          <span aria-hidden="true" />
        )}

        <button
          type="button"
          onClick={() => onSelect(provider.id)}
          disabled={routeLoading}
          aria-busy={routeLoading}
          aria-label={
            isRoadProvider(provider) &&
            provider.route_status === "reachable"
              ? `Show road route to ${provider.name}`
              : `Show ${provider.name} on map`
          }
          className="min-h-11 shrink-0 rounded-md px-2.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait disabled:opacity-70 lg:min-h-9"
        >
          {routeLoading
            ? "Loading route..."
            : isRoadProvider(provider) &&
                provider.route_status === "reachable"
              ? "Show route"
              : "Show on map"}
        </button>
      </div>
    </article>
  );
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
  const [draft, setDraft] = useState<SearchDraft>(
    createDefaultSearchDraft
  );
  const [appliedDraft, setAppliedDraft] = useState<SearchDraft>(
    createDefaultSearchDraft
  );
  const [appliedSearch, setAppliedSearch] =
    useState<AppliedSearchView | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    SearchValidationError[]
  >([]);
  const [locationError, setLocationError] = useState<string | null>(
    null
  );
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [geolocationStatus, setGeolocationStatus] =
    useState<GeolocationStatus>({ state: "idle", message: null });
  const [mapSelectionMode, setMapSelectionMode] = useState(false);
  const [mapLayoutRevision, setMapLayoutRevision] = useState(0);
  const [viewRequest, setViewRequest] = useState<MapViewRequest>({
    id: 0,
    mode: "all",
  });
  const [focusRequest, setFocusRequest] =
    useState<ProviderFocusRequest | null>(null);
  const [selectedRoute, setSelectedRoute] =
    useState<RoadRouteResponse | null>(null);
  const [routeLoadingProviderId, setRouteLoadingProviderId] =
    useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const routeAbortRef = useRef<AbortController | null>(null);
  const geolocationRequestRef = useRef(0);
  const mapSectionRef = useRef<HTMLElement | null>(null);
  const mapInstructionRef = useRef<HTMLParagraphElement | null>(null);
  const [requestCoordinator] = useState(
    () => new LatestRequestCoordinator()
  );
  const [routeRequestCoordinator] = useState(
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
        routeAbortRef.current?.abort();
        routeRequestCoordinator.invalidate();
        setSelectedRoute(null);
        setRouteLoadingProviderId(null);
        setRouteError(null);
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
  }, [reloadKey, routeRequestCoordinator]);

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
      routeAbortRef.current?.abort();
      requestCoordinator.invalidate();
      routeRequestCoordinator.invalidate();
      geolocationRequestRef.current += 1;
    },
    [requestCoordinator, routeRequestCoordinator]
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

  const hasUnappliedChanges = !searchDraftsMatch(
    draft,
    appliedDraft
  );
  const hasUnappliedLocationChange = !locationDraftsMatch(
    draft,
    appliedDraft
  );
  const draftLocationForMap = hasUnappliedLocationChange
    ? getValidDraftOrigin(draft)
    : null;

  const clearDraftMessages = useCallback(() => {
    setValidationErrors([]);
    setLocationError(null);
    setSearchError(null);
  }, []);

  const handleFilterChange = useCallback(
    (
      field:
        | "mode"
        | "radiusKm"
        | "maxRoadDistanceKm"
        | "serviceId"
        | "category",
      value: string
    ) => {
      if (
        field === "mode" &&
        (value === "straight-line" || value === "road")
      ) {
        setDraft((current) => ({ ...current, mode: value }));
      } else if (field !== "mode") {
        setDraft((current) => ({ ...current, [field]: value }));
      }
      setValidationErrors([]);
      setSearchError(null);
    },
    []
  );

  const handleManualCoordinateChange = useCallback(
    (field: "latitude" | "longitude", value: string) => {
      geolocationRequestRef.current += 1;
      setMapSelectionMode(false);
      setGeolocationStatus({ state: "idle", message: null });
      clearDraftMessages();
      setDraft((current) =>
        updateManualCoordinate(current, field, value)
      );
    },
    [clearDraftMessages]
  );

  const handleStartingPointChange = useCallback(
    (providerId: string) => {
      geolocationRequestRef.current += 1;
      setMapSelectionMode(false);
      setGeolocationStatus({ state: "idle", message: null });
      clearDraftMessages();

      if (providerId === "") {
        setDraft((current) => clearSelectedLocation(current));
        return;
      }

      const provider = allProviders.find(
        (candidate) => candidate.id === providerId
      );

      if (!provider) return;

      setDraft((current) =>
        selectProviderLocation(current, provider)
      );
    },
    [allProviders, clearDraftMessages]
  );

  const handleChooseMap = useCallback(() => {
    if (mapSelectionMode) {
      setMapSelectionMode(false);
      return;
    }

    geolocationRequestRef.current += 1;
    setGeolocationStatus({ state: "idle", message: null });
    clearDraftMessages();
    setMapSelectionMode(true);

    window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

      mapSectionRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
      mapInstructionRef.current?.focus({ preventScroll: true });
    });
  }, [clearDraftMessages, mapSelectionMode]);

  const handleMapStartingLocationSelect = useCallback(
    (origin: SearchOrigin) => {
      if (!mapSelectionMode) return;

      geolocationRequestRef.current += 1;
      setGeolocationStatus({ state: "idle", message: null });
      setMapSelectionMode(false);
      clearDraftMessages();
      setDraft((current) => selectMapLocation(current, origin));
    },
    [clearDraftMessages, mapSelectionMode]
  );

  const handleUseLocation = useCallback(() => {
    geolocationRequestRef.current += 1;
    const requestId = geolocationRequestRef.current;
    setMapSelectionMode(false);
    clearDraftMessages();

    if (!("geolocation" in navigator)) {
      setGeolocationStatus({
        state: "error",
        message:
          "Location is unavailable in this browser. Choose on map or select a starting point instead.",
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

        setDraft((current) =>
          selectCurrentLocation(current, {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          })
        );
        clearDraftMessages();
        setGeolocationStatus({
          state: "success",
          message:
            "Your current location is selected. Search nearby to apply it.",
        });
      },
      (error) => {
        if (requestId !== geolocationRequestRef.current) return;

        setGeolocationStatus({
          state: "error",
          message: geolocationFailureMessage(error.code),
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 0,
      }
    );
  }, [clearDraftMessages]);

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const submittedDraft = { ...draft };

    if (isStartingLocationBlank(submittedDraft)) {
      setLocationError(MISSING_STARTING_LOCATION_MESSAGE);
      setValidationErrors([]);
      setSearchError(null);
      return;
    }

    const { searchParams } = buildProviderSearchRequest(
      submittedDraft
    );
    let validatedSearch: ValidatedSearch;

    if (submittedDraft.mode === "straight-line") {
      const validation = validateNearbySearchParams(searchParams);

      if (!validation.ok) {
        setLocationError(null);
        setValidationErrors(validation.errors);
        setSearchError(null);
        return;
      }

      validatedSearch = {
        mode: "straight-line",
        criteria: validation.value,
      };
    } else {
      const validation = validateRoadSearchParams(searchParams);

      if (!validation.ok) {
        setLocationError(null);
        setValidationErrors(validation.errors);
        setSearchError(null);
        return;
      }

      validatedSearch = {
        mode: "road",
        criteria: validation.value,
      };
    }

    const { criteria } = validatedSearch;
    const requestId = requestCoordinator.start();
    const controller = new AbortController();

    searchAbortRef.current?.abort();
    searchAbortRef.current = controller;
    setMapSelectionMode(false);
    setLocationError(null);
    setValidationErrors([]);
    setSearchError(null);
    setSearchLoading(true);

    const requestParams = new URLSearchParams({
      latitude: String(criteria.latitude),
      longitude: String(criteria.longitude),
    });

    if (validatedSearch.mode === "straight-line") {
      requestParams.set(
        "radius_km",
        String(validatedSearch.criteria.radiusKm)
      );
    } else if (validatedSearch.criteria.maxRoadDistanceKm !== null) {
      requestParams.set(
        "max_road_distance_km",
        String(validatedSearch.criteria.maxRoadDistanceKm)
      );
    }

    if (criteria.serviceId) {
      requestParams.set("service_id", criteria.serviceId);
    }

    if (criteria.category) {
      requestParams.set("category", criteria.category);
    }

    try {
      const { endpoint } = buildProviderSearchRequest(submittedDraft);
      const response = await fetch(
        `${endpoint}?${requestParams.toString()}`,
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

      if (
        controller.signal.aborted ||
        !requestCoordinator.isCurrent(requestId)
      ) {
        return;
      }

      let canonicalDraft: SearchDraft;
      let nextAppliedSearch: AppliedSearchView;
      let nextProviders: DisplayProvider[];
      let nextViewRequest:
        | {
            mode: "straight-search";
            origin: SearchOrigin;
            radiusKm: number;
          }
        | { mode: "road-search"; origin: SearchOrigin };

      if (validatedSearch.mode === "straight-line") {
        const data = (await response.json()) as NearbyProvidersResponse;
        canonicalDraft = canonicalizeAppliedDraft(
          validatedSearch.criteria,
          submittedDraft
        );
        nextAppliedSearch = {
          mode: "straight-line",
          origin: data.origin,
          radius_km: data.radius_km,
          service_id: criteria.serviceId,
          category: criteria.category,
          locationLabel:
            submittedDraft.locationLabel ??
            "Manually entered location",
        };
        nextProviders = data.providers;
        nextViewRequest = {
          mode: "straight-search",
          origin: data.origin,
          radiusKm: data.radius_km,
        };
      } else {
        const data = (await response.json()) as RoadProvidersResponse;
        canonicalDraft = canonicalizeRoadAppliedDraft(
          validatedSearch.criteria,
          submittedDraft
        );
        nextAppliedSearch = {
          mode: "road",
          origin: data.origin,
          max_road_distance_km: data.max_road_distance_km,
          service_id: criteria.serviceId,
          category: criteria.category,
          locationLabel:
            submittedDraft.locationLabel ??
            "Manually entered location",
        };
        nextProviders = data.providers;
        nextViewRequest = {
          mode: "road-search",
          origin: data.origin,
        };
      }

      if (
        controller.signal.aborted ||
        !requestCoordinator.isCurrent(requestId)
      ) {
        return;
      }

      routeAbortRef.current?.abort();
      routeRequestCoordinator.invalidate();
      setSelectedRoute(null);
      setRouteLoadingProviderId(null);
      setRouteError(null);
      setDisplayedProviders(nextProviders);
      setResultsMode("search");
      setAppliedSearch(nextAppliedSearch);
      setAppliedDraft(canonicalDraft);
      setDraft((current) =>
        searchDraftsMatch(current, submittedDraft)
          ? canonicalDraft
          : current
      );
      setFocusRequest(null);
      setViewRequest((current) => ({
        id: current.id + 1,
        ...nextViewRequest,
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
    routeAbortRef.current?.abort();
    requestCoordinator.invalidate();
    routeRequestCoordinator.invalidate();
    geolocationRequestRef.current += 1;
    setSearchLoading(false);
    setSearchError(null);
    setValidationErrors([]);
    setLocationError(null);
    setGeolocationStatus({ state: "idle", message: null });
    setMapSelectionMode(false);
    setDraft(createDefaultSearchDraft());
    setAppliedDraft(createDefaultSearchDraft());
    setDisplayedProviders(allProviders);
    setResultsMode("all");
    setAppliedSearch(null);
    setSelectedRoute(null);
    setRouteLoadingProviderId(null);
    setRouteError(null);
    setFocusRequest(null);
    setViewRequest((current) => ({
      id: current.id + 1,
      mode: "all",
    }));
  };

  const handleProviderSelect = async (providerId: string) => {
    setFocusRequest((current) => ({
      id: (current?.id ?? 0) + 1,
      providerId,
    }));

    if (appliedSearch?.mode !== "road") return;

    const provider = displayedProviders.find(
      (candidate) => candidate.id === providerId
    );

    if (
      !provider ||
      !isRoadProvider(provider) ||
      provider.route_status !== "reachable"
    ) {
      routeAbortRef.current?.abort();
      routeRequestCoordinator.invalidate();
      setSelectedRoute(null);
      setRouteLoadingProviderId(null);
      setRouteError(
        provider &&
          isRoadProvider(provider) &&
          provider.route_status === "snap-too-far"
          ? "This provider is too far from an eligible road to draw a route."
          : "No driving route is available for this provider."
      );
      return;
    }

    if (selectedRoute?.provider_id === providerId) {
      routeAbortRef.current?.abort();
      routeRequestCoordinator.invalidate();
      setRouteLoadingProviderId(null);
      setRouteError(null);
      setSelectedRoute((current) =>
        current ? { ...current } : current
      );
      return;
    }

    const requestId = routeRequestCoordinator.start();
    const controller = new AbortController();
    routeAbortRef.current?.abort();
    routeAbortRef.current = controller;
    setRouteLoadingProviderId(providerId);
    setRouteError(null);

    const routeParams = new URLSearchParams({
      latitude: String(appliedSearch.origin.latitude),
      longitude: String(appliedSearch.origin.longitude),
      provider_id: providerId,
    });

    try {
      const response = await fetch(
        `/api/providers/road/routes?${routeParams.toString()}`,
        { signal: controller.signal, cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error(
          await readApiError(response, "Unable to load this road route")
        );
      }

      const data = (await response.json()) as RoadRouteResponse;

      if (
        controller.signal.aborted ||
        !routeRequestCoordinator.isCurrent(requestId)
      ) {
        return;
      }

      setSelectedRoute(data);
    } catch (error) {
      if (
        controller.signal.aborted ||
        !routeRequestCoordinator.isCurrent(requestId)
      ) {
        return;
      }

      setSelectedRoute(null);
      setRouteError(
        error instanceof Error
          ? error.message
          : "Unable to load this road route."
      );
    } finally {
      if (routeRequestCoordinator.isCurrent(requestId)) {
        setRouteLoadingProviderId(null);
      }
    }
  };

  const handleToolbarLayoutChange = useCallback(() => {
    setMapLayoutRevision((current) => current + 1);
  }, []);

  const resultHeading =
    resultsMode === "all"
      ? `All providers (${displayedProviders.length})`
      : appliedSearch?.mode === "road"
        ? `Road results (${displayedProviders.length})`
        : `Nearby results (${displayedProviders.length})`;
  const reachableRoadCount = displayedProviders.filter(
    (provider) =>
      isRoadProvider(provider) &&
      provider.route_status === "reachable"
  ).length;

  return (
    <main className="min-h-dvh bg-slate-50 px-3 py-3 text-slate-900 md:px-5 lg:h-dvh lg:min-h-[680px]">
      <div className="mx-auto flex min-h-[calc(100dvh-1.5rem)] max-w-7xl flex-col lg:h-full lg:min-h-0">
        <header className="mb-2 flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-bold tracking-tight">
            UNIMED Service Provider Locator
          </h1>
        </header>

        <ProviderSearchForm
          draft={draft}
          providers={allProviders}
          services={services}
          categories={categories}
          validationErrors={validationErrors}
          locationError={locationError}
          geolocationStatus={geolocationStatus}
          mapSelectionMode={mapSelectionMode}
          hasUnappliedChanges={hasUnappliedChanges}
          controlsDisabled={initialStatus !== "success"}
          searchLoading={searchLoading}
          onFilterChange={handleFilterChange}
          onManualCoordinateChange={handleManualCoordinateChange}
          onStartingPointChange={handleStartingPointChange}
          onSubmit={handleSearch}
          onUseLocation={handleUseLocation}
          onChooseMap={handleChooseMap}
          onReset={handleReset}
          onLayoutChange={handleToolbarLayoutChange}
        />

        {initialStatus === "loading" ? (
          <p
            role="status"
            className="mt-2 shrink-0 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800"
          >
            Loading providers and filter options…
          </p>
        ) : initialStatus === "error" ? (
          <div
            role="alert"
            className="mt-2 shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            <p>{initialError}</p>
            <button
              type="button"
              onClick={() => setReloadKey((current) => current + 1)}
              className="mt-2 min-h-10 rounded-lg bg-red-800 px-3 py-1.5 font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
            >
              Try loading again
            </button>
          </div>
        ) : null}

        {searchError ? (
          <p
            role="alert"
            className="mt-2 shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {searchError} The previous successful results remain displayed.
          </p>
        ) : null}

        {routeError ? (
          <p
            role="alert"
            className="mt-2 shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            {routeError}
          </p>
        ) : null}

        <div className="mt-3 grid min-h-[400px] flex-1 items-stretch gap-3 lg:grid-cols-[20rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[21rem_minmax(0,1fr)]">
          <aside
            id="provider-results"
            aria-labelledby="results-heading"
            aria-busy={searchLoading}
            className="flex max-h-[400px] min-w-0 flex-col overflow-hidden lg:max-h-none lg:min-h-0"
          >
            <div className="mb-2 shrink-0">
              <h2
                id="results-heading"
                aria-live="polite"
                className="text-lg font-bold leading-6"
              >
                {resultHeading}
              </h2>

              {resultsMode === "search" && appliedSearch ? (
                <p className="mt-0.5 text-xs leading-4 text-slate-600">
                  {appliedSearch.mode === "straight-line"
                    ? `Within ${appliedSearch.radius_km} km of `
                    : "Shortest by road from "}
                  <strong>{appliedSearch.locationLabel}</strong>
                  {appliedSearch.mode === "road"
                    ? appliedSearch.max_road_distance_km === null
                      ? " · No maximum road distance"
                      : ` · Maximum ${appliedSearch.max_road_distance_km} km`
                    : ""}
                  {" · "}
                  {appliedSearch.service_id
                    ? services.find(
                        (service) =>
                          service.id === appliedSearch.service_id
                      )?.name ?? "Selected service"
                    : "All services"}
                  {" · "}
                  {appliedSearch.category ?? "All categories"}
                </p>
              ) : null}

              {appliedSearch?.mode === "road" &&
              displayedProviders.length > 0 &&
              reachableRoadCount === 0 ? (
                <p className="mt-1 text-xs font-medium text-amber-800">
                  No matching provider is reachable on the imported road
                  graph. Off-network providers remain listed below.
                </p>
              ) : null}

              {searchLoading ? (
                <p role="status" className="mt-1 text-xs text-blue-700">
                  Searching...
                </p>
              ) : null}
            </div>

            {initialStatus === "loading" ? (
              <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                Provider results are loading.
              </p>
            ) : displayedProviders.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                {resultsMode === "search"
                  ? appliedSearch?.mode === "road"
                    ? "No providers match this applied road search. The starting location remains visible on the map."
                    : "No providers match this applied search. The starting location and radius remain visible on the map."
                  : "No active providers with coordinates are available."}
              </p>
            ) : (
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
                {displayedProviders.map((provider) => (
                  <ProviderResultCard
                    key={provider.id}
                    provider={provider}
                    routeLoading={
                      routeLoadingProviderId === provider.id
                    }
                    onSelect={handleProviderSelect}
                  />
                ))}
              </div>
            )}
          </aside>

          <section
            ref={mapSectionRef}
            aria-labelledby="map-heading"
            className="flex min-h-[380px] min-w-0 scroll-mt-3 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:min-h-0"
          >
            <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-x-3 border-b border-slate-200 px-3 py-1.5">
              <h2 id="map-heading" className="text-sm font-semibold">
                Provider map
              </h2>
              {mapSelectionMode ? (
                <p
                  ref={mapInstructionRef}
                  role="status"
                  aria-live="polite"
                  tabIndex={-1}
                  className="text-sm font-semibold text-amber-800 focus:outline-none"
                >
                  Click the map to choose your starting location
                </p>
              ) : selectedRoute ? (
                <p className="text-xs font-medium text-slate-600">
                  Solid line: road route · Dashed: snap access
                </p>
              ) : null}
            </div>

            <ProviderMap
              providers={displayedProviders}
              appliedSearch={appliedSearch}
              draftLocation={draftLocationForMap}
              selectionMode={mapSelectionMode}
              viewRequest={viewRequest}
              focusRequest={focusRequest}
              selectedRoute={selectedRoute}
              layoutRevision={mapLayoutRevision}
              onProviderSelect={handleProviderSelect}
              onStartingLocationSelect={
                handleMapStartingLocationSelect
              }
            />
          </section>
        </div>

        <footer className="mt-2 shrink-0 text-xs leading-4 text-slate-500">
          {appliedSearch?.mode === "road"
            ? "Road distance measures eligible road length, including partial road segments. Straight snap connectors (up to 500 m at each end) are not included."
            : "Straight-line distance is measured over the earth's surface, not by road or travel time."}
        </footer>
      </div>
    </main>
  );
}
