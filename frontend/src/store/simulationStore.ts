import { create } from 'zustand';

interface SimulationState {
  simTimeUnix:  number;   // current simulation time (Unix seconds)
  speedMultiplier: number; // 1 = real-time, 100 = 100× faster
  paused:       boolean;
  setSimTime:   (t: number) => void;
  setSpeed:     (s: number) => void;
  setPaused:    (p: boolean) => void;
  togglePaused: () => void;
  jumpToNow:    () => void;
}

export const useSimulationStore = create<SimulationState>((set) => ({
  simTimeUnix:     Date.now() / 1000,
  speedMultiplier: 1,
  paused:          false,
  setSimTime:  (t) => set({ simTimeUnix: t }),
  setSpeed:    (s) => set({ speedMultiplier: s }),
  setPaused:   (p) => set({ paused: p }),
  togglePaused:    () => set((state) => ({ paused: !state.paused })),
  jumpToNow:       () => set({ simTimeUnix: Date.now() / 1000 }),
}));
