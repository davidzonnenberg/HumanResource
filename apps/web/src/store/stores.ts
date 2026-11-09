// Zustand stores bridging the Simulation to React UI (design: State bridge). Per-Tick data never
// lives in React state; R3F reads simBridge inside useFrame instead.
import { create } from 'zustand';
import type { ContextAction, ViewMode } from '@hr/sim';
import type { GameSpeed } from '../loop/gameSpeed';

export type Selection = { kind: 'business' | 'vehicle' | 'human' | 'plot' | 'customer'; id: string } | null;

export interface ClientAlert {
  key: string;
  textKey: string;
}

export interface Toast {
  id: number;
  textKey: string;
  params?: Record<string, string | number>;
}

interface HudState {
  gold: number; // hundredths
  alerts: { key: string; type: string; objectId: string; variant?: string }[];
  clientAlerts: ClientAlert[];
  contextAction: ContextAction | null;
  revealed: string[];
  toasts: Toast[];
  syncStatus: 'synced' | 'pending' | 'offline' | 'conflict' | 'tooLarge' | 'outdated' | 'deleted' | 'local';
  set(p: Partial<Omit<HudState, 'set' | 'pushToast' | 'dropToast' | 'setClientAlert'>>): void;
  pushToast(textKey: string, params?: Record<string, string | number>): void;
  dropToast(id: number): void;
  setClientAlert(key: string, textKey: string | null): void;
}

let toastSeq = 0;
export const useHud = create<HudState>((set, get) => ({
  gold: 0,
  alerts: [],
  clientAlerts: [],
  contextAction: null,
  revealed: [],
  toasts: [],
  syncStatus: 'local',
  set: (p) => set(p),
  pushToast: (textKey, params) => {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts.slice(-3), params ? { id, textKey, params } : { id, textKey }] });
  },
  dropToast: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
  setClientAlert: (key, textKey) => {
    const rest = get().clientAlerts.filter((a) => a.key !== key);
    set({ clientAlerts: textKey ? [...rest, { key, textKey }] : rest });
  },
}));

interface UiState {
  viewMode: ViewMode;
  cameraDistance: number;
  selection: Selection;
  pickingSlot: { kind: 'business' | 'vehicle'; id: string; slotId: string } | null;
  dialog: { kind: 'resumeRoute'; vehicleId: string } | { kind: 'syncConflict'; slotId: string } | { kind: 'slotDeleted'; slotId: string } | null;
  pauseMenuOpen: boolean;
  financeOpen: boolean;
  set(p: Partial<Omit<UiState, 'set'>>): void;
}

export const useUi = create<UiState>((set) => ({
  viewMode: 'ceo',
  cameraDistance: 16,
  selection: null,
  pickingSlot: null,
  dialog: null,
  pauseMenuOpen: false,
  financeOpen: false,
  set: (p) => set(p),
}));

interface SessionState {
  gameSpeed: GameSpeed;
  speedPaused: boolean;
  devTesting: boolean; // Pause_Menu "Testing" toggle (per device)
  physicsFailed: boolean;
  set(p: Partial<Omit<SessionState, 'set'>>): void;
}

export const useSession = create<SessionState>((set) => ({
  gameSpeed: 1,
  speedPaused: false,
  devTesting: false,
  physicsFailed: false,
  set: (p) => set(p),
}));

/** Bumped at most 5 times per real second; Panels subscribe to it to refresh (design: simBridge). */
export const useSimVersion = create<{ v: number; bump(): void }>((set, get) => ({ v: 0, bump: () => set({ v: get().v + 1 }) }));
