// CEO Phone session store (ceo-phone Requirement 4.11): Zustand wrapper around the pure reducers in
// phoneNav.ts. Like game speed it lives only in the web session: never in SimState, never saved.
import { create } from 'zustand';
import { initialNav, navBack, navHome, navOpen, navRecents, navSetDialog, navSetOpen, navSetTab, navToggleShade, type AppId, type PhoneNav } from './phoneNav';

interface PhoneStore extends PhoneNav {
  toggle(): void;
  setOpen(open: boolean): void;
  openApp(app: AppId, opts?: { tab?: string; id?: string }): void;
  back(): void;
  home(): void;
  showRecents(): void;
  setTab(app: AppId, tab: string): void;
  toggleShade(): void;
  closeShade(): void;
  setDialog(dialog: string | null): void;
  reset(): void;
}

const pick = (s: PhoneStore): PhoneNav => ({ open: s.open, stack: s.stack, lastTab: s.lastTab, shadeOpen: s.shadeOpen, recents: s.recents, dialog: s.dialog });

export const usePhone = create<PhoneStore>((set, get) => {
  const apply = (f: (n: PhoneNav) => PhoneNav) => set(f(pick(get())));
  return {
    ...initialNav(),
    toggle: () => apply((n) => navSetOpen(n, !n.open)),
    setOpen: (open) => apply((n) => navSetOpen(n, open)),
    openApp: (app, opts) => apply((n) => navOpen(n, app, opts)),
    back: () => apply(navBack),
    home: () => apply(navHome),
    showRecents: () => apply(navRecents),
    setTab: (app, tab) => apply((n) => navSetTab(n, app, tab)),
    toggleShade: () => apply(navToggleShade),
    closeShade: () => apply((n) => ({ ...n, shadeOpen: false })),
    setDialog: (d) => apply((n) => navSetDialog(n, d)),
    reset: () => set(initialNav()),
  };
});
