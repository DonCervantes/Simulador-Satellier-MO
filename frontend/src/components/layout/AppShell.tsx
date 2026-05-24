/**
 * Main application shell: globe + overlays + bottom timeline + collapsible sidebar.
 *
 * Panels:
 *   orbital      — Classical orbital elements + J2 rates (always visible when satellite selected)
 *   maneuver     — Hohmann / bi-elliptic / plane change Δv calculator
 *   perturbation — J2 drift forecast, atmospheric drag decay, SSO calculator  [Phase 4]
 *   groundtrack  — 2D equirectangular ground track                            [Phase 4]
 */

import { useEffect, Suspense } from 'react';
import { CesiumGlobe }          from '../visualization/CesiumGlobe';
import { GroundTrack }          from '../visualization/GroundTrack';
import { SatelliteSearch }      from '../controls/SatelliteSearch';
import { TimeController }       from '../controls/TimeController';
import { OrbitalElementsPanel } from '../panels/OrbitalElementsPanel';
import { ManeuverPanel }        from '../panels/ManeuverPanel';
import { PerturbationPanel }    from '../panels/PerturbationPanel';
import { useSatelliteStore }    from '../../store/satelliteStore';
import { useUiStore }           from '../../store/uiStore';
import { usePropagation }       from '../../application/usePropagation';
import { useMissionStore }      from '../../store/missionStore';
import { MissionWizard }        from '../panels/MissionWizard';

// Satellite catalog JSON — served from public/data/
const CATALOG_URL = '/data/satellites.json';

export function AppShell() {
  usePropagation();  // starts the RAF propagation loop

  const { loadCatalog, catalog, isLoading, selectedId } = useSatelliteStore();
  const { activePanel, setActivePanel, mode, setMode } = useUiStore();
  const { open: openMission } = useMissionStore();

  useEffect(() => {
    loadCatalog(CATALOG_URL);
  }, [loadCatalog]);

  // Toggle a panel: clicking its button again closes it
  const toggle = (panel: typeof activePanel) =>
    setActivePanel(activePanel === panel ? 'none' : panel);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#000' }}>

      {/* ── Top toolbar ────────────────────────────────────────────────────── */}
      <div style={toolbarStyle}>
        <span style={{ color: '#00d4ff', fontWeight: 700, letterSpacing: 2, fontSize: 14 }}>
          SATELLIER SIMULADOR
        </span>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {isLoading && (
            <span style={{ color: '#667', fontSize: 11 }}>Loading catalog…</span>
          )}
          {!isLoading && (
            <span style={{ color: '#4a7a', fontSize: 11 }}>
              {catalog.length.toLocaleString()} sats
            </span>
          )}

          {/* Mode toggle */}
          <button onClick={() => setMode(mode === 'educational' ? 'professional' : 'educational')}
                  style={btnStyle(false)}>
            {mode === 'educational' ? '🎓 Edu' : '⚙ Pro'}
          </button>

          {/* Panel buttons */}
          <button onClick={() => toggle('maneuver')}
                  style={btnStyle(activePanel === 'maneuver')}>
            Maneuvers
          </button>
          <button onClick={() => toggle('orbital')}
                  style={btnStyle(activePanel === 'orbital')}>
            Orbit
          </button>
          <button onClick={() => toggle('perturbation')}
                  style={btnStyle(activePanel === 'perturbation')}>
            Perturbations
          </button>
          <button onClick={() => toggle('groundtrack')}
                  style={btnStyle(activePanel === 'groundtrack')}>
            Ground Track
          </button>
          <button onClick={openMission}
                  style={{
                    ...btnStyle(false),
                    background: '#00d4ff18',
                    border: '1px solid #00d4ff55',
                    color: '#00d4ff',
                    fontWeight: 600,
                  }}>
            🚀 Misión
          </button>
        </div>
      </div>

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <Suspense fallback={<div style={{ color: '#fff', padding: 20 }}>Loading 3D engine…</div>}>
          <CesiumGlobe className="globe-fill" />
        </Suspense>

        {/* Search overlay (top-left) */}
        <SatelliteSearch />

        {/* Right-side panels */}
        {(activePanel === 'orbital' || (selectedId !== null && activePanel === 'none')) && (
          <div style={panelContainerStyle(280)}>
            <OrbitalElementsPanel />
          </div>
        )}

        {activePanel === 'maneuver' && (
          <div style={panelContainerStyle(280)}>
            <ManeuverPanel />
          </div>
        )}

        {activePanel === 'perturbation' && (
          <div style={panelContainerStyle(290)}>
            <PerturbationPanel />
          </div>
        )}

        {/* Ground Track — wider panel at bottom-right */}
        {activePanel === 'groundtrack' && (
          <div style={{
            position: 'absolute', right: 12, bottom: 64, zIndex: 10,
            width: 360,
            background: 'rgba(8, 14, 26, 0.95)',
            border: '1px solid #1e2d4a', borderRadius: 8,
            backdropFilter: 'blur(8px)',
          }}>
            <GroundTrack />
          </div>
        )}
      </div>

      {/* ── Bottom timeline ─────────────────────────────────────────────────── */}
      <TimeController />

      {/* ── Mission Designer wizard (portal-style overlay) ───────────────── */}
      <MissionWizard />
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const toolbarStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  background: '#060d1a', borderBottom: '1px solid #1e2d4a',
  padding: '0 16px', height: 40, flexShrink: 0,
};

const btnStyle = (active: boolean): React.CSSProperties => ({
  background: active ? '#00d4ff22' : 'transparent',
  border: `1px solid ${active ? '#00d4ff66' : '#1e2d4a'}`,
  color: active ? '#00d4ff' : '#a0b8d0',
  padding: '3px 10px', borderRadius: 4,
  cursor: 'pointer', fontSize: 11,
  transition: 'all 0.15s',
});

const panelContainerStyle = (width: number): React.CSSProperties => ({
  position: 'absolute', right: 12, top: 12, zIndex: 10,
  width,
  maxHeight: 'calc(100vh - 110px)',
  overflowY: 'auto',
  background: 'rgba(8, 14, 26, 0.92)',
  border: '1px solid #1e2d4a', borderRadius: 8,
  backdropFilter: 'blur(8px)',
});
