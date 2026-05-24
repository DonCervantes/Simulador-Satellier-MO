import { apiClient } from './client';

export interface SatelliteDTO {
  norad_id: number;
  name: string;
  epoch: number;
  mean_motion: number;
  eccentricity: number;
  inclination: number;
  raan: number;
  arg_perigee: number;
  mean_anomaly: number;
  bstar: number;
  semi_major_axis: number;
  orbit_type?: string;
}

export interface SatelliteListParams {
  page?: number;
  limit?: number;
  orbit_type?: string;
}

export async function listSatellites(params: SatelliteListParams = {}): Promise<SatelliteDTO[]> {
  const { data } = await apiClient.get<SatelliteDTO[]>('/satellites', { params });
  return data;
}

export async function getSatellite(noradId: number): Promise<SatelliteDTO> {
  const { data } = await apiClient.get<SatelliteDTO>(`/satellites/${noradId}`);
  return data;
}

export async function searchSatellites(query: string, limit = 50): Promise<SatelliteDTO[]> {
  const { data } = await apiClient.post<SatelliteDTO[]>('/satellites/search', { query, limit });
  return data;
}
