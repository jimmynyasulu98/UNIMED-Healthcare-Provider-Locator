"use client";

import { useEffect, useRef } from "react";
import * as L from "leaflet";
import { buildGoogleMapsDirectionsUrl } from "../lib/provider-directions";
import type {
  AppliedProviderSearch,
  NearbyProvider,
  Provider,
  RoadProvider,
  RoadRouteResponse,
  SearchOrigin,
} from "../types/provider";

type DisplayProvider = Provider | NearbyProvider | RoadProvider;

export type MapViewRequest =
  | { id: number; mode: "all" }
  | {
      id: number;
      mode: "straight-search";
      origin: SearchOrigin;
      radiusKm: number;
    }
  | {
      id: number;
      mode: "road-search";
      origin: SearchOrigin;
    };

export type ProviderFocusRequest = {
  id: number;
  providerId: string;
};

type ProviderMapProps = {
  providers: DisplayProvider[];
  appliedSearch: AppliedProviderSearch | null;
  draftLocation: SearchOrigin | null;
  selectionMode: boolean;
  viewRequest: MapViewRequest;
  focusRequest: ProviderFocusRequest | null;
  selectedRoute: RoadRouteResponse | null;
  layoutRevision: number;
  onProviderSelect: (providerId: string) => void;
  onStartingLocationSelect: (origin: SearchOrigin) => void;
};

const DEFAULT_CENTER: L.LatLngTuple = [-15.3853, 35.3321];

function hasValidCoordinates(provider: DisplayProvider) {
  return (
    Number.isFinite(provider.latitude) &&
    provider.latitude >= -90 &&
    provider.latitude <= 90 &&
    Number.isFinite(provider.longitude) &&
    provider.longitude >= -180 &&
    provider.longitude <= 180
  );
}

function createProviderPopup(provider: DisplayProvider) {
  const popup = document.createElement("div");

  const title = document.createElement("strong");
  title.textContent = provider.name;
  popup.appendChild(title);

  const category = document.createElement("p");
  category.textContent =
    provider.category ?? "Category not specified";
  popup.appendChild(category);

  const services = document.createElement("p");
  services.textContent = provider.services.length
    ? `Services: ${provider.services.join(", ")}`
    : "Services not specified";
  popup.appendChild(services);

  if (
    "distance_km" in provider &&
    Number.isFinite(provider.distance_km)
  ) {
    const distance = document.createElement("p");
    distance.textContent = `Straight-line distance: ${provider.distance_km.toFixed(2)} km`;
    popup.appendChild(distance);
  }

  if ("route_status" in provider) {
    const distance = document.createElement("p");

    if (
      provider.route_status === "reachable" &&
      provider.road_distance_km !== null
    ) {
      distance.textContent = `Road distance: ${provider.road_distance_km.toFixed(2)} km`;
    } else if (provider.route_status === "snap-too-far") {
      distance.textContent = "Too far from the routable road network";
    } else {
      distance.textContent = "No road route available";
    }

    popup.appendChild(distance);
  }

  const directionsLink = document.createElement("a");
  directionsLink.href = buildGoogleMapsDirectionsUrl({
    latitude: provider.latitude,
    longitude: provider.longitude,
  });
  directionsLink.target = "_blank";
  directionsLink.rel = "noopener noreferrer";
  directionsLink.textContent = "Get directions ↗";
  directionsLink.setAttribute(
    "aria-label",
    `Get directions to ${provider.name} in Google Maps (opens in a new tab)`
  );
  directionsLink.className =
    "mt-2 inline-flex min-h-9 items-center justify-center rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold !text-white no-underline shadow-sm transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";
  popup.appendChild(directionsLink);

  return popup;
}

export default function ProviderMap({
  providers,
  appliedSearch,
  draftLocation,
  selectionMode,
  viewRequest,
  focusRequest,
  selectedRoute,
  layoutRevision,
  onProviderSelect,
  onStartingLocationSelect,
}: ProviderMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const providerLayerRef = useRef<L.LayerGroup | null>(null);
  const searchLayerRef = useRef<L.LayerGroup | null>(null);
  const draftLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const markersByIdRef = useRef(new Map<string, L.CircleMarker>());
  const providerBoundsRef = useRef<L.LatLngBounds | null>(null);
  const onStartingLocationSelectRef = useRef(
    onStartingLocationSelect
  );
  const onProviderSelectRef = useRef(onProviderSelect);
  const selectionModeRef = useRef(selectionMode);

  useEffect(() => {
    onStartingLocationSelectRef.current = onStartingLocationSelect;
  }, [onStartingLocationSelect]);

  useEffect(() => {
    onProviderSelectRef.current = onProviderSelect;
  }, [onProviderSelect]);

  useEffect(() => {
    selectionModeRef.current = selectionMode;
  }, [selectionMode]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) return;

    const map = L.map(container).setView(DEFAULT_CENTER, 13);
    const providerLayer = L.layerGroup().addTo(map);
    const searchLayer = L.layerGroup().addTo(map);
    const draftLayer = L.layerGroup().addTo(map);
    const routeLayer = L.layerGroup().addTo(map);
    const markersById = markersByIdRef.current;

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        'Map and road data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>, ODbL 1.0',
      maxZoom: 19,
    }).addTo(map);

    const handleMapClick = (event: L.LeafletMouseEvent) => {
      if (!selectionModeRef.current) return;

      onStartingLocationSelectRef.current({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    };

    map.on("click", handleMapClick);

    let resizeFrame: number | null = null;
    const invalidateSize = () => {
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
      }

      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        map.invalidateSize({
          pan: false,
          debounceMoveend: true,
        });
      });
    };
    const resizeObserver = new ResizeObserver(invalidateSize);

    resizeObserver.observe(container);
    window.addEventListener("resize", invalidateSize, {
      passive: true,
    });
    invalidateSize();

    mapRef.current = map;
    providerLayerRef.current = providerLayer;
    searchLayerRef.current = searchLayer;
    draftLayerRef.current = draftLayer;
    routeLayerRef.current = routeLayer;

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", invalidateSize);
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
      }
      map.off("click", handleMapClick);
      markersById.clear();
      providerBoundsRef.current = null;
      providerLayerRef.current = null;
      searchLayerRef.current = null;
      draftLayerRef.current = null;
      routeLayerRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const providerLayer = providerLayerRef.current;

    if (!providerLayer) return;

    providerLayer.clearLayers();
    markersByIdRef.current.clear();

    const bounds = L.latLngBounds([]);

    for (const provider of providers) {
      if (!hasValidCoordinates(provider)) continue;

      const position: L.LatLngTuple = [
        provider.latitude,
        provider.longitude,
      ];
      const marker = L.circleMarker(position, {
        radius: 8,
        color: "#ffffff",
        weight: 2,
        fillColor: "#2563eb",
        fillOpacity: 1,
        bubblingMouseEvents: false,
      })
        .bindPopup(createProviderPopup(provider))
        .addTo(providerLayer);

      const handleMarkerSelect = () => {
        onProviderSelectRef.current(provider.id);
      };

      marker.on("click", handleMarkerSelect);

      const element = marker.getElement();

      if (element) {
        element.setAttribute("role", "button");
        element.setAttribute("tabindex", "0");
        element.setAttribute(
          "aria-label",
          `View ${provider.name} details`
        );

        const handleMarkerKeyDown = (event: Event) => {
          const keyboardEvent = event as KeyboardEvent;

          if (
            keyboardEvent.key === "Enter" ||
            keyboardEvent.key === " "
          ) {
            event.preventDefault();
            marker.openPopup();
            onProviderSelectRef.current(provider.id);
          }
        };

        element.addEventListener("keydown", handleMarkerKeyDown);
        marker.once("remove", () => {
          marker.off("click", handleMarkerSelect);
          element.removeEventListener(
            "keydown",
            handleMarkerKeyDown
          );
        });
      }

      markersByIdRef.current.set(provider.id, marker);
      bounds.extend(position);
    }

    providerBoundsRef.current = bounds.isValid() ? bounds : null;
  }, [providers]);

  useEffect(() => {
    const searchLayer = searchLayerRef.current;

    if (!searchLayer) return;

    searchLayer.clearLayers();

    if (!appliedSearch) return;

    const position: L.LatLngTuple = [
      appliedSearch.origin.latitude,
      appliedSearch.origin.longitude,
    ];

    if (appliedSearch.mode === "straight-line") {
      L.circle(position, {
        radius: appliedSearch.radius_km * 1000,
        color: "#1d4ed8",
        weight: 2,
        dashArray: "7 7",
        fillColor: "#3b82f6",
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(searchLayer);
    }

    const startingLocationPopup = document.createElement("strong");
    startingLocationPopup.textContent =
      appliedSearch.mode === "road"
        ? "Applied road-search starting location"
        : "Applied starting location";

    L.circleMarker(position, {
      radius: 9,
      color: "#ffffff",
      weight: 3,
      fillColor: "#dc2626",
      fillOpacity: 1,
      interactive: false,
    })
      .bindPopup(startingLocationPopup)
      .addTo(searchLayer);
  }, [appliedSearch]);

  useEffect(() => {
    const draftLayer = draftLayerRef.current;

    if (!draftLayer) return;

    draftLayer.clearLayers();

    if (!draftLocation) return;

    const draftPopup = document.createElement("strong");
    draftPopup.textContent = "Draft starting location — not applied";

    L.circleMarker(
      [draftLocation.latitude, draftLocation.longitude],
      {
        radius: appliedSearch ? 6 : 9,
        color: "#ffffff",
        weight: 3,
        fillColor: "#d97706",
        fillOpacity: 1,
        interactive: false,
      }
    )
      .bindPopup(draftPopup)
      .addTo(draftLayer);
  }, [appliedSearch, draftLocation]);

  useEffect(() => {
    const map = mapRef.current;
    const routeLayer = routeLayerRef.current;

    if (!map || !routeLayer) return;

    routeLayer.clearLayers();

    if (!selectedRoute) return;

    const route = L.geoJSON(selectedRoute.geometry, {
      style: {
        color: "#7c3aed",
        weight: 6,
        opacity: 0.9,
        lineCap: "round",
        lineJoin: "round",
      },
      interactive: false,
    }).addTo(routeLayer);
    const bounds = route.getBounds();
    const routeCoordinates = selectedRoute.geometry.coordinates;
    const firstCoordinate = routeCoordinates[0];
    const lastCoordinate = routeCoordinates[routeCoordinates.length - 1];
    const selectedProvider = providers.find(
      (provider) => provider.id === selectedRoute.provider_id
    );

    if (
      appliedSearch?.mode === "road" &&
      firstCoordinate
    ) {
      const originPosition: L.LatLngTuple = [
        appliedSearch.origin.latitude,
        appliedSearch.origin.longitude,
      ];

      L.polyline(
        [
          originPosition,
          [firstCoordinate[1], firstCoordinate[0]],
        ],
        {
          color: "#64748b",
          weight: 2,
          opacity: 0.8,
          dashArray: "4 6",
          interactive: false,
        }
      ).addTo(routeLayer);
      bounds.extend(originPosition);
    }

    if (
      selectedProvider &&
      hasValidCoordinates(selectedProvider) &&
      lastCoordinate
    ) {
      const providerPosition: L.LatLngTuple = [
        selectedProvider.latitude,
        selectedProvider.longitude,
      ];

      L.polyline(
        [
          [lastCoordinate[1], lastCoordinate[0]],
          providerPosition,
        ],
        {
          color: "#64748b",
          weight: 2,
          opacity: 0.8,
          dashArray: "4 6",
          interactive: false,
        }
      ).addTo(routeLayer);
      bounds.extend(providerPosition);
    }

    if (!bounds.isValid()) return;

    const animationFrame = window.requestAnimationFrame(() => {
      map.invalidateSize();
      map.fitBounds(bounds, {
        padding: [35, 35],
        maxZoom: 17,
      });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [appliedSearch, providers, selectedRoute]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;

    const animationFrame = window.requestAnimationFrame(() => {
      map.invalidateSize();

      if (viewRequest.mode === "straight-search") {
        const searchBounds = L.latLng(
          viewRequest.origin.latitude,
          viewRequest.origin.longitude
        ).toBounds(viewRequest.radiusKm * 2000);

        map.fitBounds(searchBounds, {
          padding: [30, 30],
          maxZoom: 15,
        });
        return;
      }

      if (viewRequest.mode === "road-search") {
        const roadBounds = providerBoundsRef.current
          ? L.latLngBounds(
              providerBoundsRef.current.getSouthWest(),
              providerBoundsRef.current.getNorthEast()
            )
          : L.latLngBounds([]);

        roadBounds.extend([
          viewRequest.origin.latitude,
          viewRequest.origin.longitude,
        ]);

        if (roadBounds.isValid()) {
          map.fitBounds(roadBounds, {
            padding: [35, 35],
            maxZoom: 14,
          });
        } else {
          map.setView(
            [
              viewRequest.origin.latitude,
              viewRequest.origin.longitude,
            ],
            13
          );
        }
        return;
      }

      const providerBounds = providerBoundsRef.current;

      if (providerBounds) {
        map.fitBounds(providerBounds, {
          padding: [35, 35],
          maxZoom: 14,
        });
      } else {
        map.setView(DEFAULT_CENTER, 13);
      }
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [viewRequest]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;

    const animationFrame = window.requestAnimationFrame(() => {
      map.invalidateSize({
        pan: false,
        debounceMoveend: true,
      });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [layoutRevision]);

  useEffect(() => {
    if (!focusRequest) return;

    const map = mapRef.current;
    const marker = markersByIdRef.current.get(
      focusRequest.providerId
    );

    if (!map || !marker) return;

    map.setView(
      marker.getLatLng(),
      Math.max(map.getZoom(), 15),
      { animate: true }
    );
    marker.openPopup();
  }, [focusRequest]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={
        selectionMode
          ? "Interactive map of healthcare providers in Zomba. Location selection is active; click the map to choose your starting location."
          : "Interactive map of healthcare providers in Zomba."
      }
      className={`relative z-0 min-h-[380px] w-full flex-1 lg:min-h-0 ${
        selectionMode
          ? "cursor-crosshair ring-4 ring-inset ring-amber-300"
          : ""
      }`}
    />
  );
}
