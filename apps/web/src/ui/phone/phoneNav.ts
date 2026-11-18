// CEO Phone navigation rules (ceo-phone Requirement 4). Pure reducers over a plain value so they
// can be property-tested without React. Session state only: never in SimState, never saved.

export type AppId = string;

export type PhoneScreen = { kind: 'home' } | { kind: 'recents' } | { kind: 'app'; app: AppId; tab?: string; id?: string };

export interface PhoneNav {
  open: boolean;
  /** stack[0] is always Home. */
  stack: PhoneScreen[];
  lastTab: Record<AppId, string>;
  shadeOpen: boolean;
  /** Newest first, unique, at most MAX_RECENTS. */
  recents: AppId[];
  /** An open in-phone dialog; Back closes it before popping a screen. */
  dialog: string | null;
}

export const MAX_STACK = 12;
export const KEEP_AFTER_CAP = 6;
export const MAX_RECENTS = 5;
const HOME: PhoneScreen = { kind: 'home' };

export function initialNav(): PhoneNav {
  return { open: false, stack: [HOME], lastTab: {}, shadeOpen: false, recents: [], dialog: null };
}

function capped(stack: PhoneScreen[]): PhoneScreen[] {
  return stack.length > MAX_STACK ? [HOME, ...stack.slice(-KEEP_AFTER_CAP)] : stack;
}

const top = (n: PhoneNav): PhoneScreen => n.stack[n.stack.length - 1] ?? HOME;

/** Opens an app (and opens the phone). No duplicate push when the same app screen is on top. */
export function navOpen(n: PhoneNav, app: AppId, opts: { tab?: string; id?: string } = {}): PhoneNav {
  const t = top(n);
  const lastTab = opts.tab !== undefined ? { ...n.lastTab, [app]: opts.tab } : n.lastTab;
  const recents = [app, ...n.recents.filter((x) => x !== app)].slice(0, MAX_RECENTS);
  const sameOnTop = t.kind === 'app' && t.app === app && t.id === opts.id;
  let stack = n.stack;
  if (sameOnTop) {
    if (opts.tab !== undefined && t.kind === 'app') stack = [...n.stack.slice(0, -1), { ...t, tab: opts.tab }];
  } else {
    const tab = opts.tab ?? n.lastTab[app];
    const screen: PhoneScreen = { kind: 'app', app, ...(tab !== undefined ? { tab } : {}), ...(opts.id !== undefined ? { id: opts.id } : {}) };
    stack = capped([...n.stack, screen]);
  }
  return { ...n, open: true, stack, lastTab, recents, shadeOpen: false };
}

/** Back: shade → dialog → pop → close the phone when on Home. */
export function navBack(n: PhoneNav): PhoneNav {
  if (n.shadeOpen) return { ...n, shadeOpen: false };
  if (n.dialog !== null) return { ...n, dialog: null };
  if (n.stack.length > 1) return { ...n, stack: n.stack.slice(0, -1) };
  return { ...n, open: false };
}

export function navHome(n: PhoneNav): PhoneNav {
  return { ...n, stack: [HOME], shadeOpen: false, dialog: null };
}

export function navRecents(n: PhoneNav): PhoneNav {
  if (top(n).kind === 'recents') return { ...n, shadeOpen: false };
  return { ...n, stack: capped([...n.stack, { kind: 'recents' }]), shadeOpen: false };
}

export function navSetTab(n: PhoneNav, app: AppId, tab: string): PhoneNav {
  const t = top(n);
  const stack = t.kind === 'app' && t.app === app ? [...n.stack.slice(0, -1), { ...t, tab }] : n.stack;
  return { ...n, stack, lastTab: { ...n.lastTab, [app]: tab } };
}

export function navToggleShade(n: PhoneNav): PhoneNav {
  return { ...n, shadeOpen: !n.shadeOpen };
}

export function navSetDialog(n: PhoneNav, dialog: string | null): PhoneNav {
  return { ...n, dialog };
}

export function navSetOpen(n: PhoneNav, open: boolean): PhoneNav {
  return open ? { ...n, open: true } : { ...n, open: false, shadeOpen: false, dialog: null };
}

export const topScreen = top;
