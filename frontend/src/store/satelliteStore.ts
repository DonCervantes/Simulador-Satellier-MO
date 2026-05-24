import { create } from 'zustand';
import type { Satellite, Vec3 } from '../domain/astrodynamics/types';
import { pqwToEciMatrix } from '../domain/astrodynamics/FrameConverter';
import { meanMotion } from '../domain/astrodynamics/TwoBodyProblem';
import { MU_EARTH, TAU } from '../domain/astrodynamics/constants';

interface SatellitePosition {
  r: Vec3;
  v?: Vec3;
}

interface SatelliteStore {
  catalog:         Satellite[];
  positions:       Map<number, SatellitePosition>;
  selectedId:      number | null;
  isLoading:       boolean;
  loadCatalog:     (url: string) => Promise<void>;
  setPositions:    (positions: Map<number, SatellitePosition>) => void;
  setSelectedId:   (id: number | null) => void;
  getSatellite:    (id: number) => Satellite | undefined;
}

export const useSatelliteStore = create<SatelliteStore>((set, get) => ({
  catalog:    [],
  positions:  new Map(),
  selectedId: null,
  isLoading:  false,

  loadCatalog: async (url: string) => {
    set({ isLoading: true });
    try {
      const res  = await fetch(url);
      const raw  = await res.json() as Record<string, unknown>[];

      // Normalize and precompute rotation matrices
      // Handles both the legacy ETL format (longitudeOfAscendingNode = Ω-ω bug)
      // and the new corrected format (raan stored separately)
      const catalog: Satellite[] = raw.map((s) => {
        const omega  = Number(s.argumentOfPerigee ?? s.argPerigee ?? 0);
        // Legacy ETL bug: longitudeOfAscendingNode = Ω - ω  → recover Ω
        const raanRaw = Number(
          s.raan ?? (Number(s.longitudeOfAscendingNode ?? 0) + omega)
        );
        const a      = Number(s.semiMajorAxis);
        const e      = Number(s.eccentricity);
        const i      = Number(s.inclination);
        const n_rev  = Number(s.meanMotion ?? 0);
        // mean motion: if stored in rev/day, convert to rad/s
        const nRadS  = n_rev > 0
          ? n_rev * TAU / 86400
          : meanMotion(a, MU_EARTH);

        const Q = pqwToEciMatrix(raanRaw, i, omega);

        return {
          noradId:       Number(s.satelliteNumber ?? s.noradId ?? 0),
          name:          String(s.name ?? ''),
          epoch:         Number(s.epoch ?? 0),
          meanMotion:    n_rev,
          eccentricity:  e,
          inclination:   i,
          raan:          raanRaw,
          argPerigee:    omega,
          meanAnomaly:   Number(s.meanAnomaly ?? 0),
          bstar:         Number(s.bstar ?? 0),
          semiMajorAxis: a,
          _r11: Q[0], _r12: Q[1],
          _r21: Q[3], _r22: Q[4],
          _r31: Q[6], _r32: Q[7],
          _nRadS: nRadS,
        };
      });

      set({ catalog, isLoading: false });
    } catch (err) {
      console.error('Failed to load satellite catalog', err);
      set({ isLoading: false });
    }
  },

  setPositions: (positions) => set({ positions }),
  setSelectedId: (id) => set({ selectedId: id }),
  getSatellite: (id) => get().catalog.find((s) => s.noradId === id),
}));
