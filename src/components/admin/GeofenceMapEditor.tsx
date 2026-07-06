"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import type { GeofenceConfig } from "@/lib/types";
import type { Circle, Map, Marker } from "leaflet";

const MARKER_ICON = {
  className: "",
  html: '<div style="width:18px;height:18px;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>',
  iconSize: [18, 18] as [number, number],
  iconAnchor: [9, 9] as [number, number],
};

export function GeofenceMapEditor({
  geofence,
  onChange,
  enabled,
}: {
  geofence: GeofenceConfig;
  onChange: (g: GeofenceConfig) => void;
  enabled: boolean;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const circleRef = useRef<Circle | null>(null);
  const geofenceRef = useRef(geofence);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    geofenceRef.current = geofence;
    onChangeRef.current = onChange;
  }, [geofence, onChange]);

  useEffect(() => {
    if (!enabled || !mapRef.current) return;

    let cancelled = false;

    void (async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");

      if (cancelled || !mapRef.current) return;

      const { lat, lng } = geofenceRef.current;

      if (!mapInstance.current) {
        const map = L.map(mapRef.current).setView([lat, lng], 15);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        map.on("click", (event) => {
          onChangeRef.current({
            ...geofenceRef.current,
            lat: event.latlng.lat,
            lng: event.latlng.lng,
          });
        });

        mapInstance.current = map;
      }

      syncMapLayers(
        L,
        mapInstance.current,
        geofenceRef.current,
        markerRef,
        circleRef,
        onChangeRef,
        geofenceRef
      );
      requestAnimationFrame(() => mapInstance.current?.invalidateSize());
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !mapInstance.current) return;

    void import("leaflet").then((L) => {
      if (!mapInstance.current) return;
      syncMapLayers(
        L,
        mapInstance.current,
        geofence,
        markerRef,
        circleRef,
        onChangeRef,
        geofenceRef
      );
    });
  }, [enabled, geofence.lat, geofence.lng, geofence.radius_meters]);

  useEffect(() => {
    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, []);

  if (!enabled) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
        Clique em &quot;Mostrar mapa&quot; para carregar o mapa.
      </div>
    );
  }

  return <div ref={mapRef} className="z-0 h-64 w-full rounded-lg" />;
}

function syncMapLayers(
  L: typeof import("leaflet"),
  map: Map,
  geofence: GeofenceConfig,
  markerRef: MutableRefObject<Marker | null>,
  circleRef: MutableRefObject<Circle | null>,
  onChangeRef: MutableRefObject<(g: GeofenceConfig) => void>,
  geofenceRef: MutableRefObject<GeofenceConfig>
) {
  const { lat, lng, radius_meters } = geofence;
  const center: [number, number] = [lat, lng];

  if (markerRef.current) {
    markerRef.current.setLatLng(center);
  } else {
    markerRef.current = L.marker(center, {
      draggable: true,
      icon: L.divIcon(MARKER_ICON),
    }).addTo(map);
    markerRef.current.on("dragend", () => {
      const marker = markerRef.current;
      if (!marker) return;
      const pos = marker.getLatLng();
      onChangeRef.current({
        ...geofenceRef.current,
        lat: pos.lat,
        lng: pos.lng,
      });
    });
  }

  if (circleRef.current) {
    circleRef.current.setLatLng(center);
    circleRef.current.setRadius(radius_meters);
  } else {
    circleRef.current = L.circle(center, {
      radius: radius_meters,
      color: "#2563eb",
      fillColor: "#2563eb",
      fillOpacity: 0.15,
      weight: 2,
    }).addTo(map);
  }

  map.setView(center, map.getZoom() || 15);
}
