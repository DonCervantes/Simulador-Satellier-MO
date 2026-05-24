/**
 * Satellite search/filter control with real-time filtering by name, NORAD ID, orbit type.
 */

import { useState, useMemo } from 'react';
import { useSatelliteStore } from '../../store/satelliteStore';
import { classifyOrbitRegime } from '../../domain/catalog/OrbitClassifier';
import type { OrbitType } from '../../domain/astrodynamics/types';

const ALL_TYPES: (OrbitType | 'ALL')[] = ['ALL', 'LEO', 'MEO', 'GEO', 'SSO', 'Molniya', 'GTO', 'HEO'];

export function SatelliteSearch() {
  const { catalog, selectedId, setSelectedId } = useSatelliteStore();
  const [query,      setQuery]      = useState('');
  const [filterType, setFilterType] = useState<OrbitType | 'ALL'>('ALL');
  const [expanded,   setExpanded]   = useState(true);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return catalog
      .filter((s) => {
        if (filterType !== 'ALL') {
          const regime = classifyOrbitRegime({ a: s.semiMajorAxis, e: s.eccentricity, i: s.inclination, raan: s.raan, omega: s.argPerigee, nu: 0 });
          if (regime !== filterType) return false;
        }
        if (!q) return true;
        return s.name.toLowerCase().includes(q) || String(s.noradId).includes(q);
      })
      .slice(0, 200); // limit displayed results for performance
  }, [catalog, query, filterType]);

  if (!expanded) return (
    <button onClick={() => setExpanded(true)} style={collapsedStyle}>
      🔭 {catalog.length.toLocaleString()} satellites
    </button>
  );

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ color: '#00d4ff', fontSize: 12 }}>
          {catalog.length.toLocaleString()} satellites
        </span>
        <button onClick={() => setExpanded(false)} style={closeBtnStyle}>✕</button>
      </div>

      <input
        id="sat-search"
        name="sat-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name or NORAD ID…"
        style={inputStyle}
      />

      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 4, marginBottom: 6 }}>
        {ALL_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            style={{
              ...chipStyle,
              background: filterType === t ? '#00d4ff33' : 'transparent',
              borderColor: filterType === t ? '#00d4ff' : '#2a4a6a',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ maxHeight: 240, overflowY: 'auto' }}>
        {filtered.length === 0
          ? <div style={{ color: '#667', fontSize: 12, padding: 4 }}>No matches</div>
          : filtered.map((s) => (
            <div
              key={s.noradId}
              onClick={() => setSelectedId(s.noradId === selectedId ? null : s.noradId)}
              style={{
                ...rowStyle,
                background: s.noradId === selectedId ? '#00d4ff22' : 'transparent',
                borderLeft: s.noradId === selectedId ? '2px solid #00d4ff' : '2px solid transparent',
              }}
            >
              <div style={{ color: '#d0e8ff', fontSize: 12 }}>{s.name}</div>
              <div style={{ color: '#667', fontSize: 10 }}>#{s.noradId}</div>
            </div>
          ))
        }
        {filtered.length === 200 && (
          <div style={{ color: '#667', fontSize: 10, padding: '4px 8px' }}>
            Showing first 200 results — refine your search
          </div>
        )}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  position: 'absolute', top: 12, left: 12, zIndex: 10,
  width: 240,
  background: 'rgba(8, 14, 26, 0.92)',
  border: '1px solid #1e2d4a',
  borderRadius: 8, padding: 10,
  backdropFilter: 'blur(8px)',
};
const collapsedStyle: React.CSSProperties = {
  position: 'absolute', top: 12, left: 12, zIndex: 10,
  background: 'rgba(8,14,26,0.9)', border: '1px solid #1e2d4a',
  borderRadius: 6, padding: '6px 12px', color: '#00d4ff',
  cursor: 'pointer', fontSize: 12,
};
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '5px 8px',
  background: '#0d1a2a', border: '1px solid #1e2d4a', borderRadius: 4,
  color: '#c8d8f0', fontSize: 12,
};
const chipStyle: React.CSSProperties = {
  padding: '1px 6px', fontSize: 10, border: '1px solid',
  borderRadius: 4, cursor: 'pointer', color: '#a0b8d0',
};
const rowStyle: React.CSSProperties = {
  padding: '4px 8px', cursor: 'pointer', borderRadius: 4,
  marginBottom: 2,
};
const closeBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none',
  color: '#667', cursor: 'pointer', fontSize: 14, lineHeight: 1,
};
