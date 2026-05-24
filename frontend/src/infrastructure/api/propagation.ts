import { apiClient } from './client';

export type PropagatorType = 'kepler' | 'j2' | 'j2_drag' | 'full';

export interface PropagationRequest {
  norad_id: number;
  start_iso: string;           // ISO 8601
  duration_s: number;
  step_s: number;
  propagator: PropagatorType;
  ballistic_coeff_kg_m2?: number;
}

export interface EphemerisPoint {
  t: number;
  r: [number, number, number]; // ECI km
  v: [number, number, number]; // ECI km/s
}

export interface COEPoint {
  t: number;
  a: number;
  e: number;
  i: number;
  raan: number;
  omega: number;
  nu: number;
}

export interface GroundTrackPoint {
  t: number;
  lat: number;
  lon: number;
  alt: number;
}

export interface PropagationResponse {
  norad_id: number;
  propagator: PropagatorType;
  ephemeris: EphemerisPoint[];
  ground_track: GroundTrackPoint[];
  coe_history: COEPoint[];
}

export async function propagate(req: PropagationRequest): Promise<PropagationResponse> {
  const { data } = await apiClient.post<PropagationResponse>('/propagate', req);
  return data;
}
