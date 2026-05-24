/**
 * Mission Designer store — Phase 5 (extended).
 *
 * Manages the 4-step mission wizard state and computed results.
 * New in this version:
 *   - planeDelta_deg: optional inclination change (combined maneuver at r2)
 *   - dvPlane_km_s:   Δv component attributed to the plane change
 *   - SavedMission:   persisted to localStorage, load/save/delete
 *
 * All physics computed client-side using the existing domain functions.
 */

import { create } from 'zustand';
import {
  hohmannTransfer,
  biEllipticTransfer,
  combinedManeuver,
  tsiolkovskyMassRatio,
  propellantFraction,
} from '../domain/astrodynamics/Maneuvers';
import { visViva, circularSpeed } from '../domain/astrodynamics/TwoBodyProblem';
import { R_EARTH, MU_EARTH } from '../domain/astrodynamics/constants';

// ── Types ─────────────────────────────────────────────────────────────────────

export type MissionType = 'cubesat_leo' | 'iss_rendezvous' | 'geo_comms' | 'custom';

export interface MissionParams {
  name:            string;
  type:            MissionType;
  // Spacecraft
  mass_kg:         number;
  isp_s:           number;
  dvBudget_km_s:   number;
  // Orbit
  altInitial_km:   number;
  altTarget_km:    number;
  inclination_deg: number;
  // Optional plane change (0 = none)
  planeDelta_deg:  number;
}

export interface MissionResult {
  // Maneuver burns
  dv1_km_s:         number;   // first burn
  dv2_km_s:         number;   // second burn (combined with plane change when planeDelta_deg > 0)
  dvPlane_km_s:     number;   // plane change component of dv2 (0 when no plane change)
  dvTotal_km_s:     number;
  tof_s:            number;
  // Propellant (Tsiolkovsky)
  massRatio:        number;
  propFraction:     number;
  propMass_kg:      number;
  dvRemaining_km_s: number;
  sufficient:       boolean;
  // Transfer orbit geometry
  r1_km:            number;
  r2_km:            number;
  aTransfer_km:     number;
  eTransfer:        number;
  maneuverType:     'hohmann' | 'bielliptic';
}

export interface SavedMission {
  id:      string;
  savedAt: number;        // Unix ms
  params:  MissionParams;
  result:  MissionResult | null;
}

// ── Preset scenarios ──────────────────────────────────────────────────────────

export const PRESETS: Record<MissionType, MissionParams> = {
  cubesat_leo: {
    name:            'CubeSat-1 LEO Observacion',
    type:            'cubesat_leo',
    mass_kg:         3.2,
    isp_s:           220,
    dvBudget_km_s:   0.5,
    altInitial_km:   400,
    altTarget_km:    550,
    inclination_deg: 51.6,
    planeDelta_deg:  0,
  },
  iss_rendezvous: {
    name:            'Mision Suministro ISS',
    type:            'iss_rendezvous',
    mass_kg:         450,
    isp_s:           300,
    dvBudget_km_s:   0.3,
    altInitial_km:   390,
    altTarget_km:    417,
    inclination_deg: 51.6,
    planeDelta_deg:  0,
  },
  geo_comms: {
    name:            'Satelite Telecomunicaciones GEO',
    type:            'geo_comms',
    mass_kg:         3000,
    isp_s:           450,
    dvBudget_km_s:   4.5,
    altInitial_km:   300,
    altTarget_km:    35786,
    inclination_deg: 0,
    planeDelta_deg:  0,
  },
  custom: {
    name:            'Mi Mision',
    type:            'custom',
    mass_kg:         100,
    isp_s:           300,
    dvBudget_km_s:   1.0,
    altInitial_km:   400,
    altTarget_km:    800,
    inclination_deg: 28,
    planeDelta_deg:  0,
  },
};

// ── Local-storage helpers ─────────────────────────────────────────────────────

const LS_KEY = 'satellier_saved_missions';

function loadFromStorage(): SavedMission[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as SavedMission[]) : [];
  } catch {
    return [];
  }
}

function saveToStorage(missions: SavedMission[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(missions));
  } catch { /* storage quota exceeded */ }
}

// ── Computation ───────────────────────────────────────────────────────────────

export function computeResult(params: MissionParams): MissionResult {
  const r1 = R_EARTH + params.altInitial_km;
  const r2 = R_EARTH + params.altTarget_km;

  const ratio      = r2 / r1;
  const useHohmann = ratio <= 11.94;
  const maneuverType: 'hohmann' | 'bielliptic' = useHohmann ? 'hohmann' : 'bielliptic';

  let dv1: number, dv2Raw: number, tof: number;
  let aTransfer: number, eTransfer: number;
  let vApo: number;  // velocity at r2 on the transfer ellipse (for combined burn)

  if (useHohmann) {
    const h   = hohmannTransfer(r1, r2);
    dv1       = h.dv1;
    dv2Raw    = h.dv2;
    tof       = h.tof;
    aTransfer = h.aTransfer;
    eTransfer = h.eTransfer;
    vApo      = visViva(r2, h.aTransfer, MU_EARTH);
  } else {
    const rb  = r2 * 3;
    const b   = biEllipticTransfer(r1, rb, r2);
    dv1       = b.dv1;
    dv2Raw    = b.dv2 + b.dv3;
    tof       = b.tof;
    aTransfer = (r1 + rb) / 2;
    eTransfer = (rb - r1) / (rb + r1);
    vApo      = visViva(r2, b.a2Transfer, MU_EARTH);
  }

  // ── Plane change combined with second burn at r2 ──────────────────────────
  let dv2Final: number;
  let dvPlane:  number;

  if (params.planeDelta_deg !== 0) {
    const di         = Math.abs(params.planeDelta_deg) * Math.PI / 180;
    const vCirc2     = circularSpeed(r2, MU_EARTH);
    const dvCombined = combinedManeuver(Math.abs(vApo), vCirc2, di);
    dv2Final = dvCombined;
    dvPlane  = dvCombined - Math.abs(dv2Raw);   // incremental cost of the plane change
  } else {
    dv2Final = dv2Raw;
    dvPlane  = 0;
  }

  const dvTotal     = Math.abs(dv1) + Math.abs(dv2Final);
  const massRatio   = tsiolkovskyMassRatio(dvTotal, params.isp_s);
  const propFrac    = propellantFraction(dvTotal, params.isp_s);
  const propMass    = propFrac * params.mass_kg;
  const dvRemaining = params.dvBudget_km_s - dvTotal;

  return {
    dv1_km_s:         dv1,
    dv2_km_s:         dv2Final,
    dvPlane_km_s:     dvPlane,
    dvTotal_km_s:     dvTotal,
    tof_s:            tof,
    massRatio,
    propFraction:     propFrac,
    propMass_kg:      propMass,
    dvRemaining_km_s: dvRemaining,
    sufficient:       dvRemaining >= 0,
    r1_km:            r1,
    r2_km:            r2,
    aTransfer_km:     aTransfer,
    eTransfer,
    maneuverType,
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface MissionStore {
  isOpen:        boolean;
  step:          1 | 2 | 3 | 4;
  params:        MissionParams;
  result:        MissionResult | null;
  showOnGlobe:   boolean;
  savedMissions: SavedMission[];

  open:              ()                          => void;
  close:             ()                          => void;
  nextStep:          ()                          => void;
  prevStep:          ()                          => void;
  updateParams:      (p: Partial<MissionParams>) => void;
  applyPreset:       (type: MissionType)         => void;
  computeAndAdvance: ()                          => void;
  setShowOnGlobe:    (show: boolean)             => void;
  reset:             ()                          => void;

  saveMission:   ()           => void;
  loadMission:   (id: string) => void;
  deleteMission: (id: string) => void;
}

export const useMissionStore = create<MissionStore>((set, get) => ({
  isOpen:        false,
  step:          1,
  params:        PRESETS.cubesat_leo,
  result:        null,
  showOnGlobe:   false,
  savedMissions: loadFromStorage(),

  open:  () => set({ isOpen: true, step: 1 }),
  close: () => set({ isOpen: false }),

  nextStep: () => set(s => ({ step: Math.min(s.step + 1, 4) as 1|2|3|4 })),
  prevStep: () => set(s => ({ step: Math.max(s.step - 1, 1) as 1|2|3|4 })),

  updateParams: (partial) =>
    set(s => ({ params: { ...s.params, ...partial } })),

  applyPreset: (type) =>
    set({ params: { ...PRESETS[type] }, result: null }),

  computeAndAdvance: () => {
    const result = computeResult(get().params);
    set({ result, step: 4 });
  },

  setShowOnGlobe: (show) => set({ showOnGlobe: show }),

  reset: () => set({
    isOpen: false, step: 1,
    params: PRESETS.cubesat_leo,
    result: null, showOnGlobe: false,
  }),

  // ── Persistence ────────────────────────────────────────────────────────────
  saveMission: () => {
    const { params, result, savedMissions } = get();
    const entry: SavedMission = {
      id:      Date.now().toString(36),
      savedAt: Date.now(),
      params:  { ...params },
      result:  result ? { ...result } : null,
    };
    const updated = [entry, ...savedMissions].slice(0, 20);
    saveToStorage(updated);
    set({ savedMissions: updated });
  },

  loadMission: (id) => {
    const entry = get().savedMissions.find(m => m.id === id);
    if (!entry) return;
    set({
      params: { ...entry.params },
      result: entry.result ? { ...entry.result } : null,
      step:   entry.result ? 4 : 1,
      isOpen: true,
    });
  },

  deleteMission: (id) => {
    const updated = get().savedMissions.filter(m => m.id !== id);
    saveToStorage(updated);
    set({ savedMissions: updated });
  },
}));
