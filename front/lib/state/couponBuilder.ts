import { create } from 'zustand';

export type CouponSelection = {
  id: string;
  selection: string;
  fixtureLabel?: string;
  odd: number;
  confidence: number;
  edge: number;
  riskFlags: string[];
};

type CouponState = {
  selections: CouponSelection[];
  stake: number;
  mode: 'fixed' | 'kelly';
  setStake: (stake: number) => void;
  toggleMode: () => void;
  addSelection: (selection: CouponSelection) => void;
  removeSelection: (id: string) => void;
};

export const useCouponBuilderStore = create<CouponState>((set, get) => ({
  selections: [],
  stake: 100,
  mode: 'fixed',
  setStake: (stake) => set({ stake }),
  toggleMode: () => set((state) => ({ mode: state.mode === 'fixed' ? 'kelly' : 'fixed' })),
  addSelection: (selection) =>
    set((state) => {
      if (state.selections.length >= 4 || state.selections.find((item) => item.id === selection.id)) {
        return state;
      }
      return { selections: [...state.selections, selection] };
    }),
  removeSelection: (id) =>
    set((state) => ({
      selections: state.selections.filter((item) => item.id !== id)
    }))
}));
