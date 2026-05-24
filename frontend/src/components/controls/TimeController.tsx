/**
 * Simulation time control bar: play/pause, speed multiplier, date display, jump-to-now.
 */

import { useSimulationStore } from '../../store/simulationStore';

const SPEED_PRESETS = [0.1, 1, 10, 60, 600, 3600, 86400];

function unixToDisplay(unix: number): string {
  return new Date(unix * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export function TimeController() {
  const { simTimeUnix, speedMultiplier, paused, togglePaused, setSpeed, jumpToNow } =
    useSimulationStore();

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: '#0a0f1a', borderTop: '1px solid #1e2d4a',
      padding: '6px 16px', userSelect: 'none', fontSize: 13,
      color: '#c8d8f0',
    }}>
      {/* Play/Pause */}
      <button
        onClick={togglePaused}
        style={{
          background: 'transparent', border: '1px solid #2a4a6a',
          color: paused ? '#00d4ff' : '#4fc',
          padding: '4px 12px', cursor: 'pointer', borderRadius: 4,
        }}
      >
        {paused ? '▶ Play' : '⏸ Pause'}
      </button>

      {/* Speed presets */}
      <div style={{ display: 'flex', gap: 4 }}>
        {SPEED_PRESETS.map((s) => {
          const label = s < 60
            ? `${s}×`
            : s < 3600
            ? `${s / 60}min/s`
            : `${s / 3600}h/s`;
          return (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              style={{
                background: speedMultiplier === s ? '#00d4ff22' : 'transparent',
                border: `1px solid ${speedMultiplier === s ? '#00d4ff' : '#2a4a6a'}`,
                color: '#a0b8d0',
                padding: '2px 7px', cursor: 'pointer', borderRadius: 3, fontSize: 11,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Simulation clock */}
      <div style={{ fontFamily: 'monospace', color: '#00d4ff', letterSpacing: 1, fontSize: 12 }}>
        {unixToDisplay(simTimeUnix)}
      </div>

      {/* Jump to now */}
      <button
        onClick={jumpToNow}
        style={{
          background: 'transparent', border: '1px solid #2a4a6a',
          color: '#a0b8d0', padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 11,
        }}
      >
        Now
      </button>
    </div>
  );
}
