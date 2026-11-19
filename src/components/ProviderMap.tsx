"use client";

import { useEffect, useRef } from "react";
import * as L from "leaflet";
import type {
  AppliedProviderSearch,
  NearbyProvider,
  Provider,
  SearchOrigin,
} from "../types/provider";

type DisplayProvider = Provider | NearbyProvider;

export type MapViewRequest =
  | { id: number; mode: "all" }
  | {
      id: number;
      mode: "search";
      origin: SearchOrigin;
      radiusKm: number;
    };

export type ProviderFocusRequest = {
  id: number;
  providerId: string;
};

type ProviderMapProps = {
  providers: DisplayProvider[];
  appliedSearch: AppliedProviderSearch | null;
  viewRequest: MapViewRequest;
  focusRequest: ProviderFocusRequest | null;
  onOriginSelect: (origin: SearchOrigin) => void;
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

  return popup;
}

export default function ProviderMap({
  providers,
  appliedSearch,
  viewRequest,
  focusRequest,
  onOriginSelect,
}: ProviderMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const providerLayerRef = useRef<L.LayerGroup | null>(null);
  const searchLayerRef = useRef<L.LayerGroup | null>(null);
  const markersByIdRef = useRef(new Map<string, L.CircleMarker>());
  const providerBoundsRef = useRef<L.LatLngBounds | null>(null);
  const onOriginSelectRef = useRef(onOriginSelect);

  useEffect(() => {
    onOriginSelectRef.current = onOriginSelect;
  }, [onOriginSelect]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) return;

    const map = L.map(container).setView(DEFAULT_CENTER, 13);
    const providerLayer = L.layerGroup().addTo(map);
    const searchLayer = L.layerGroup().addTo(map);
    const markersById = markersByIdRef.current;

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const handleMapClick = (event: L.LeafletMouseEvent) => {
      onOriginSelectRef.current({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    };

    map.on("click", handleMapClick);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });

    resizeObserver.observe(container);

    mapRef.current = map;
    providerLayerRef.current = providerLayer;
    searchLayerRef.current = searchLayer;

    return () => {
      resizeObserver.disconnect();
      map.off("click", handleMapClick);
      markersById.clear();
      providerBoundsRef.current = null;
      providerLayerRef.current = null;
      searchLayerRef.current = null;
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
          }
        };

        element.addEventListener("keydown", handleMarkerKeyDown);
        marker.once("remove", () => {
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

    L.circle(position, {
      radius: appliedSearch.radius_km * 1000,
      color: "#1d4ed8",
      weight: 2,
      dashArray: "7 7",
      fillColor: "#3b82f6",
      fillOpacity: 0.08,
      interactive: false,
    }).addTo(searchLayer);

    const originPopup = document.createElement("strong");
    originPopup.textContent = "Applied search origin";

    L.circleMarker(position, {
      radius: 9,
      color: "#ffffff",
      weight: 3,
      fillColor: "#dc2626",
      fillOpacity: 1,
      interactive: false,
    })
      .bindPopup(originPopup)
      .addTo(searchLayer);
  }, [appliedSearch]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;

    const animationFrame = window.requestAnimationFrame(() => {
      map.invalidateSize();

      if (viewRequest.mode === "search") {
        const searchBounds = L.circle(
          [viewRequest.origin.latitude, viewRequest.origin.longitude],
          { radius: viewRequest.radiusKm * 1000 }
        ).getBounds();

        map.fitBounds(searchBounds, {
          padding: [30, 30],
          maxZoom: 15,
        });
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
      aria-label="Interactive map of healthcare providers in Zomba. Click the map to choose a search origin."
      className="relative z-0 h-[520px] w-full rounded-xl md:h-[640px]"
    />
  );
}
