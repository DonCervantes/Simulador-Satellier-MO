/**
 * MissionWizard — Phase 5 Mission Designer (v2).
 *
 * 4-step overlay wizard:
 *   Step 1 — Mission type + name
 *   Step 2 — Spacecraft parameters (mass, Isp, Dv budget)
 *   Step 3 — Orbit altitudes + optional plane change + live Dv preview
 *   Step 4 — Full results (burns, propellant, geometry)
 *
 * Additional panel: saved missions (localStorage), accessible from header.
 */

import React, { useState } from 'react';
import {
  useMissionStore,
  PRESETS,
} from '../../store/missionStore';
import type { MissionType, MissionParams, MissionResult, SavedMission } from '../../store/missionStore';
import {
  hohmannTransfer,
  biEllipticTransfer,
  combinedManeuver,
  propellantFraction,
} from '../../domain/astrodynamics/Maneuvers';
import { visViva, circularSpeed, orbitalPeriod } from '../../domain/astrodynamics/TwoBodyProblem';
import { R_EARTH, MU_EARTH } from '../../domain/astrodynamics/constants';

// ── Formatting ────────────────────────────────────────────────────────────────

const fmtDv  = (v: number) => v.toFixed(4);
const fmtKm  = (v: number) => v.toLocaleString('en', { maximumFractionDigits: 1 });
const fmtTof = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
};
const fmtDate = (ms: number) =>
  new Date(ms).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });

// ── Live Dv preview (Step 3, before committing) ───────────────────────────────

function liveDelta(params: MissionParams) {
  if (params.altInitial_km <= 0 || params.altTarget_km <= 0) return null;
  const r1 = R_EARTH + params.altInitial_km;
  const r2 = R_EARTH + params.altTarget_km;
  if (r1 === r2 && params.planeDelta_deg === 0) return { dvTotal: 0, sufficient: true };
  try {
    const useHohmann = r2 / r1 <= 11.94;
    let dv1: number, dv2Raw: number, vApo: number, aXfer: number;
    if (useHohmann) {
      const h = hohmannTransfer(r1, r2);
      dv1 = h.dv1; dv2Raw = h.dv2; aXfer = h.aTransfer;
      vApo = visViva(r2, aXfer, MU_EARTH);
    } else {
      const rb = r2 * 3;
      const b  = biEllipticTransfer(r1, rb, r2);
      dv1 = b.dv1; dv2Raw = b.dv2 + b.dv3;
      vApo = visViva(r2, b.a2Transfer, MU_EARTH);
    }
    let dv2 = dv2Raw;
    let dvPlane = 0;
    if (params.planeDelta_deg !== 0) {
      const di     = Math.abs(params.planeDelta_deg) * Math.PI / 180;
      const vCirc2 = circularSpeed(r2, MU_EARTH);
      dv2     = combinedManeuver(Math.abs(vApo), vCirc2, di);
      dvPlane = dv2 - Math.abs(dv2Raw);
    }
    const dvTotal = Math.abs(dv1) + Math.abs(dv2);
    return {
      dvTotal,
      dvPlane,
      sufficient: params.dvBudget_km_s >= dvTotal,
      maneuverType: r2 / r1 > 11.94 ? 'bielliptic' : 'hohmann',
      tof: orbitalPeriod((r1 + r2) / 2) / 2,
    };
  } catch { return null; }
}

// ── Preset metadata (no emojis) ───────────────────────────────────────────────

const PRESET_META: Record<MissionType, { code: string; desc: string }> = {
  cubesat_leo:    { code: 'LEO',  desc: 'Elevacion a 550 km, orbita solar-sincrona' },
  iss_rendezvous: { code: 'ISS',  desc: 'Aproximacion a la ISS en 417 km' },
  geo_comms:      { code: 'GEO',  desc: 'LEO -> GEO via transferencia Hohmann' },
  custom:         { code: 'USR',  desc: 'Parametros definidos por el usuario' },
};

// ── Styles (shared) ───────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: '#080f1c', border: '1px solid #1e2d4a',
  color: '#c0d4e8', borderRadius: 4, padding: '6px 10px',
  fontSize: 12, width: '100%', boxSizing: 'border-box',
  outline: 'none', fontFamily: 'monospace',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, color: '#3a5a78',
  letterSpacing: 2, textTransform: 'uppercase',
  margin: '0 0 8px',
};

const statBox: React.CSSProperties = {
  background: '#080f1c', borderRadius: 5, padding: '8px 10px',
  border: '1px solid #1a2a3e', textAlign: 'center' as const,
};

const navBtn = (accent = false): React.CSSProperties => ({
  background: accent ? '#00d4ff' : '#0a1628',
  border: `1px solid ${accent ? '#00d4ff' : '#1e2d4a'}`,
  color: accent ? '#000' : '#a0b8d0',
  fontWeight: accent ? 700 : 400,
  borderRadius: 5, padding: '7px 18px',
  cursor: 'pointer', fontSize: 11, transition: 'all 0.15s',
});

const ghostBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid #1e2d4a',
  color: '#5a7a98', borderRadius: 4, padding: '3px 8px',
  cursor: 'pointer', fontSize: 10, letterSpacing: 0.5,
  transition: 'all 0.15s',
};

// ── Step bar ──────────────────────────────────────────────────────────────────

function StepBar({ step }: { step: 1|2|3|4 }) {
  const labels = ['MISION', 'NAVE', 'ORBITA', 'RESULT'];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, marginBottom: 22 }}>
      {labels.map((lbl, i) => {
        const n    = (i + 1) as 1|2|3|4;
        const done = step > n;
        const curr = step === n;
        return (
          <React.Fragment key={n}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700,
                background: done ? '#00d4ff' : curr ? 'transparent' : 'transparent',
                border: `1.5px solid ${done || curr ? '#00d4ff' : '#1e2d4a'}`,
                color: done ? '#000' : curr ? '#00d4ff' : '#2a3d55',
                transition: 'all 0.2s',
              }}>
                {done ? '/' : n}
              </div>
              <span style={{
                fontSize: 8, letterSpacing: 0.5, marginTop: 3,
                color: curr ? '#00d4ff' : done ? '#3a8a9a' : '#2a3d55',
              }}>
                {lbl}
              </span>
            </div>
            {i < 3 && (
              <div style={{
                flex: 1, height: 1, alignSelf: 'flex-start', marginTop: 13,
                background: step > n ? '#00d4ff66' : '#1a2a3e',
                transition: 'background 0.2s',
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Field ─────────────────────────────────────────────────────────────────────

function Field({
  label, unit, value, onChange, min, max, step = 1,
}: {
  label: string; unit: string; value: number;
  onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 10, color: '#5a7a98', marginBottom: 4,
      }}>
        <span>{label}</span>
        <span style={{ color: '#2a3d55', fontFamily: 'monospace' }}>{unit}</span>
      </label>
      <input
        type="number" value={value} min={min} max={max} step={step}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        style={inputStyle}
      />
    </div>
  );
}

// ── Step 1: Mission type ──────────────────────────────────────────────────────

function Step1({ params, updateParams, applyPreset }: {
  params: MissionParams;
  updateParams: (p: Partial<MissionParams>) => void;
  applyPreset:  (t: MissionType) => void;
}) {
  const types: MissionType[] = ['cubesat_leo', 'iss_rendezvous', 'geo_comms', 'custom'];
  return (
    <div>
      <p style={sectionTitle}>Escenario</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
        {types.map(t => {
          const meta   = PRESET_META[t];
          const active = params.type === t;
          return (
            <button key={t} onClick={() => applyPreset(t)} style={{
              background: active ? '#001a2e' : '#050c18',
              border: `1px solid ${active ? '#00d4ff' : '#1a2a3e'}`,
              borderRadius: 5, padding: '10px 12px',
              cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
            }}>
              <div style={{
                fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
                letterSpacing: 2,
                color: active ? '#00d4ff' : '#2a4060',
                marginBottom: 4,
              }}>
                {meta.code}
              </div>
              <div style={{ fontSize: 10, color: active ? '#a0c4d8' : '#3a5570' }}>
                {PRESETS[t].name}
              </div>
              <div style={{ fontSize: 8, color: '#2a3d55', marginTop: 3 }}>
                {meta.desc}
              </div>
            </button>
          );
        })}
      </div>

      <p style={sectionTitle}>Nombre de la Mision</p>
      <input
        type="text" value={params.name} placeholder="Ej. Mision Alpha-1"
        onChange={e => updateParams({ name: e.target.value })}
        style={inputStyle}
      />
    </div>
  );
}

// ── Step 2: Spacecraft ────────────────────────────────────────────────────────

const ENGINE_PRESETS = [
  { label: 'GAS FRIO',  isp: 70   },
  { label: 'RESIST.',   isp: 150  },
  { label: 'MONOPROP',  isp: 220  },
  { label: 'BIPROP',    isp: 320  },
  { label: 'ION / HALL',isp: 1600 },
];

function Step2({ params, updateParams }: {
  params: MissionParams;
  updateParams: (p: Partial<MissionParams>) => void;
}) {
  const frac = propellantFraction(params.dvBudget_km_s, params.isp_s);
  const pct  = (frac * 100).toFixed(1);

  return (
    <div>
      <p style={sectionTitle}>Motor</p>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
        {ENGINE_PRESETS.map(ep => {
          const active = params.isp_s === ep.isp;
          return (
            <button key={ep.isp} onClick={() => updateParams({ isp_s: ep.isp })} style={{
              background: active ? '#001a2e' : 'transparent',
              border: `1px solid ${active ? '#00d4ff66' : '#1a2a3e'}`,
              color: active ? '#00d4ff' : '#3a5570',
              padding: '3px 9px', borderRadius: 3, cursor: 'pointer',
              fontSize: 9, letterSpacing: 0.8, fontFamily: 'monospace',
              transition: 'all 0.12s',
            }}>
              {ep.label}
            </button>
          );
        })}
      </div>

      <Field label="Masa total (seca + propelente)" unit="kg"
             value={params.mass_kg}       onChange={v => updateParams({ mass_kg: v })}
             min={0.1} step={0.1} />
      <Field label="Impulso especifico Isp"          unit="s"
             value={params.isp_s}         onChange={v => updateParams({ isp_s: v })}
             min={10} max={5000} />
      <Field label="Presupuesto Dv disponible"       unit="km/s"
             value={params.dvBudget_km_s} onChange={v => updateParams({ dvBudget_km_s: v })}
             min={0} step={0.01} />

      {params.dvBudget_km_s > 0 && params.isp_s > 0 && (
        <div style={{ marginTop: 16 }}>
          <p style={{ ...sectionTitle, marginBottom: 6 }}>Fraccion propelente para Dv completo</p>
          <div style={{
            background: '#080f1c', borderRadius: 3, height: 10,
            border: '1px solid #1a2a3e', overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.min(frac * 100, 100)}%`, height: '100%',
              background: frac > 0.8 ? '#e05555' : frac > 0.5 ? '#c8a800' : '#00d4ff',
              transition: 'width 0.3s',
            }} />
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 9, color: '#2a3d55', marginTop: 4,
            fontFamily: 'monospace',
          }}>
            <span>PROP  {pct}%</span>
            <span>UTIL  {(100 - parseFloat(pct)).toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 3: Orbit + plane change ──────────────────────────────────────────────

function Step3({ params, updateParams }: {
  params: MissionParams;
  updateParams: (p: Partial<MissionParams>) => void;
}) {
  const live = liveDelta(params);

  return (
    <div>
      <p style={sectionTitle}>Orbita inicial y objetivo</p>
      <Field label="Altitud inicial"  unit="km"
             value={params.altInitial_km}  onChange={v => updateParams({ altInitial_km: v })}
             min={160} max={100000} step={10} />
      <Field label="Altitud objetivo" unit="km"
             value={params.altTarget_km}   onChange={v => updateParams({ altTarget_km: v })}
             min={160} max={100000} step={10} />
      <Field label="Inclinacion"      unit="deg"
             value={params.inclination_deg} onChange={v => updateParams({ inclination_deg: v })}
             min={0} max={180} step={0.1} />

      {/* Plane change toggle */}
      <div style={{
        marginTop: 16, padding: '12px 14px',
        background: '#050c18', border: '1px solid #1a2a3e', borderRadius: 5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ ...sectionTitle, margin: 0 }}>Cambio de plano (combinado)</p>
          <button
            onClick={() => updateParams({ planeDelta_deg: params.planeDelta_deg === 0 ? 5 : 0 })}
            style={{
              background: params.planeDelta_deg !== 0 ? '#001a2e' : 'transparent',
              border: `1px solid ${params.planeDelta_deg !== 0 ? '#00d4ff66' : '#1a2a3e'}`,
              color: params.planeDelta_deg !== 0 ? '#00d4ff' : '#3a5570',
              borderRadius: 3, padding: '2px 10px', cursor: 'pointer',
              fontSize: 9, letterSpacing: 1, fontFamily: 'monospace',
            }}
          >
            {params.planeDelta_deg !== 0 ? 'ACTIVO' : 'OFF'}
          </button>
        </div>
        {params.planeDelta_deg !== 0 && (
          <div style={{ marginTop: 10 }}>
            <Field label="Delta-i (cambio de inclinacion)" unit="deg"
                   value={params.planeDelta_deg}
                   onChange={v => updateParams({ planeDelta_deg: v })}
                   min={0} max={180} step={0.5} />
            <div style={{ fontSize: 9, color: '#2a5060', lineHeight: 1.5 }}>
              El cambio de plano se combina con el segundo encendido (mas eficiente
              que dos maniobras separadas). Formula: Dv = sqrt(v1^2 + v2^2 - 2*v1*v2*cos(Di))
            </div>
          </div>
        )}
      </div>

      {/* Live Dv preview */}
      {live && (
        <div style={{
          marginTop: 14, padding: '12px 14px', borderRadius: 5,
          background: live.sufficient ? '#020e06' : '#0e0202',
          border: `1px solid ${live.sufficient ? '#00c85330' : '#c8000030'}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{
                fontSize: 22, fontWeight: 700, fontFamily: 'monospace',
                color: live.sufficient ? '#00d4ff' : '#e05555',
              }}>
                {fmtDv(live.dvTotal)} <span style={{ fontSize: 11, fontWeight: 400 }}>km/s</span>
              </div>
              {live.dvPlane !== undefined && live.dvPlane > 0.0001 && (
                <div style={{ fontSize: 9, color: '#3a6a7a', marginTop: 2, fontFamily: 'monospace' }}>
                  +{fmtDv(live.dvPlane)} km/s por cambio de plano
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 1, fontFamily: 'monospace',
                color: live.sufficient ? '#00c853' : '#e05555',
              }}>
                {live.sufficient ? 'VIABLE' : 'DEFICIT'}
              </div>
              <div style={{ fontSize: 9, color: '#2a3d55', marginTop: 2, fontFamily: 'monospace' }}>
                BUDGET {fmtDv(params.dvBudget_km_s)} km/s
              </div>
            </div>
          </div>
          <div style={{
            marginTop: 10, background: '#080f1c', borderRadius: 2, height: 6,
            border: '1px solid #1a2a3e', overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.min(live.dvTotal / Math.max(params.dvBudget_km_s, live.dvTotal) * 100, 100)}%`,
              height: '100%',
              background: live.sufficient ? '#00d4ff' : '#e05555',
              transition: 'width 0.3s',
            }} />
          </div>
          {live.tof !== undefined && (
            <div style={{ marginTop: 7, fontSize: 9, color: '#2a4050', fontFamily: 'monospace' }}>
              {live.maneuverType === 'bielliptic' ? 'BI-ELIPTICA' : 'HOHMANN'}
              {'  |  TOF ~ '}
              {fmtTof(live.tof)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Step 4: Results ───────────────────────────────────────────────────────────

function Step4({ result, params, setShowOnGlobe, showOnGlobe, close, saveMission }: {
  result: MissionResult;
  params: MissionParams;
  setShowOnGlobe: (s: boolean) => void;
  showOnGlobe: boolean;
  close: () => void;
  saveMission: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const propPct  = (result.propFraction * 100).toFixed(1);
  const remPct   = Math.max(0, result.dvRemaining_km_s / params.dvBudget_km_s * 100).toFixed(0);

  const handleSave = () => {
    saveMission();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      {/* Status banner */}
      <div style={{
        padding: '10px 14px', borderRadius: 5, marginBottom: 16,
        background: result.sufficient ? '#020e06' : '#0e0202',
        border: `1px solid ${result.sufficient ? '#00c85330' : '#c8000030'}`,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: result.sufficient ? '#00c853' : '#e05555',
        }} />
        <div>
          <div style={{
            fontWeight: 700, fontSize: 11, letterSpacing: 1, fontFamily: 'monospace',
            color: result.sufficient ? '#00c853' : '#e05555',
          }}>
            {result.sufficient ? 'MISION VIABLE' : 'Dv INSUFICIENTE'}
          </div>
          <div style={{ fontSize: 9, color: '#3a5570', marginTop: 2 }}>
            {result.sufficient
              ? `Remanente  ${fmtDv(result.dvRemaining_km_s)} km/s  (${remPct}% del budget)`
              : `Deficit  ${fmtDv(-result.dvRemaining_km_s)} km/s  — aumenta Isp o Dv budget`}
          </div>
        </div>
      </div>

      {/* Dv breakdown */}
      <p style={sectionTitle}>Desglose Dv</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7, marginBottom: 14 }}>
        {[
          { lbl: 'DV1', sub: 'Encendido 1', val: result.dv1_km_s,    col: '#00d4ff' },
          { lbl: 'DV2', sub: result.dvPlane_km_s > 0.0001
                             ? `Enc. 2 + plano (+${fmtDv(result.dvPlane_km_s)})`
                             : 'Encendido 2',
                              val: result.dv2_km_s, col: '#00c853' },
          { lbl: 'DVT', sub: 'Total',       val: result.dvTotal_km_s, col: '#c8a800' },
        ].map(row => (
          <div key={row.lbl} style={statBox}>
            <div style={{
              fontSize: 8, color: '#2a4050', letterSpacing: 1, fontFamily: 'monospace', marginBottom: 2,
            }}>
              {row.lbl}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: row.col, fontFamily: 'monospace' }}>
              {fmtDv(row.val)}
            </div>
            <div style={{ fontSize: 7, color: '#2a3d55', marginTop: 2 }}>km/s</div>
            <div style={{ fontSize: 7, color: '#1e3040', marginTop: 1 }}>{row.sub}</div>
          </div>
        ))}
      </div>

      {/* TOF + type */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
        <div style={{ ...statBox, flex: 1 }}>
          <div style={{ fontSize: 8, color: '#2a4050', letterSpacing: 1, fontFamily: 'monospace', marginBottom: 2 }}>TOF</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#a080d0', fontFamily: 'monospace' }}>
            {fmtTof(result.tof_s)}
          </div>
          <div style={{ fontSize: 7, color: '#1e3040', marginTop: 2 }}>Tiempo de transferencia</div>
        </div>
        <div style={{ ...statBox, flex: 1 }}>
          <div style={{ fontSize: 8, color: '#2a4050', letterSpacing: 1, fontFamily: 'monospace', marginBottom: 2 }}>TIPO</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#d09040', fontFamily: 'monospace' }}>
            {result.maneuverType === 'hohmann' ? 'HOHMANN' : 'BI-ELIP.'}
          </div>
          <div style={{ fontSize: 7, color: '#1e3040', marginTop: 2 }}>Tipo de maniobra</div>
        </div>
      </div>

      {/* Propellant */}
      <p style={sectionTitle}>Propelente (Tsiolkovsky)</p>
      <div style={{
        background: '#080f1c', borderRadius: 5, padding: '10px 12px',
        border: '1px solid #1a2a3e', marginBottom: 14,
      }}>
        <div style={{ display: 'flex', height: 14, borderRadius: 3, overflow: 'hidden', marginBottom: 7 }}>
          <div style={{ width: `${result.propFraction * 100}%`, background: '#7a2020' }} />
          <div style={{ flex: 1, background: '#003a5a' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {[
            { lbl: 'PROP', val: `${result.propMass_kg.toFixed(2)} kg`, sub: `${propPct}% masa total` },
            { lbl: 'UTIL', val: `${(params.mass_kg - result.propMass_kg).toFixed(2)} kg`, sub: `${(100 - parseFloat(propPct)).toFixed(1)}% masa total` },
            { lbl: 'MR',   val: result.massRatio.toFixed(3), sub: 'm0 / mf' },
          ].map(row => (
            <div key={row.lbl} style={{ textAlign: 'center' as const }}>
              <div style={{ fontSize: 7, color: '#2a4050', letterSpacing: 1, fontFamily: 'monospace' }}>{row.lbl}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#a0b8d0', fontFamily: 'monospace', marginTop: 2 }}>{row.val}</div>
              <div style={{ fontSize: 7, color: '#1e3040' }}>{row.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Orbit geometry */}
      <p style={sectionTitle}>Geometria de la transferencia</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7, marginBottom: 18 }}>
        {[
          { lbl: 'R1',   val: `${fmtKm(result.r1_km)} km`,       sub: `h = ${fmtKm(result.r1_km - R_EARTH)} km` },
          { lbl: 'A_T',  val: `${fmtKm(result.aTransfer_km)} km`, sub: `e = ${result.eTransfer.toFixed(5)}` },
          { lbl: 'R2',   val: `${fmtKm(result.r2_km)} km`,       sub: `h = ${fmtKm(result.r2_km - R_EARTH)} km` },
        ].map(row => (
          <div key={row.lbl} style={statBox}>
            <div style={{ fontSize: 7, color: '#2a4050', letterSpacing: 1, fontFamily: 'monospace' }}>{row.lbl}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#8aaac0', fontFamily: 'monospace', marginTop: 2 }}>{row.val}</div>
            <div style={{ fontSize: 7, color: '#1e3040', marginTop: 2 }}>{row.sub}</div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => { setShowOnGlobe(!showOnGlobe); close(); }}
          style={{
            flex: 1, padding: '9px 0',
            background: showOnGlobe ? '#001a2e' : 'transparent',
            border: `1px solid ${showOnGlobe ? '#00d4ff' : '#00d4ff55'}`,
            color: '#00d4ff', borderRadius: 5, cursor: 'pointer',
            fontSize: 10, letterSpacing: 1, fontFamily: 'monospace',
            fontWeight: 600, transition: 'all 0.2s',
          }}
        >
          {showOnGlobe ? 'OCULTAR GLOBO' : 'VER EN GLOBO'}
        </button>
        <button
          onClick={handleSave}
          style={{
            flex: 1, padding: '9px 0',
            background: saved ? '#002a10' : 'transparent',
            border: `1px solid ${saved ? '#00c85360' : '#1a2a3e'}`,
            color: saved ? '#00c853' : '#5a7a98',
            borderRadius: 5, cursor: 'pointer',
            fontSize: 10, letterSpacing: 1, fontFamily: 'monospace',
            fontWeight: 600, transition: 'all 0.2s',
          }}
        >
          {saved ? 'GUARDADO' : 'GUARDAR MISION'}
        </button>
      </div>
    </div>
  );
}

// ── Saved missions panel ──────────────────────────────────────────────────────

function SavedPanel({ missions, loadMission, deleteMission, onClose }: {
  missions:     SavedMission[];
  loadMission:  (id: string) => void;
  deleteMission:(id: string) => void;
  onClose:      () => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ ...sectionTitle, margin: 0 }}>Misiones guardadas ({missions.length}/20)</p>
        <button onClick={onClose} style={{ ...ghostBtn, fontSize: 9 }}>CERRAR</button>
      </div>

      {missions.length === 0 ? (
        <div style={{
          padding: '28px 0', textAlign: 'center',
          fontSize: 10, color: '#2a3d55', letterSpacing: 0.5,
        }}>
          No hay misiones guardadas.
          <br />
          <span style={{ fontSize: 9, color: '#1e2d40' }}>
            Calcula una mision y presiona GUARDAR MISION.
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {missions.map(m => {
            const r = m.result;
            return (
              <div key={m.id} style={{
                background: '#050c18', border: '1px solid #1a2a3e',
                borderRadius: 5, padding: '10px 12px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 11, color: '#8aaac0', fontWeight: 600,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {m.params.name}
                  </div>
                  <div style={{ fontSize: 8, color: '#2a3d55', marginTop: 3, fontFamily: 'monospace' }}>
                    {m.params.altInitial_km} km → {m.params.altTarget_km} km
                    {m.params.planeDelta_deg !== 0 && `  Di = ${m.params.planeDelta_deg}°`}
                    {r && (
                      <span style={{ color: r.sufficient ? '#1a6a40' : '#6a1a1a', marginLeft: 8 }}>
                        {fmtDv(r.dvTotal_km_s)} km/s  {r.sufficient ? 'OK' : 'DEF'}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 7, color: '#1a2a3a', marginTop: 2 }}>
                    {fmtDate(m.savedAt)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                  <button
                    onClick={() => loadMission(m.id)}
                    style={{ ...ghostBtn, color: '#00d4ff', borderColor: '#00d4ff44', fontSize: 9 }}
                  >
                    CARGAR
                  </button>
                  <button
                    onClick={() => deleteMission(m.id)}
                    style={{ ...ghostBtn, color: '#7a3a3a', borderColor: '#3a1a1a', fontSize: 9 }}
                  >
                    DEL
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Root wizard ───────────────────────────────────────────────────────────────

export function MissionWizard() {
  const {
    isOpen, step, params, result, showOnGlobe,
    close, nextStep, prevStep,
    updateParams, applyPreset,
    computeAndAdvance,
    setShowOnGlobe, reset,
    savedMissions, saveMission, loadMission, deleteMission,
  } = useMissionStore();

  const [showSaved, setShowSaved] = useState(false);

  if (!isOpen) return null;

  const live           = liveDelta(params);
  const canCalc        = step === 3 ? live !== null : true;

  const handleNext = () => {
    if (step === 3) computeAndAdvance();
    else nextStep();
  };

  return (
    <>
      {/* Backdrop */}
      <div onClick={close} style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(3px)',
      }} />

      {/* Dialog */}
      <div style={{
        position: 'fixed', zIndex: 51,
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: Math.min(510, window.innerWidth - 32),
        maxHeight: 'calc(100vh - 48px)',
        background: '#060d1a',
        border: '1px solid #1a2a3e',
        borderRadius: 8,
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 32px 80px rgba(0,0,0,0.9)',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 18px', borderBottom: '1px solid #1a2a3e', flexShrink: 0,
        }}>
          <div>
            <div style={{
              color: '#00d4ff', fontWeight: 700, fontSize: 11,
              letterSpacing: 3, fontFamily: 'monospace',
            }}>
              DISENADOR DE MISION
            </div>
            <div style={{ color: '#2a4050', fontSize: 9, marginTop: 2, letterSpacing: 0.5 }}>
              {params.name || 'Nueva Mision'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={() => setShowSaved(s => !s)}
              style={{
                ...ghostBtn,
                color: showSaved ? '#00d4ff' : '#3a5570',
                borderColor: showSaved ? '#00d4ff44' : '#1a2a3e',
              }}
            >
              GUARDADAS {savedMissions.length > 0 && `(${savedMissions.length})`}
            </button>
            <button onClick={reset} style={ghostBtn}>RST</button>
            <button onClick={close} style={ghostBtn}>X</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 18px 0', overflowY: 'auto', flex: 1 }}>
          {showSaved ? (
            <SavedPanel
              missions={savedMissions}
              loadMission={id => { loadMission(id); setShowSaved(false); }}
              deleteMission={deleteMission}
              onClose={() => setShowSaved(false)}
            />
          ) : (
            <>
              <StepBar step={step} />
              {step === 1 && (
                <Step1 params={params} updateParams={updateParams} applyPreset={applyPreset} />
              )}
              {step === 2 && (
                <Step2 params={params} updateParams={updateParams} />
              )}
              {step === 3 && (
                <Step3 params={params} updateParams={updateParams} />
              )}
              {step === 4 && result && (
                <Step4
                  result={result} params={params}
                  setShowOnGlobe={setShowOnGlobe} showOnGlobe={showOnGlobe}
                  close={close} saveMission={saveMission}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!showSaved && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 18px', borderTop: '1px solid #1a2a3e', flexShrink: 0,
          }}>
            <button
              onClick={prevStep} disabled={step === 1}
              style={{ ...navBtn(false), opacity: step === 1 ? 0.25 : 1 }}
            >
              ATRAS
            </button>
            <span style={{ fontSize: 8, color: '#1e2d3e', letterSpacing: 1, fontFamily: 'monospace' }}>
              PASO {step} / 4
            </span>
            {step < 4 ? (
              <button
                onClick={handleNext} disabled={!canCalc}
                style={{ ...navBtn(true), opacity: canCalc ? 1 : 0.35 }}
              >
                {step === 3 ? 'CALCULAR' : 'SIGUIENTE'}
              </button>
            ) : (
              <button onClick={close} style={navBtn(false)}>CERRAR</button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
