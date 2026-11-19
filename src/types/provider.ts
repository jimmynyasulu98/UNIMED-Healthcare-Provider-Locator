export type Provider = {
  id: string;
  name: string;
  category: string | null;
  district: string;
  address: string | null;
  phone: string | null;
  latitude: number;
  longitude: number;
  services: string[];
};

export type NearbyProvider = Provider & {
  distance_km: number;
};

export type RoadRouteStatus =
  | "reachable"
  | "unreachable"
  | "snap-too-far";

export type RoadProvider = Provider & {
  route_status: RoadRouteStatus;
  road_distance_km: number | null;
  origin_snap_distance_m: number | null;
  provider_snap_distance_m: number | null;
};

export type SearchMode = "straight-line" | "road";

export type SearchOrigin = {
  latitude: number;
  longitude: number;
};

type AppliedProviderSearchBase = {
  origin: SearchOrigin;
  service_id: string | null;
  category: string | null;
};

export type AppliedProviderSearch =
  | (AppliedProviderSearchBase & {
      mode: "straight-line";
      radius_km: number;
    })
  | (AppliedProviderSearchBase & {
      mode: "road";
      max_road_distance_km: number | null;
    });

export type ServiceOption = {
  id: string;
  name: string;
};

export type ProvidersResponse = {
  count: number;
  providers: Provider[];
};

export type NearbyProvidersResponse = {
  count: number;
  origin: SearchOrigin;
  radius_km: number;
  distance_type: "straight-line";
  providers: NearbyProvider[];
};

export type RoadProvidersResponse = {
  count: number;
  reachable_count: number;
  origin: SearchOrigin;
  max_road_distance_km: number | null;
  distance_type: "road";
  snap_distance_limit_m: number;
  providers: RoadProvider[];
};

export type RoadRouteGeometry = {
  type: "LineString";
  coordinates: [number, number][];
};

export type RoadRouteResponse = {
  provider_id: string;
  route_status: "reachable";
  road_distance_km: number;
  origin_snap_distance_m: number;
  provider_snap_distance_m: number;
  snap_distance_limit_m: number;
  geometry: RoadRouteGeometry;
};

export type ServicesResponse = {
  count: number;
  services: ServiceOption[];
};

export type ApiErrorResponse = {
  error: string;
  code?: string;
  details?: string[];
};
