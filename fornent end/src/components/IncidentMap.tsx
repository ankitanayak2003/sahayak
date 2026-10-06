import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

export interface IncidentMapProps {
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  locationText?: string | null;
  title?: string;
  heightClass?: string;
  zoom?: number;
  interactive?: boolean;
  showNavigationLink?: boolean;
  enablePinSelection?: boolean;
  onPinSelect?: (lat: number, lng: number) => void;
}

export const IncidentMap: React.FC<IncidentMapProps> = ({
  latitude,
  longitude,
  accuracyMeters,
  locationText,
  title = 'Incident Location',
  heightClass = 'h-56',
  zoom = 15,
  interactive = true,
  showNavigationLink = true,
  enablePinSelection = false,
  onPinSelect,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  const hasCoords =
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Center coordinates: if valid coordinates provided, use them; otherwise default fallback
    const initialLat = hasCoords ? latitude! : 12.9716;
    const initialLng = hasCoords ? longitude! : 77.6412;
    const initialZoom = hasCoords ? zoom : 12;

    // Create Map Instance if not existing
    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: initialZoom,
        zoomControl: interactive,
        dragging: interactive,
        touchZoom: interactive,
        scrollWheelZoom: false, // Prevent page scroll trapping
        attributionControl: true,
      });

      // Standard OpenStreetMap Tile Layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      }).addTo(map);

      // Interactive pin selection for manual correction if enabled
      if (enablePinSelection && onPinSelect) {
        map.on('click', (e: L.LeafletMouseEvent) => {
          const { lat, lng } = e.latlng;
          onPinSelect(lat, lng);
        });
      }

      mapInstanceRef.current = map;
    } else {
      // Update center if coordinates changed
      mapInstanceRef.current.setView([initialLat, initialLng], initialZoom);
    }

    const map = mapInstanceRef.current;

    // Clean up previous marker and circle
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    if (circleRef.current) {
      circleRef.current.remove();
      circleRef.current = null;
    }

    if (hasCoords) {
      // High-visibility SVG Beacon Pin Icon
      const beaconIcon = L.divIcon({
        className: 'incident-map-marker',
        html: `
          <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 34px; height: 34px; border-radius: 50%; background: rgba(186, 26, 26, 0.35); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position: relative; width: 26px; height: 26px; border-radius: 50%; background: #ba1a1a; border: 2.5px solid #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3); display: flex; align-items: center; justify-content: center; color: white;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
            </div>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -17],
      });

      const marker = L.marker([latitude!, longitude!], {
        icon: beaconIcon,
        draggable: Boolean(enablePinSelection),
      }).addTo(map);

      if (enablePinSelection && onPinSelect) {
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          onPinSelect(pos.lat, pos.lng);
        });
      }

      // Add popup with incident location info
      const popupHtml = `
        <div style="font-family: inherit; font-size: 12px; line-height: 1.4; color: #0b1c30; padding: 2px;">
          <strong style="color: #ba1a1a; display: block; margin-bottom: 2px;">${title}</strong>
          <div>${locationText || 'Emergency Location'}</div>
          <div style="font-family: monospace; font-size: 10px; color: #64748b; margin-top: 4px;">
            ${latitude!.toFixed(5)}, ${longitude!.toFixed(5)}
          </div>
        </div>
      `;
      marker.bindPopup(popupHtml);

      markerRef.current = marker;

      // Draw accuracy radius circle if provided
      if (typeof accuracyMeters === 'number' && accuracyMeters > 0 && accuracyMeters <= 5000) {
        const circle = L.circle([latitude!, longitude!], {
          radius: accuracyMeters,
          color: '#ba1a1a',
          weight: 1.5,
          opacity: 0.6,
          fillColor: '#ba1a1a',
          fillOpacity: 0.12,
        }).addTo(map);
        circleRef.current = circle;
      }
    }

    // Leaflet container resize adjustment
    const timer = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [latitude, longitude, accuracyMeters, hasCoords, zoom, interactive, title, locationText, enablePinSelection, onPinSelect]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Safe external navigation links
  const googleMapsUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationText || 'Bengaluru')}`;

  const osmUrl = hasCoords
    ? `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`
    : `https://www.openstreetmap.org/search?query=${encodeURIComponent(locationText || 'Bengaluru')}`;

  // If no coordinates are available and pin selection is not enabled, show clear fallback view
  if (!hasCoords && !enablePinSelection) {
    return (
      <div
        className={`w-full ${heightClass} rounded-lg overflow-hidden border border-[#cbd5e1] bg-gradient-to-br from-[#eff4ff] to-[#e0ecff] flex flex-col items-center justify-center p-4 relative text-center`}
      >
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(#0051d5 1px, transparent 1px)`,
            backgroundSize: '16px 16px',
          }}
        />

        <div className="w-10 h-10 rounded-full bg-white shadow-xs border border-[#cbd5e1] flex items-center justify-center text-[#76777d] mb-2 z-10">
          <span className="material-symbols-outlined text-[22px]">location_off</span>
        </div>

        <h4 className="text-xs font-bold text-[#0b1c30] z-10">
          GPS Coordinates Not Available
        </h4>

        <p className="text-[11px] text-[#45464d] max-w-sm mt-0.5 line-clamp-2 z-10">
          {locationText ? `Reported Address: "${locationText}"` : 'Caller provided text address only. No browser GPS telemetry was acquired.'}
        </p>

        {locationText && showNavigationLink && (
          <div className="mt-3 flex items-center gap-2 z-10">
            <a
              href={osmUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white text-[11px] font-semibold text-[#0051d5] border border-[#cbd5e1] hover:bg-[#eff4ff] transition-colors shadow-2xs"
            >
              <span className="material-symbols-outlined text-[14px]">map</span>
              <span>Search OpenStreetMap</span>
            </a>
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0051d5] text-[11px] font-semibold text-white hover:bg-[#003ea8] transition-colors shadow-2xs"
            >
              <span className="material-symbols-outlined text-[14px]">directions</span>
              <span>Search Maps</span>
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-lg overflow-hidden border border-[#cbd5e1] shadow-xs">
      {/* Map container */}
      <div ref={mapContainerRef} className={`w-full ${heightClass} bg-[#e5eeff] z-0`} />

      {/* Floating telemetry badge */}
      {hasCoords && (
        <div className="absolute top-2 left-2 z-[400] bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-md text-[#0b1c30] text-[10px] font-mono shadow-xs border border-[#e2e8f0] flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#ba1a1a] animate-ping" />
          <span>
            {latitude!.toFixed(4)}°N, {longitude!.toFixed(4)}°E
          </span>
          {accuracyMeters && (
            <span className="text-[#64748b] border-l border-[#cbd5e1] pl-1.5">
              ±{Math.round(accuracyMeters)}m
            </span>
          )}
        </div>
      )}

      {/* Navigation action overlay */}
      {hasCoords && showNavigationLink && (
        <div className="absolute bottom-2 right-2 z-[400] flex items-center gap-1.5">
          <a
            href={osmUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="View on OpenStreetMap"
            className="px-2 py-1 bg-white/95 backdrop-blur-xs text-[10px] font-semibold text-[#0b1c30] hover:text-[#0051d5] rounded shadow-xs border border-[#e2e8f0] transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[13px]">travel_explore</span>
            <span>OSM</span>
          </a>
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open Turn-by-Turn Navigation"
            className="px-2.5 py-1 bg-[#ba1a1a] hover:bg-[#93000a] text-white text-[10px] font-semibold rounded shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[13px]">directions</span>
            <span>Navigate</span>
          </a>
        </div>
      )}
    </div>
  );
};
