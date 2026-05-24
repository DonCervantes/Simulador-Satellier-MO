import { apiClient } from './client';

export interface HohmannRequest {
  r1_km: number;
  r2_km: number;
}

export interface HohmannResponse {
  dv1_km_s: number;
  dv2_km_s: number;
  dv_total_km_s: number;
  tof_s: number;
  tof_h: number;
  a_transfer_km: number;
}

export interface BiEllipticRequest {
  r1_km: number;
  rb_km: number;
  r2_km: number;
}

export interface BiEllipticResponse {
  dv1_km_s: number;
  dv2_km_s: number;
  dv3_km_s: number;
  dv_total_km_s: number;
  tof_s: number;
  tof_h: number;
  is_efficient: boolean;
}

export interface PlaneChangeRequest {
  v_km_s: number;
  delta_i_deg: number;
}

export interface PlaneChangeResponse {
  dv_km_s: number;
}

export async function calcHohmann(req: HohmannRequest): Promise<HohmannResponse> {
  const { data } = await apiClient.post<HohmannResponse>('/maneuvers/hohmann', req);
  return data;
}

export async function calcBiElliptic(req: BiEllipticRequest): Promise<BiEllipticResponse> {
  const { data } = await apiClient.post<BiEllipticResponse>('/maneuvers/bielliptic', req);
  return data;
}

export async function calcPlaneChange(req: PlaneChangeRequest): Promise<PlaneChangeResponse> {
  const { data } = await apiClient.post<PlaneChangeResponse>('/maneuvers/plane_change', req);
  return data;
}
