/**
 * Perturbation Physics Panel — Phase 4
 *
 * Three tabs:
 *   J2   — Secular RAAN/ω drift forecast over 30 days for the selected satellite
 *   Drag — Altitude decay simulator for a configurable spacecraft
 *   SSO  — Sun-synchronous inclination calculator
 *
 * All physics runs client-side using the existing domain functions.
 * For higher-fidelity results (RK45 + NRLMSISE-00) use POST /api/v1/propagate.
 */

import React, { useState, useMemo } from 'react';
import { useSatelliteStore }  from '../../store/satelliteStore';
import { useUiStore }         from '../../store/uiStore';
import { j2SecularRates }     from '../../domain/astrodynamics/Perturbations';
import { altitudeDecayRate, exponentialAtmDensity } from '../../domain/astrodynamics/Perturbations';
import { ssoInclination, orbitalPeriod } from '../../domain/astrodynamics/TwoBodyProblem';
import { RAD_TO_DEG, R_EARTH } from '../../domain/astrodynamics/constants';

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = 'j2' | 'drag' | 'sso';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = (n: number, d = 4) => isFinite(n) && !isNaN(n) ? n.toFixed(d) : '—';
const fmtE = (n: number) => isFinite(n) && !isNaN(n) ? n.toExponential(3) : '—';

// Simple SVG line chart for cumulative drift
function DriftChart({
  ratePerDay,      // °/day
  rateOmegaPerDay, // °/day
  days = 30,
}: { ratePerDay: number; rateOmegaPerDay: number; days?: number }) {
  const W = 258; const H = 72; const PAD = { l: 36, r: 4, t: 6, b: 22 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;

  const nPts = days + 1;
  const pts = Array.from({ length: nPts }, (_, d) => ({
    day:   d,
    raan:  ratePerDay * d,
    omega: rateOmegaPerDay * d,
  }));

  const allVals = pts.flatMap(p => [p.raan, p.omega]);
  const minV    = Math.min(...allVals, 0);
  const maxV    = Math.max(...allVals, 0);
  const span    = maxV - minV || 1;

  const toX = (d: number) => PAD.l + (d / days) * iW;
  const toY = (v: number) => PAD.t + iH - ((v - minV) / span) * iH;

  const raanPath  = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.day)},${toY(p.raan)}`).join(' ');
  const omegaPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.day)},${toY(p.omega)}`).join(' ');
  const zeroY     = toY(0);

  return (
    <svg width={W} height={H} style={{ display: 'block', marginTop: 6 }}>
      {/* Axes */}
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + iH} stroke="#1e2d4a" strokeWidth={1} />
      <line x1={PAD.l} y1={PAD.t + iH} x2={PAD.l + iW} y2={PAD.t + iH} stroke="#1e2d4a" strokeWidth={1} />
      {/* Zero line */}
      <line x1={PAD.l} y1={zeroY} x2={PAD.l + iW} y2={zeroY} stroke="#1e2d4a88" strokeWidth={1} strokeDasharray="3,3" />
      {/* Y label */}
      <text x={PAD.l - 4} y={PAD.t + iH / 2} textAnchor="end" fontSize={8} fill="#667" dominantBaseline="middle">°</text>
      {/* X ticks */}
      {[0, 7, 14, 21, 30].map(d => (
        <g key={d}>
          <line x1={toX(d)} y1={PAD.t + iH} x2={toX(d)} y2={PAD.t + iH + 3} stroke="#1e2d4a" strokeWidth={1} />
          <text x={toX(d)} y={H - 4} textAnchor="middle" fontSize={8} fill="#667">{d}d</text>
        </g>
      ))}
      {/* Y value labels */}
      <text x={PAD.l - 2} y={toY(minV)} textAnchor="end" fontSize={8} fill="#667" dominantBaseline="middle">{minV.toFixed(1)}</text>
      <text x={PAD.l - 2} y={toY(maxV)} textAnchor="end" fontSize={8} fill="#667" dominantBaseline="middle">{maxV.toFixed(1)}</text>
      {/* Lines */}
      <path d={raanPath}  fill="none" stroke="#00d4ff" strokeWidth={1.5} />
      <path d={omegaPath} fill="none" stroke="#4fc"    strokeWidth={1}   />
      {/* Legend */}
      <rect x={PAD.l + 4} y={PAD.t + 2} width={6} height={6} fill="#00d4ff" />
      <text x={PAD.l + 12} y={PAD.t + 8} fontSize={8} fill="#c8d8f0">dΩ</text>
      <rect x={PAD.l + 30} y={PAD.t + 2} width={6} height={6} fill="#4fc" />
      <text x={PAD.l + 38} y={PAD.t + 8} fontSize={8} fill="#c8d8f0">dω</text>
    </svg>
  );
}

// ── J2 Tab ────────────────────────────────────────────────────────────────────
function J2Tab() {
  const { catalog, selectedId } = useSatelliteStore();
  const { mode } = useUiStore();
  const sat = catalog.find(s => s.noradId === selectedId);

  if (!sat) return (
    <p className="panel-empty">Select a satellite to see J2 perturbations.</p>
  );

  const oe = { a: sat.semiMajorAxis, e: sat.eccentricity, i: sat.inclination,
               raan: sat.raan, omega: sat.argPerigee, nu: 0 };
  const rates      = j2SecularRates(oe);
  const dRaanDay   = rates.dRaan_radS  * 86_400 * RAD_TO_DEG;
  const dOmegaDay  = rates.dOmega_radS * 86_400 * RAD_TO_DEG;
  const period     = orbitalPeriod(sat.semiMajorAxis);

  const checkpoints = [1, 7, 14, 30];

  return (
    <div>
      {mode === 'educational' && (
        <p style={{ color: '#667', fontSize: 10, marginBottom: 6, lineHeight: 1.5 }}>
          J₂ is Earth's oblateness (equatorial bulge). It causes the orbital plane to
          precess (Ω drifts) and the periapsis to rotate (ω drifts). Vallado Eq. 9-40.
        </p>
      )}

      <h4 className="panel-section-title">Instantaneous Rates</h4>
      <div className="oe-row"><span className="oe-label">dΩ/dt (RAAN)</span>
        <span className="oe-value" style={{ color: '#00d4ff' }}>{fmt(dRaanDay, 5)} <span className="oe-unit">°/day</span></span></div>
      <div className="oe-row"><span className="oe-label">dω/dt (ArgPerig)</span>
        <span className="oe-value" style={{ color: '#4fc' }}>{fmt(dOmegaDay, 5)} <span className="oe-unit">°/day</span></span></div>
      <div className="oe-row"><span className="oe-label">Period</span>
        <span className="oe-value">{fmt(period / 60, 2)} <span className="oe-unit">min</span></span></div>

      <h4 className="panel-section-title">30-Day Drift Forecast</h4>
      <DriftChart ratePerDay={dRaanDay} rateOmegaPerDay={dOmegaDay} />

      <div style={{ marginTop: 6 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, fontSize: 10 }}>
          <span style={{ color: '#667' }}>Day</span>
          <span style={{ color: '#00d4ff' }}>ΔΩ (°)</span>
          <span style={{ color: '#4fc' }}>Δω (°)</span>
          {checkpoints.map(d => (
            <React.Fragment key={d}>
              <span style={{ color: '#a0b8d0' }}>{d}</span>
              <span style={{ color: '#00d4ff88' }}>{fmt(dRaanDay * d, 3)}</span>
              <span style={{ color: '#4fc8' }}>{fmt(dOmegaDay * d, 3)}</span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {mode === 'professional' && (
        <>
          <h4 className="panel-section-title">Raw Rates (rad/s)</h4>
          <div className="oe-row"><span className="oe-label">dΩ/dt</span>
            <span className="oe-value">{fmtE(rates.dRaan_radS)}</span></div>
          <div className="oe-row"><span className="oe-label">dω/dt</span>
            <span className="oe-value">{fmtE(rates.dOmega_radS)}</span></div>
          <div className="oe-row"><span className="oe-label">dM/dt</span>
            <span className="oe-value">{fmtE(rates.dM_radS)}</span></div>
        </>
      )}
    </div>
  );
}

// ── Drag Tab ──────────────────────────────────────────────────────────────────
function DragTab() {
  const { catalog, selectedId } = useSatelliteStore();
  const { mode } = useUiStore();
  const sat = catalog.find(s => s.noradId === selectedId);

  const defaultAlt = sat ? sat.semiMajorAxis - R_EARTH : 500;

  const [alt,  setAlt]  = useState(Math.round(defaultAlt));
  const [mass, setMass] = useState(1.3);     // kg — 1U CubeSat
  const [area, setArea] = useState(0.01);    // m²
  const [cd,   setCd]   = useState(2.2);

  const bcoeff = (cd * area) / mass;          // m²/kg

  const decay = useMemo(() => {
    // Simple Euler integration: step forward by 1 day at a time
    const steps = [0, 7, 30, 90, 180, 365];
    const results: { day: number; alt: number; decayRate: number }[] = [];
    let a_km  = R_EARTH + alt;
    let t_day = 0;

    for (const day of steps) {
      const dDays = day - t_day;
      // Substep in 0.5-day chunks for accuracy
      let a_step = a_km;
      const nChunks = Math.max(1, Math.round(dDays * 2));
      for (let k = 0; k < nChunks; k++) {
        const daSdt = altitudeDecayRate(a_step, bcoeff);  // km/s
        a_step = Math.max(a_step + daSdt * (dDays / nChunks) * 86_400, R_EARTH + 100);
        if (a_step <= R_EARTH + 100) break;
      }
      const h = a_step - R_EARTH;
      const rate_mday = altitudeDecayRate(a_step, bcoeff) * 86_400 * 1000; // m/day

      results.push({ day, alt: h, decayRate: -rate_mday });
      t_day  = day;
      a_km   = a_step;
      if (a_km <= R_EARTH + 100) break;
    }
    return results;
  }, [alt, bcoeff]);

  const rho = exponentialAtmDensity(alt);
  const decayRate_m_day = -altitudeDecayRate(R_EARTH + alt, bcoeff) * 86_400 * 1000;

  return (
    <div>
      {mode === 'educational' && (
        <p style={{ color: '#667', fontSize: 10, marginBottom: 6, lineHeight: 1.5 }}>
          Atmospheric drag removes orbital energy, causing the orbit to decay.
          The rate depends on atmospheric density, spacecraft size, and mass.
        </p>
      )}

      <h4 className="panel-section-title">Spacecraft Parameters</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 6 }}>
        <label style={{ fontSize: 10, color: '#7a9ab8' }}>Alt (km)
          <input type="number" value={alt}  onChange={e => setAlt(+e.target.value)}
                 style={{ width: '100%', marginTop: 2 }} />
        </label>
        <label style={{ fontSize: 10, color: '#7a9ab8' }}>Mass (kg)
          <input type="number" value={mass} onChange={e => setMass(+e.target.value)}
                 step="0.1" style={{ width: '100%', marginTop: 2 }} />
        </label>
        <label style={{ fontSize: 10, color: '#7a9ab8' }}>Area (m²)
          <input type="number" value={area} onChange={e => setArea(+e.target.value)}
                 step="0.001" style={{ width: '100%', marginTop: 2 }} />
        </label>
        <label style={{ fontSize: 10, color: '#7a9ab8' }}>C_D
          <input type="number" value={cd}   onChange={e => setCd(+e.target.value)}
                 step="0.1" style={{ width: '100%', marginTop: 2 }} />
        </label>
      </div>
      <button onClick={() => { setMass(1.3); setArea(0.01); setCd(2.2); }}
              style={{ fontSize: 9, padding: '2px 8px', marginBottom: 8,
                       background: '#00d4ff11', border: '1px solid #00d4ff33',
                       color: '#00d4ff', cursor: 'pointer', borderRadius: 3 }}>
        Preset: 1U CubeSat
      </button>

      <h4 className="panel-section-title">At Current Altitude</h4>
      <div className="oe-row"><span className="oe-label">ρ</span>
        <span className="oe-value">{fmtE(rho)} <span className="oe-unit">kg/m³</span></span></div>
      <div className="oe-row"><span className="oe-label">Decay rate</span>
        <span className="oe-value" style={{ color: '#f93' }}>{fmt(decayRate_m_day, 2)} <span className="oe-unit">m/day</span></span></div>
      <div className="oe-row"><span className="oe-label">B* (bcoeff)</span>
        <span className="oe-value">{fmtE(bcoeff)} <span className="oe-unit">m²/kg</span></span></div>

      <h4 className="panel-section-title">Altitude Decay</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, fontSize: 10 }}>
        <span style={{ color: '#667' }}>Day</span>
        <span style={{ color: '#f93' }}>Altitude (km)</span>
        {decay.map(row => (
          <React.Fragment key={row.day}>
            <span style={{ color: '#a0b8d0' }}>{row.day}</span>
            <span style={{ color: row.alt < 200 ? '#f33' : '#f9388a' }}>
              {row.alt > 100 ? fmt(row.alt, 1) : '☠ Re-entry'}
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ── SSO Tab ───────────────────────────────────────────────────────────────────
function SsoTab() {
  const { catalog, selectedId } = useSatelliteStore();
  const { mode } = useUiStore();
  const sat = catalog.find(s => s.noradId === selectedId);

  const defaultAlt = sat ? Math.round(sat.semiMajorAxis - R_EARTH) : 600;
  const [alt, setAlt] = useState(defaultAlt);
  const [ecc, setEcc] = useState(0.0);

  const a_km       = R_EARTH + alt;
  const i_sso_rad  = ssoInclination(a_km, ecc);
  const i_sso_deg  = isNaN(i_sso_rad) ? NaN : i_sso_rad * RAD_TO_DEG;

  const satInclDeg = sat ? sat.inclination * RAD_TO_DEG : NaN;
  const delta      = isNaN(i_sso_deg) || isNaN(satInclDeg) ? NaN : Math.abs(satInclDeg - i_sso_deg);
  const isSso      = delta < 0.5; // within 0.5° of required SSO inclination

  return (
    <div>
      {mode === 'educational' && (
        <p style={{ color: '#667', fontSize: 10, marginBottom: 6, lineHeight: 1.5 }}>
          A Sun-synchronous orbit (SSO) precesses at exactly the rate the Sun moves
          along the ecliptic (~0.9856°/day), keeping the orbital plane aligned with
          the Sun. Achieved by choosing the right retrograde inclination.
        </p>
      )}

      <h4 className="panel-section-title">SSO Calculator</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8 }}>
        <label style={{ fontSize: 10, color: '#7a9ab8' }}>Altitude (km)
          <input type="number" value={alt} onChange={e => setAlt(+e.target.value)}
                 style={{ width: '100%', marginTop: 2 }} />
        </label>
        <label style={{ fontSize: 10, color: '#7a9ab8' }}>Eccentricity
          <input type="number" value={ecc} onChange={e => setEcc(+e.target.value)}
                 step="0.001" min="0" max="0.99" style={{ width: '100%', marginTop: 2 }} />
        </label>
      </div>

      <div className="oe-row">
        <span className="oe-label">Required inclination</span>
        <span className="oe-value" style={{ color: '#00d4ff' }}>
          {isNaN(i_sso_deg) ? 'N/A (orbit too high)' : `${fmt(i_sso_deg, 4)}°`}
        </span>
      </div>
      <div className="oe-row">
        <span className="oe-label">Orbit type</span>
        <span className="oe-value">{isNaN(i_sso_deg) ? '—' : (i_sso_deg > 90 ? 'Retrograde' : 'Prograde')}</span>
      </div>

      {sat && (
        <>
          <h4 className="panel-section-title">Selected Satellite Check</h4>
          <div className="oe-row">
            <span className="oe-label">{sat.name} inclination</span>
            <span className="oe-value">{fmt(satInclDeg, 4)}°</span>
          </div>
          <div className="oe-row">
            <span className="oe-label">SSO required at its altitude</span>
            <span className="oe-value">{fmt(ssoInclination(sat.semiMajorAxis, sat.eccentricity) * RAD_TO_DEG, 4)}°</span>
          </div>
          <div className="oe-row">
            <span className="oe-label">Δ inclination</span>
            <span className="oe-value" style={{ color: isSso ? '#4fc' : '#f93' }}>
              {fmt(delta, 3)}° {isSso ? '✓ SSO' : ''}
            </span>
          </div>
        </>
      )}

      {mode === 'educational' && (
        <div style={{ marginTop: 8, padding: 6, background: '#060d1a', border: '1px solid #1e2d4a', borderRadius: 4, fontSize: 10, color: '#667', lineHeight: 1.6 }}>
          <strong style={{ color: '#a0b8d0' }}>Formula (Vallado Eq. 9-40):</strong><br />
          cos(i) = -(2/3) · n_☉ · p² / (n · J₂ · R_E²)<br />
          where n_☉ = 2π / T_year (Sun's angular rate)
        </div>
      )}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export function PerturbationPanel() {
  const [tab, setTab] = useState<Tab>('j2');

  const tabStyle = (t: Tab): React.CSSProperties => ({
    flex: 1, padding: '4px 0', fontSize: 10, cursor: 'pointer',
    background: tab === t ? '#00d4ff22' : 'transparent',
    border: 'none', borderBottom: `2px solid ${tab === t ? '#00d4ff' : 'transparent'}`,
    color: tab === t ? '#00d4ff' : '#667',
    transition: 'color 0.15s',
  });

  return (
    <div className="panel" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
      <div className="panel-header">
        <strong>Perturbations</strong>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', marginBottom: 8, borderBottom: '1px solid #1e2d4a' }}>
        <button style={tabStyle('j2')}   onClick={() => setTab('j2')}>J2</button>
        <button style={tabStyle('drag')} onClick={() => setTab('drag')}>DRAG</button>
        <button style={tabStyle('sso')}  onClick={() => setTab('sso')}>SSO</button>
      </div>

      {tab === 'j2'   && <J2Tab />}
      {tab === 'drag' && <DragTab />}
      {tab === 'sso'  && <SsoTab />}
    </div>
  );
}
