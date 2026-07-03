declare namespace google.maps {
  class Map {
    constructor(el: HTMLElement, opts: Record<string, unknown>);
    addListener(event: string, handler: (e: MapMouseEvent) => void): void;
    setCenter(latLng: { lat: number; lng: number }): void;
  }
  class Marker {
    constructor(opts: Record<string, unknown>);
    setMap(map: Map | null): void;
    getPosition(): { lat(): number; lng(): number } | null;
    addListener(event: string, handler: () => void): void;
  }
  class Circle {
    constructor(opts: Record<string, unknown>);
    setMap(map: Map | null): void;
  }
  interface MapMouseEvent {
    latLng: { lat(): number; lng(): number } | null;
  }
}

declare const google: { maps: typeof google.maps };
