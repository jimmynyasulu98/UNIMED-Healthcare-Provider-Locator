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

export type SearchOrigin = {
  latitude: number;
  longitude: number;
};

export type AppliedProviderSearch = {
  origin: SearchOrigin;
  radius_km: number;
  service_id: string | null;
  category: string | null;
};

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

export type ServicesResponse = {
  count: number;
  services: ServiceOption[];
};

export type ApiErrorResponse = {
  error: string;
  details?: string[];
};
