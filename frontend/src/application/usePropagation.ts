/**
 * Real-time satellite propagation hook.
 *
 * Primary path  : WASM batch Kepler — propagates all 8,247 satellites in ~2 ms/frame.
 * Fallback path : Pure-JS Kepler   — used while WASM is loading or if it fails.
 *
 * Satellite data is packed into a Float64Array once when the catalog loads,
 * then reused every frame (no per-frame allocation).
 */

import { useEffect, useRef } from 'react';
import { useSatelliteStore }  from '../store/satelliteStore';
import { useSimulationStore } from '../store/simulationStore';
import { solveKeplerElliptic, eccentricToTrue } from '../domain/astrodynamics/KeplerSolver';
import { TAU } from '../domain/astrodynamics/constants';
import { isWasmAvailable, packSatData, batchPropagateWasm } from '../infrastructure/wasm/keplerWasm';
import type { Vec3 } from '../domain/astrodynamics/types';

// ── JS fallback: propagate all satellites for one frame ────────────────────
function propagateAllKeplerian(
  catalog: ReturnType<typeof useSatelliteStore.getState>['catalog'],
  simTimeUnix: number,
): Map<number, { r: Vec3 }> {
  const positions = new Map<number, { r: Vec3 }>();

  for (const sat of catalog) {
    const { noradId, epoch, meanAnomaly, _nRadS, eccentricity, semiMajorAxis,
            _r11, _r12, _r21, _r22, _r31, _r32 } = sat;

    if (!_nRadS || !_r11) continue;

    const dt   = simTimeUnix - epoch;
    const M    = ((meanAnomaly + _nRadS * dt) % TAU + TAU) % TAU;
    const E    = solveKeplerElliptic(M, eccentricity);
    const nu   = eccentricToTrue(E, eccentricity);
    const p    = semiMajorAxis * (1 - eccentricity * eccentricity);
    const rMag = p / (1 + eccentricity * Math.cos(nu));
    const xOrb = rMag * Math.cos(nu);
    const yOrb = rMag * Math.sin(nu);

    positions.set(noradId, {
      r: {
        x: _r11! * xOrb + _r12! * yOrb,
        y: _r21! * xOrb + _r22! * yOrb,
        z: _r31! * xOrb + _r32! * yOrb,
      },
    });
  }

  return positions;
}

// ── Hook ────────────────────────────────────────────────────────────────────
export function usePropagation() {
  const rafRef        = useRef<number>(0);
  const lastWall      = useRef<number>(performance.now());

  // Cached packed satellite data — repacked only when the catalog changes.
  const satDataRef    = useRef<Float64Array | null>(null);
  const catalogLenRef = useRef<number>(0);

  useEffect(() => {
    function frame() {
      const now    = performance.now();
      const wallDt = (now - lastWall.current) / 1000;
      lastWall.current = now;

      const { simTimeUnix, speedMultiplier, paused, setSimTime } =
        useSimulationStore.getState();
      const { catalog, setPositions } = useSatelliteStore.getState();

      const newSimTime = paused ? simTimeUnix : simTimeUnix + wallDt * speedMultiplier;
      if (!paused) setSimTime(newSimTime);

      if (catalog.length === 0) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      // Re-pack only when catalog size changes (catalog loads once at startup)
      if (catalog.length !== catalogLenRef.current) {
        satDataRef.current    = packSatData(catalog);
        catalogLenRef.current = catalog.length;
      }

      let positions: Map<number, { r: Vec3 }>;

      if (isWasmAvailable() && satDataRef.current) {
        // ── WASM batch path (~2 ms for 8,247 sats) ──────────────────────
        const raw = batchPropagateWasm(satDataRef.current, newSimTime, catalog.length);
        if (raw) {
          positions = new Map();
          for (let i = 0; i < catalog.length; i++) {
            positions.set(catalog[i].noradId, {
              r: {
                x: raw[i * 3]!,
                y: raw[i * 3 + 1]!,
                z: raw[i * 3 + 2]!,
              },
            });
          }
        } else {
          // WASM returned null — shouldn't happen, but fall back to JS
          positions = propagateAllKeplerian(catalog, newSimTime);
        }
      } else {
        // ── JS fallback path (~8 ms for 8,247 sats) ─────────────────────
        positions = propagateAllKeplerian(catalog, newSimTime);
      }

      setPositions(positions);
      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);
}
