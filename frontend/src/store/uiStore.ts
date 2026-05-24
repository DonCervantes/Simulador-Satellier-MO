import { create } from 'zustand';

type AppMode   = 'educational' | 'professional';
type Language  = 'es' | 'en';
type ActivePanel = 'none' | 'orbital' | 'maneuver' | 'perturbation' | 'groundtrack';

interface UiStore {
  mode:        AppMode;
  language:    Language;
  activePanel: ActivePanel;
  showPerfStats: boolean;
  setMode:         (m: AppMode) => void;
  setLanguage:     (l: Language) => void;
  setActivePanel:  (p: ActivePanel) => void;
  togglePerfStats: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  mode:          'educational',
  language:      'es',
  activePanel:   'none',
  showPerfStats: false,
  setMode:         (mode)        => set({ mode }),
  setLanguage:     (language)    => set({ language }),
  setActivePanel:  (activePanel) => set({ activePanel }),
  togglePerfStats: ()            => set((s) => ({ showPerfStats: !s.showPerfStats })),
}));
