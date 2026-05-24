/**
 * Interactive maneuver calculator panel.
 * Hohmann, bi-elliptic, and plane change maneuvers.
 */

import { useState } from 'react';
import { hohmannTransfer, biEllipticTransfer, planeChange, tsiolkovskyMassRatio } from '../../domain/astrodynamics/Maneuvers';
import { circularSpeed } from '../../domain/astrodynamics/TwoBodyProblem';
import { R_EARTH } from '../../domain/astrodynamics/constants';

type ManeuverType = 'hohmann' | 'bielliptic' | 'planechange';

const fmt = (n: number, d = 4) => isFinite(n) ? n.toFixed(d) : '∞';

export function ManeuverPanel() {
  const [type, setType] = useState<ManeuverType>('hohmann');
  const [r1Alt,    setR1Alt]    = useState(400);   // km altitude
  const [r2Alt,    setR2Alt]    = useState(35786);  // km altitude
  const [rbAlt,    setRbAlt]    = useState(100000); // intermediate altitude (bi-elliptic)
  const [deltaI,   setDeltaI]   = useState(28);     // degrees
  const [isp,      setIsp]      = useState(300);    // seconds

  const r1 = R_EARTH + r1Alt;
  const r2 = R_EARTH + r2Alt;
  const rb = R_EARTH + rbAlt;

  const hohm = hohmannTransfer(r1, r2);
  const biel = biEllipticTransfer(r1, rb, r2);
  const plnC = planeChange(circularSpeed(r1), deltaI * Math.PI / 180);

  const mr   = tsiolkovskyMassRatio(hohm.dvTotal, isp);
  const propF = (1 - 1 / mr) * 100;

  return (
    <div className="panel" style={{ fontFamily: 'monospace', fontSize: 13 }}>
      <div className="panel-header"><strong>Maneuver Calculator</strong></div>

      <div style={{ marginBottom: 8 }}>
        {(['hohmann', 'bielliptic', 'planechange'] as ManeuverType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            style={{ marginRight: 4, fontWeight: type === t ? 'bold' : 'normal',
                     background: type === t ? '#00d4ff22' : 'transparent',
                     border: '1px solid #00d4ff44', color: '#ccc', padding: '2px 8px' }}
          >
            {t === 'hohmann' ? 'Hohmann' : t === 'bielliptic' ? 'Bi-Elliptic' : 'Plane Change'}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 8 }}>
        <label htmlFor="mnv-r1">Initial Alt (km):</label>{' '}
        <input id="mnv-r1" name="mnv-r1" type="number" value={r1Alt} onChange={(e) => setR1Alt(+e.target.value)} style={{ width: 80 }} />
        {type !== 'planechange' && (<>
          {' '}<label htmlFor="mnv-r2" style={{ marginLeft: 8 }}>Final Alt (km):</label>{' '}
          <input id="mnv-r2" name="mnv-r2" type="number" value={r2Alt} onChange={(e) => setR2Alt(+e.target.value)} style={{ width: 80 }} />
        </>)}
        {type === 'bielliptic' && (<>
          {' '}<label htmlFor="mnv-rb" style={{ marginLeft: 8 }}>Intermediate Alt (km):</label>{' '}
          <input id="mnv-rb" name="mnv-rb" type="number" value={rbAlt} onChange={(e) => setRbAlt(+e.target.value)} style={{ width: 80 }} />
        </>)}
        {type === 'planechange' && (<>
          {' '}<label htmlFor="mnv-di" style={{ marginLeft: 8 }}>Δi (°):</label>{' '}
          <input id="mnv-di" name="mnv-di" type="number" value={deltaI} onChange={(e) => setDeltaI(+e.target.value)} style={{ width: 60 }} />
        </>)}
        {' '}<label htmlFor="mnv-isp" style={{ marginLeft: 8 }}>Isp (s):</label>{' '}
        <input id="mnv-isp" name="mnv-isp" type="number" value={isp} onChange={(e) => setIsp(+e.target.value)} style={{ width: 70 }} />
      </div>

      {type === 'hohmann' && (
        <div className="maneuver-results">
          <div className="result-row"><span>Δv₁</span><span>{fmt(hohm.dv1, 4)} km/s</span></div>
          <div className="result-row"><span>Δv₂</span><span>{fmt(hohm.dv2, 4)} km/s</span></div>
          <div className="result-row highlight"><span>Δv total</span><span>{fmt(hohm.dvTotal, 4)} km/s</span></div>
          <div className="result-row"><span>Transfer time</span><span>{fmt(hohm.tof / 60, 2)} min</span></div>
          <div className="result-row"><span>Transfer SMA</span><span>{fmt(hohm.aTransfer, 1)} km</span></div>
          <div className="result-row"><span>Transfer e</span><span>{fmt(hohm.eTransfer, 6)}</span></div>
          <hr style={{ borderColor: '#333', margin: '8px 0' }} />
          <div className="result-row"><span>Mass ratio (Isp={isp}s)</span><span>{fmt(mr, 4)}</span></div>
          <div className="result-row"><span>Propellant fraction</span><span>{fmt(propF, 2)}%</span></div>
        </div>
      )}

      {type === 'bielliptic' && (
        <div className="maneuver-results">
          <div className="result-row"><span>Δv₁</span><span>{fmt(biel.dv1, 4)} km/s</span></div>
          <div className="result-row"><span>Δv₂ (at rb)</span><span>{fmt(biel.dv2, 4)} km/s</span></div>
          <div className="result-row"><span>Δv₃</span><span>{fmt(biel.dv3, 4)} km/s</span></div>
          <div className="result-row highlight"><span>Δv total</span><span>{fmt(biel.dvTotal, 4)} km/s</span></div>
          <div className="result-row"><span>Transfer time</span><span>{fmt(biel.tof / 60, 2)} min</span></div>
          <div className="result-row"><span>vs Hohmann</span>
            <span style={{ color: biel.dvTotal < hohm.dvTotal ? '#4f4' : '#f44' }}>
              {biel.dvTotal < hohm.dvTotal ? '▼ more efficient' : '▲ less efficient'}
            </span>
          </div>
        </div>
      )}

      {type === 'planechange' && (
        <div className="maneuver-results">
          <div className="result-row"><span>Orbital speed at r₁</span><span>{fmt(circularSpeed(r1), 4)} km/s</span></div>
          <div className="result-row highlight"><span>Δv plane change</span><span>{fmt(plnC, 4)} km/s</span></div>
          <div className="result-row"><span>Propellant fraction</span><span>{fmt((1 - 1 / tsiolkovskyMassRatio(plnC, isp)) * 100, 2)}%</span></div>
        </div>
      )}
    </div>
  );
}
