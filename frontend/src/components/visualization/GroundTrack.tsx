/**
 * GroundTrack — 2D equirectangular (Mercator) ground track panel.
 *
 * Shows the sub-satellite track over the next 2 orbital periods for the
 * selected satellite. Earth rotates underneath while the satellite moves,
 * so successive passes shift westward by ~23° for typical LEO.
 *
 * Algorithm:
 *   1. Step time from t_now in increments of T/200 (200 points per orbit)
 *   2. For each step: solve Kepler (M→E→ν), compute ECI position
 *   3. Convert ECI → ECEF → geodetic using GMST (FrameConverter)
 *   4. Plot (lon, lat) on a canvas using equirectangular projection
 *
 * Anti-meridian handling: when |Δlon| > 180° between consecutive points,
 * the path is broken to avoid a horizontal line crossing the whole canvas.
 */

import { useEffect, useRef } from 'react';
import { useSatelliteStore }  from '../../store/satelliteStore';
import { useSimulationStore } from '../../store/simulationStore';
import { eciToGeodetic }      from '../../domain/astrodynamics/FrameConverter';
import { solveKeplerElliptic, eccentricToTrue } from '../../domain/astrodynamics/KeplerSolver';
import { orbitalPeriod }      from '../../domain/astrodynamics/TwoBodyProblem';
import { TAU }                from '../../domain/astrodynamics/constants';

// ── Canvas dimensions ─────────────────────────────────────────────────────────
const CW = 340;  // canvas width  px
const CH = 170;  // canvas height px (2:1 → correct for equirectangular)

// ── Projection helpers ────────────────────────────────────────────────────────
/** Longitude [-180,180] → canvas x */
const lonToX = (lon: number) => ((lon + 180) / 360) * CW;
/** Latitude  [-90, 90]  → canvas y */
const latToY = (lat: number) => ((90 - lat) / 180) * CH;

// ── Draw function ─────────────────────────────────────────────────────────────
function drawGraticule(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, CW, CH);

  // Background
  ctx.fillStyle = '#040b16';
  ctx.fillRect(0, 0, CW, CH);

  // 30° grid
  ctx.strokeStyle = '#1e2d4a';
  ctx.lineWidth = 0.5;
  for (let lon = -180; lon <= 180; lon += 30) {
    ctx.beginPath();
    ctx.moveTo(lonToX(lon), 0);
    ctx.lineTo(lonToX(lon), CH);
    ctx.stroke();
  }
  for (let lat = -90; lat <= 90; lat += 30) {
    ctx.beginPath();
    ctx.moveTo(0, latToY(lat));
    ctx.lineTo(CW, latToY(lat));
    ctx.stroke();
  }

  // Equator (highlighted)
  ctx.strokeStyle = '#2a3d5a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, latToY(0));
  ctx.lineTo(CW, latToY(0));
  ctx.stroke();

  // Tropics (Cancer + Capricorn ≈ ±23.44°)
  ctx.strokeStyle = '#1e2d4a88';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([3, 4]);
  for (const lat of [23.44, -23.44]) {
    ctx.beginPath();
    ctx.moveTo(0, latToY(lat));
    ctx.lineTo(CW, latToY(lat));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Lat/lon labels
  ctx.fillStyle = '#2a4060';
  ctx.font = '8px monospace';
  ctx.textAlign = 'left';
  for (let lat = -60; lat <= 60; lat += 30) {
    if (lat === 0) continue;
    ctx.fillText(`${lat > 0 ? '+' : ''}${lat}°`, 2, latToY(lat) - 1);
  }
  ctx.textAlign = 'center';
  for (let lon = -150; lon <= 150; lon += 60) {
    ctx.fillText(`${lon}°`, lonToX(lon), CH - 2);
  }
}

function drawTrack(
  ctx: CanvasRenderingContext2D,
  points: { lat: number; lon: number }[],
  _simTimeUnix: number,
  currentLat: number,
  currentLon: number,
) {
  if (points.length < 2) return;

  // Draw the track in segments (break at anti-meridian)
  for (let orbit = 0; orbit < 2; orbit++) {
    const start = orbit * Math.floor(points.length / 2);
    const end   = (orbit + 1) * Math.floor(points.length / 2);
    const seg   = points.slice(start, end);

    // Gradient: first orbit = brighter, second orbit = dimmer
    ctx.strokeStyle = orbit === 0 ? '#00d4ff88' : '#00d4ff33';
    ctx.lineWidth   = orbit === 0 ? 1.5 : 1;

    ctx.beginPath();
    let penUp = true;
    let prevLon = seg[0]?.lon ?? 0;

    for (const p of seg) {
      const x = lonToX(p.lon);
      const y = latToY(p.lat);

      // Break line at anti-meridian crossing (|Δlon| > 150°)
      if (!penUp && Math.abs(p.lon - prevLon) > 150) {
        ctx.stroke();
        ctx.beginPath();
        penUp = true;
      }
      if (penUp) { ctx.moveTo(x, y); penUp = false; }
      else        { ctx.lineTo(x, y); }
      prevLon = p.lon;
    }
    ctx.stroke();
  }

  // Equatorial crossing dots (ascending)
  ctx.fillStyle = '#00d4ff44';
  for (let k = 1; k < points.length - 1; k++) {
    const p = points[k];
    const prev = points[k - 1];
    if (prev.lat < 0 && p.lat >= 0) {
      ctx.beginPath();
      ctx.arc(lonToX(p.lon), latToY(p.lat), 2, 0, TAU);
      ctx.fill();
    }
  }

  // Current position
  const cx = lonToX(currentLon);
  const cy = latToY(currentLat);

  // Halo
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, TAU);
  ctx.fillStyle = '#ffff0022';
  ctx.fill();

  // Dot
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, TAU);
  ctx.fillStyle = '#ffff00';
  ctx.fill();

  // Sub-satellite label
  ctx.fillStyle = '#ffff00cc';
  ctx.font = '8px monospace';
  ctx.textAlign = cx > CW - 60 ? 'right' : 'left';
  const latStr = `${currentLat >= 0 ? '+' : ''}${currentLat.toFixed(1)}°`;
  const lonStr = `${currentLon >= 0 ? '+' : ''}${currentLon.toFixed(1)}°`;
  ctx.fillText(`${latStr} ${lonStr}`, cx + (cx > CW - 60 ? -6 : 6), cy - 5);
}

// ── Component ─────────────────────────────────────────────────────────────────
export function GroundTrack() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { catalog, selectedId, positions } = useSatelliteStore();
  const { simTimeUnix } = useSimulationStore();

  const sat = catalog.find(s => s.noradId === selectedId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawGraticule(ctx);

    if (!sat?._r11) return;

    const { semiMajorAxis: a, eccentricity: e, _nRadS,
            meanAnomaly: M0, epoch,
            _r11, _r12, _r21, _r22, _r31, _r32 } = sat;

    const T       = orbitalPeriod(a);   // orbital period, seconds
    const nOrbits = 2;
    const nPts    = 200 * nOrbits;

    // Compute ground track points
    const pts: { lat: number; lon: number }[] = [];
    for (let k = 0; k <= nPts; k++) {
      const t  = simTimeUnix + (k / nPts) * nOrbits * T;
      const dt = t - epoch;
      const M  = (((M0 ?? 0) + _nRadS! * dt) % TAU + TAU) % TAU;
      const E  = solveKeplerElliptic(M, e);
      const nu = eccentricToTrue(E, e);

      const p    = a * (1 - e * e);
      const rMag = p / (1 + e * Math.cos(nu));
      const xOrb = rMag * Math.cos(nu);
      const yOrb = rMag * Math.sin(nu);

      const eci = {
        x: _r11! * xOrb + _r12! * yOrb,
        y: _r21! * xOrb + _r22! * yOrb,
        z: _r31! * xOrb + _r32! * yOrb,
      };

      const geo = eciToGeodetic(eci, t);
      pts.push({ lat: geo.lat, lon: geo.lon });
    }

    // Current geodetic position (from live propagation if available)
    const livePos = positions.get(selectedId!);
    let curLat = 0, curLon = 0;
    if (livePos) {
      const geo = eciToGeodetic(livePos.r, simTimeUnix);
      curLat = geo.lat;
      curLon = geo.lon;
    } else if (pts[0]) {
      curLat = pts[0].lat;
      curLon = pts[0].lon;
    }

    drawTrack(ctx, pts, simTimeUnix, curLat, curLon);

  }, [sat, simTimeUnix, positions, selectedId]);

  return (
    <div className="panel">
      <div className="panel-header">
        <strong>Ground Track</strong>
        {sat && <span className="panel-badge">{sat.name}</span>}
      </div>

      {!sat ? (
        <p className="panel-empty">Select a satellite to see its ground track.</p>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            width={CW}
            height={CH}
            style={{ display: 'block', width: '100%', borderRadius: 4,
                     border: '1px solid #1e2d4a' }}
          />
          <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 9, color: '#667' }}>
            <span><span style={{ color: '#00d4ff88' }}>━</span> Orbit 1</span>
            <span><span style={{ color: '#00d4ff33' }}>━</span> Orbit 2</span>
            <span><span style={{ color: '#ffff00' }}>●</span> Current pos</span>
            <span><span style={{ color: '#00d4ff44' }}>●</span> Asc. crossing</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: '#7a9ab8' }}>
            Showing 2 orbits forward · {Math.round(orbitalPeriod(sat.semiMajorAxis) / 60)} min/orbit
          </div>
        </>
      )}
    </div>
  );
}
