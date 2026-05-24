/**
 * Panel displaying classical orbital elements and invariants for selected satellite.
 * Educational mode shows tooltips explaining each element.
 * Professional mode shows raw numerical values.
 */

import { useSatelliteStore } from '../../store/satelliteStore';
import { useUiStore } from '../../store/uiStore';
import { classifyOrbitRegime, orbitAltitudeRange } from '../../domain/catalog/OrbitClassifier';
import { j2SecularRates } from '../../domain/astrodynamics/Perturbations';
import { orbitalPeriod, meanMotion } from '../../domain/astrodynamics/TwoBodyProblem';
import { RAD_TO_DEG } from '../../domain/astrodynamics/constants';

const fmt = (n: number, d = 4) => isFinite(n) ? n.toFixed(d) : '∞';

interface RowProps { label: string; value: string; unit?: string; tip?: string; }
function Row({ label, value, unit, tip }: RowProps) {
  return (
    <div className="oe-row" title={tip}>
      <span className="oe-label">{label}</span>
      <span className="oe-value">{value}{unit && <span className="oe-unit"> {unit}</span>}</span>
    </div>
  );
}

export function OrbitalElementsPanel() {
  const { catalog, selectedId } = useSatelliteStore();
  const { mode } = useUiStore();

  const sat = catalog.find((s) => s.noradId === selectedId);
  if (!sat) return (
    <div className="panel">
      <p className="panel-empty">Select a satellite to view orbital elements.</p>
    </div>
  );

  const a    = sat.semiMajorAxis;
  const e    = sat.eccentricity;
  const i    = sat.inclination;
  const raan = sat.raan;
  const w    = sat.argPerigee;
  const M0   = sat.meanAnomaly;

  const { periapsisKm, apoapsisKm } = orbitAltitudeRange(a, e);
  const period = orbitalPeriod(a);
  const n_rad  = meanMotion(a);
  const oeForPert = { a, e, i, raan, omega: w, nu: 0 };
  const j2rates = j2SecularRates(oeForPert);
  const regime  = classifyOrbitRegime(oeForPert);

  const tips = {
    a:     "Semi-major axis: average of periapsis and apoapsis distances. Determines orbital period (Kepler’s 3rd law).",
    e:     'Eccentricity: shape of orbit. 0 = circular, <1 = elliptic, =1 = parabolic, >1 = hyperbolic.',
    i:     'Inclination: angle between orbital plane and equatorial plane.',
    raan:  'Right Ascension of Ascending Node (Ω): longitude where orbit crosses equator going north.',
    omega: 'Argument of Perigee (ω): angle from ascending node to periapsis.',
    M0:    'Mean Anomaly at epoch: angular position at reference time (uniform fictitious motion).',
  };

  return (
    <div className="panel" style={{ fontFamily: 'monospace', fontSize: 13 }}>
      <div className="panel-header">
        <strong>{sat.name}</strong>
        <span className="panel-badge">{regime}</span>
      </div>

      <section>
        <h4 className="panel-section-title">Classical Orbital Elements</h4>
        <Row label="a"  value={fmt(a, 2)}           unit="km"  tip={mode === 'educational' ? tips.a : undefined} />
        <Row label="e"  value={fmt(e, 7)}            unit=""    tip={mode === 'educational' ? tips.e : undefined} />
        <Row label="i"  value={fmt(i * RAD_TO_DEG, 4)} unit="°" tip={mode === 'educational' ? tips.i : undefined} />
        <Row label="Ω (RAAN)"  value={fmt(raan  * RAD_TO_DEG, 4)} unit="°" tip={mode === 'educational' ? tips.raan : undefined} />
        <Row label="ω (ArgPerig)" value={fmt(w * RAD_TO_DEG, 4)} unit="°" tip={mode === 'educational' ? tips.omega : undefined} />
        <Row label="M₀" value={fmt(M0 * RAD_TO_DEG, 4)} unit="°" tip={mode === 'educational' ? tips.M0 : undefined} />
      </section>

      <section>
        <h4 className="panel-section-title">Derived Quantities</h4>
        <Row label="Periapsis alt" value={fmt(periapsisKm, 1)} unit="km" />
        <Row label="Apoapsis alt"  value={fmt(apoapsisKm, 1)}  unit="km" />
        <Row label="Period"        value={fmt(period / 60, 2)} unit="min" />
        <Row label="n"             value={fmt(n_rad * 1000, 6)} unit="mrad/s" />
      </section>

      {mode === 'professional' && (
        <section>
          <h4 className="panel-section-title">J2 Secular Rates</h4>
          <Row label="dΩ/dt" value={fmt(j2rates.dRaan_radS * RAD_TO_DEG * 86400, 5)} unit="°/day" />
          <Row label="dω/dt" value={fmt(j2rates.dOmega_radS * RAD_TO_DEG * 86400, 5)} unit="°/day" />
          <Row label="B*"    value={String(sat.bstar)} />
        </section>
      )}
    </div>
  );
}
