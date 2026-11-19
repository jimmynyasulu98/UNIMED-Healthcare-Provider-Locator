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

export type ProvidersResponse = {
  count: number;
  providers: Provider[];
};