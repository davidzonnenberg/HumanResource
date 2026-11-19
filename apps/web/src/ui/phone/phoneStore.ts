// CEO Phone session store (ceo-phone Requirement 4.11): Zustand wrapper around the pure reducers in
// phoneNav.ts. Like game speed it lives only in the web session: never in SimState, never saved.
// Also holds the badge "seen" markers (7.3) and the notification ring (6.2).
import { create } from 'zustand';
import { initialNav, navBack, navHome, navOpen, navRecents, navSetDialog, navSetOpen, navSetTab, navToggleShade, type AppId, type PhoneNav } from './phoneNav';
import { addNotification, type PhoneNotification } from './phoneNotifications';

interface PhoneStore extends PhoneNav {
  /** Alert keys already seen per app; the badge counts only Alerts outside this list. */
  badgeSeen: Record<AppId, string[]>;
  notifications: PhoneNotification[];
  toggle(): void;
  setOpen(open: boolean): void;
  openApp(app: AppId, opts?: { tab?: string; id?: string }): void;
  back(): void;
  home(): void;
  showRecents(): void;
  setTab(app: AppId, tab: string): void;
  toggleShade(): void;
  openShade(): void;
  closeShade(): void;
  setDialog(dialog: string | null): void;
  markSeen(app: AppId, keys: string[]): void;
  pushNotification(n: Omit<PhoneNotification, 'id'>): void;
  clearNotifications(): void;
  reset(): void;
}

const pick = (s: PhoneStore): PhoneNav => ({ open: s.open, stack: s.stack, lastTab: s.lastTab, shadeOpen: s.shadeOpen, recents: s.recents, dialog: s.dialog });

let nextNotificationId = 1;

export const usePhone = create<PhoneStore>((set, get) => {
  const apply = (f: (n: PhoneNav) => PhoneNav) => set(f(pick(get())));
  return {
    ...initialNav(),
    badgeSeen: {},
    notifications: [],
    toggle: () => apply((n) => navSetOpen(n, !n.open)),
    setOpen: (open) => apply((n) => navSetOpen(n, open)),
    openApp: (app, opts) => apply((n) => navOpen(n, app, opts)),
    back: () => apply(navBack),
    home: () => apply(navHome),
    showRecents: () => apply(navRecents),
    setTab: (app, tab) => apply((n) => navSetTab(n, app, tab)),
    toggleShade: () => apply(navToggleShade),
    openShade: () => apply((n) => ({ ...n, shadeOpen: true })),
    closeShade: () => apply((n) => ({ ...n, shadeOpen: false })),
    setDialog: (d) => apply((n) => navSetDialog(n, d)),
    markSeen: (app, keys) => set((s) => ({ badgeSeen: { ...s.badgeSeen, [app]: keys } })),
    pushNotification: (n) => set((s) => ({ notifications: addNotification(s.notifications, { ...n, id: nextNotificationId++ }) })),
    clearNotifications: () => set({ notifications: [] }),
    reset: () => set({ ...initialNav(), badgeSeen: {}, notifications: [] }),
  };
});
