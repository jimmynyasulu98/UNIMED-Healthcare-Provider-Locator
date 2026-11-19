"use client";

import { useEffect, useRef } from "react";
import * as L from "leaflet";
import type { Provider } from "../types/provider";

type ProviderMapProps = {
  providers: Provider[];
};

export default function ProviderMap({
  providers,
}: ProviderMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current).setView(
      [-15.3853, 35.3321],
      13
    );

    L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }
    ).addTo(map);

    const bounds = L.latLngBounds([]);

    providers.forEach((provider) => {
      const position: L.LatLngTuple = [
        provider.latitude,
        provider.longitude,
      ];

      // Use textContent so database values are treated as text.
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

      L.circleMarker(position, {
        radius: 8,
        color: "#ffffff",
        weight: 2,
        fillColor: "#2563eb",
        fillOpacity: 1,
      })
        .addTo(map)
        .bindPopup(popup);

      bounds.extend(position);
    });

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [35, 35],
        maxZoom: 14,
      });
    }

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
    };
  }, [providers]);

  return (
    <div
      ref={containerRef}
      aria-label="Map of healthcare providers in Zomba"
      style={{ height: "600px", width: "100%" }}
      className="relative z-0 rounded-xl"
    />
  );
}