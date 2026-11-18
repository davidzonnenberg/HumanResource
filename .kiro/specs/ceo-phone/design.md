# Design Document: CEO Phone

## Overview

The CEO Phone is a React overlay in `apps/web` that sits above the R3F canvas, next to the existing HUD and Panels. It has three parts:
- a session navigation store (`phoneStore`, Zustand like the other stores)
- a shell (frame, status bar, screen area, nav bar, Shade)
- apps rendered from a data registry (`packages/content/data/ui/apps.json`)

Remote actions reuse `panelActions.ts`. Presence actions show a Drive-there row. The phone shell (tasks 1–4) does not touch the Simulation. Simulation prerequisites are separate tasks (S1–S4), each with its own schema bump.

This spec replaces human-resource-mvp tasks 56 and 59. The Waypoint stays in human-resource-mvp task 57: ceo-phone uses it, and DriveThereButton shows a toast until 57 exists. Decisions D1–D8 are applied (see `requirements.md`).

## Architecture

```
App.tsx
 └─ GameScreen
     ├─ <Scene/>            (R3F canvas, unchanged)
     ├─ <Hud/>              (+ phone button; deep links in task 2)
     ├─ <PanelHost/>        (unchanged, still works)
     ├─ <PauseMenu/>, <GameDialogs/>  (unchanged)
     └─ <Phone/>            NEW: ui/phone/Phone.tsx (renders nothing while closed)
```

- **Data in:** throttled selectors (`useSimVersion` at 5 Hz, `useSimSelector`) and `useHud` (gold, alerts, revealed). No per-Tick values go into React state.
- **Commands out:** `panelActions.ts` helpers, so rejections are toasted by `simBridge` as today.
- **Phone state:** `phoneStore` (session) and `phoneSettings` (per device, IndexedDB). Neither touches `SimState`.

### Package placement (architecture.md)

| Piece | Package | Why |
|---|---|---|
| `ui/apps.json` | `packages/content/data/ui/` (exported as `phoneApps` from `@hr/content`) | content is JSON only |
| apps.json zod schema | `apps/web/src/ui/phone/appsSchema.ts` | UI-only data, so the sim must not know about apps. `zod` 4.6.7 is added to `apps/web/package.json`, the exact version the other packages pin. |
| phoneStore, settings, components | `apps/web/src/ui/phone/` | web layer |
| reveal check | `useHud.revealed` (features, filled by `simBridge.publish`) | read-only, no sim change |

## Components and Interfaces

```
apps/web/src/ui/phone/
  Phone.tsx            frame, status bar, screen switch, nav bar, side-panel layout, focus handling, edge swipe
  phoneNav.ts          pure navigation reducers (property-tested)
  phoneStore.ts        Zustand wrapper around phoneNav (session)
  phoneSettings.ts     settings store + load/save (IndexedDB meta store)
  phoneKeys.ts         phone key routing (pure decision function + handler)
  appsSchema.ts        zod schema + validated registry
  installedApps.ts     installedApps(features, registry, revealAll) – pure
  elapsed.ts           formatElapsed(ticks, tps), formatRemaining(ticks, tps) – pure
  HomeScreen.tsx       elapsed widget, money widget, quest placeholder, grid, dock
  AppShell.tsx         top app bar + body + bottom tabs
  RecentsScreen.tsx    recent app cards
  NotificationShade.tsx  (task 2)
  components/
    Switch.tsx  Segmented.tsx  Stepper.tsx  DriveThereButton.tsx
    (later) Slider.tsx  Sparkline.tsx
  apps/
    SettingsApp.tsx    (task 1)
    NewsApp.tsx        (task 1: LinkedOut, reads state.news)
    PintlyApp.tsx …    (later tasks)
```

- **Phone.tsx.**
  - Root `<div class="phone" data-theme data-text data-motion>` with the theme CSS variables. The frame is tinted with `ownerColor('player')`.
  - Status bar, a button that toggles the Shade:
    - `formatElapsed(state.tick)`, for example "1h 23m"
    - the current Game_Speed icon (⏸ / 1× / 2× / 4× from `useSession`)
    - the DND icon while DND is on
    - a decorative battery
  - Screen area with `aria-live="polite"`: Home, Recents or AppShell, chosen by the top of the stack.
  - Nav bar: Back, Home and Recents (44 px).
- **AppShell.tsx.**
  - Top bar: Back ← plus `t(app.nameKey)`.
  - Body: `APP_BODIES[app.id]`, a map from app id to component.
  - Tab bar from `app.tabs`: 2–4 tabs, with an icon pill and `aria-current` on the active one.
- **HomeScreen.tsx.**
  - Widgets: elapsed time; money, with `goldToWholeFloor(useHud.gold).toLocaleString()` (the HUD formatter), which taps to Ledgr only when installed; quest placeholder, not activatable.
  - Grid: installed apps without a dock number, by `order`.
  - Dock: installed apps with a dock number, by that number. Settings is always docked.
- **RecentsScreen.tsx:** `recents` mapped to installed apps, as large cards. Uninstalled or unknown entries are skipped.
- **Controls:**
  - `Switch` (`role="switch"`, `aria-checked`).
  - `Segmented` (`role="group"`, `aria-pressed` per option).
  - `Stepper` (− / value / +, clamped to `min`/`max` by `step`).
  - `DriveThereButton`. Until human-resource-mvp task 57 exists it calls `pushToast('phone.driveThere.toast', {target})` and closes the phone.
- **Styling.** CSS in `styles.css` under `.phone`:
  - light `--bg #f6f2fb --card #fff --fg #1c1b1f --mut #6b6875 --acc #d9480f --chip #ece6f3`
  - dark `--bg #121116 --card #1f1d25 --fg #ece9f1 --mut #a7a2b3 --acc #ff8a3d --chip #2c2934`
  - `--neg #e03131 --pos #2f9e44`
  - Radii and sizes follow the mockup: frame radius 42/32, cards radius 18, rows min 44 px, tab bar 58 px.
  - Text size S/M/L = 13/14/16 px.

## Data Models

### apps.json and schema

```ts
// apps/web/src/ui/phone/appsSchema.ts
const tabSchema = z.object({ id: z.string().min(1), labelKey: z.string().min(1), icon: z.string().min(1) });
export const appSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/).refine((id) => id !== 'rotate'),  // 'app.rotate' is an existing key
  nameKey: z.string().min(1),
  icon: z.string().min(1),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  revealFeature: z.string().min(1).nullable(),   // a reveal FEATURE name; null = always installed
  tabs: z.array(tabSchema).max(4),
  dock: z.number().int().nonnegative().nullable(),
  order: z.number().int(),
});
export const appsSchema = z.array(appSchema).superRefine(/* unique app ids, unique dock numbers, unique tab ids per app */);
```

- **Task 1 apps.json:**
  - `set`: Settings, `revealFeature: null`, docked.
  - `news`: LinkedOut, `revealFeature: "news_feed"`, which already exists in `phase2/reveal-triggers.json` (trigger `first_news`).
  - No other apps, and no new reveal triggers.
- **Installed rule:** `installedApps(features, registry, revealAll)` returns `registry.filter(a => revealAll || a.revealFeature === null || features.includes(a.revealFeature))`, sorted by `order`.
  - `features = useHud.revealed`, which `simBridge.publish` fills with the revealed feature names. So the phone sees exactly what `isRevealed()` sees.
  - `revealAll = devModeOn() && devRevealAllApps`. The second flag is a Settings Developer toggle stored with the phone settings. In task 1 it is only reachable in Dev_Mode.

### phoneStore

```ts
export type AppId = string;
export type PhoneScreen =
  | { kind: 'home' }
  | { kind: 'recents' }
  | { kind: 'app'; app: AppId; tab?: string; id?: string };

export interface PhoneNav {
  open: boolean;
  stack: PhoneScreen[];              // stack[0] is always { kind: 'home' }
  lastTab: Record<AppId, string>;
  shadeOpen: boolean;
  recents: AppId[];                  // ≤ 5, newest first, unique
  dialog: string | null;             // an open in-phone dialog (Back closes it first)
}
// phoneStore = PhoneNav + actions: toggle, setOpen, openApp(app, {tab?, id?}), back, home, showRecents,
// setTab, toggleShade, closeShade, setDialog, reset
```

The pure reducers in `phoneNav.ts` (`navOpen`, `navBack`, …) take a `PhoneNav` and return a new one:
- **open:**
  - Skip the push when the top is the same `{app, id}`. Otherwise push `{kind:'app', app, tab: opts.tab ?? lastTab[app], id}`.
  - Set `lastTab[app]` when a tab is given.
  - `recents = [app, ...recents.filter(x => x !== app)].slice(0, 5)`.
  - `shadeOpen = false`, `open = true`.
- **cap:** after a push, `if (stack.length > 12) stack = [home, ...stack.slice(-6)]`.
- **back:** shade → dialog → pop → (on Home) `open = false`.
- **home:** `stack = [home]`, shade closed.
- **recents:** push `{kind:'recents'}` unless it is already on top. The same cap applies.
- **setTab:** sets `lastTab[app]` and the tab of the top screen if that screen is that app.
- **Not persisted.** `reset()` runs from `attachSimulation` (new Save_Slot). The store is never saved.

### Phone_Settings

```ts
interface PhoneSettings {
  darkMode: 'system' | 'light' | 'dark';     // default 'system' → prefers-color-scheme
  textSize: 's' | 'm' | 'l';                 // default 'm'
  reducedMotion: 'system' | 'on' | 'off';    // default 'system' → prefers-reduced-motion
  dnd: boolean;                              // default false
  questPings: boolean;                       // default true
  devRevealAllApps: boolean;                 // default false; only shown in Dev_Mode
}
```

- Stored per device in IndexedDB through `getServices()?.repo.store` (`meta` store, key `phoneSettings:<profileId>`), the same mechanism as `devTesting`.
- Loaded when a profile's game starts, and validated with a zod schema. Missing or invalid settings fall back to the defaults (12.7).
- Saved on every change. Never written to `SimState` or to the Save_Document.

### Notifications and badges (task 2)

- **Notifications** are derived in the web layer:
  - from `useHud.alerts` and `onDomainEvents` (`revealFired` gives "app installed")
  - kept in a session ring of the last 20 in `phoneNotifications.ts`
  - DND filters the display only
- **Badges:** the count of active alerts whose type maps to the app, minus `badgeSeen[app]`, clamped at ≥ 0. The mapping is an optional `alertTypes: string[]` per app in apps.json. "Fix" targets come from an optional `fix: {app, tab?}` per alert type in data.

### Remote vs. presence

- Actions shown by apps carry `access: 'remote' | 'presence'` in data. Presence rows render `DriveThereButton`.
- The Simulation enforces presence (`reason.not_present`) in Simulation task S4.

## Input and focus

- **Phone_Focus** = the Phone is open and `document.activeElement` is inside the phone root.
  - Opening the phone focuses the first control.
  - Clicking the canvas moves focus out while the phone stays open. Clicking into the phone gives focus back.
- **`input/keyboard.ts` changes**, routed through `phoneKeys.ts`:
  - `q` (not in a text field) toggles the phone anywhere, unless it is blocked by driving.
  - With Phone_Focus, `phoneKeyAction(key, shift)` maps:
    - `escape`/`backspace` → back, `h` → home, `r` → recents, `n` → shade
    - `tab` → next/previous tab
    - arrows/WASD → focus move
  - `Enter` and `Space` are left to the focused button's native activation.
  - Every captured key (WASD, arrows, `tab`, `enter`, `space`, `escape`, `e`, `v`, `h`, `r`, `n`, `backspace`) returns before the game handlers run. Movement keys are therefore never added to `inputState.keys`, so the CEO doesn't move and the van doesn't steer.
  - `p`, `q` and the speed keys `1 2 3 0 [ ]` fall through to the game handlers.
  - Without Phone_Focus, `h r n backspace` do nothing.
- **On phone open:** `inputState.keys.clear()` and `recomputeMove()`, so a held key stops the CEO.
- **Driving:** `canOpenPhone(state, reg)` returns true unless the CEO drives a vehicle whose `pose.speed ≥ reg.config.stoppedSpeed`.
  - A blocked open shows the toast `phone.toast.stopFirst`.
  - `Phone.tsx` closes the phone at the 5 Hz version tick when the van starts moving.
- **Touch:** the phone button sits in the HUD's right column, outside the left joystick zone. An edge swipe right from the phone's left edge calls `back()`.

## Layout

- **One layout for PC and landscape phones:** `position: fixed; right: 12px; top: 12px; bottom: 12px; width: min(40vw, calc((100vh - 24px) × 9 / 19.5))`.
  - There is no bottom sheet and no full-screen drag (D1, D2).
  - Portrait keeps the existing rotate prompt. The phone is hidden there via the existing portrait media query.
  - The joystick zone is the left 40%, so the right-docked phone never overlaps it.

## Correctness Properties

### Property 1: Phone stack invariants
FOR ALL sequences of nav actions (open, back, home, recents, setTab, toggleShade, setDialog), after every action:
- `stack[0].kind === 'home'`
- `stack.length ≤ 12`
- `recents.length ≤ 5`, with no duplicates in `recents`

App ids are drawn from the registry, including apps with `revealFeature: null` (Settings), plus arbitrary ids. **Validates: Requirements 4.3, 4.7, 4.10**

### Property 2: Open is idempotent on top
FOR ALL states, apps and ids, `open(a, {id})` twice in a row gives the same stack as once.
**Validates: Requirement 4.2**

### Property 3: Installed apps follow reveals
FOR ALL registries (including apps with `revealFeature: null`) and revealed-feature sets, `installedApps` returns exactly the apps with `revealFeature === null` or a revealed feature, sorted by `order`. With `revealAll` it returns every app.
**Validates: Requirements 2.4, 2.6, 3.4, 3.9**

## Error Handling

| Case | Behaviour |
|---|---|
| apps.json invalid | the content test fails in CI; at runtime invalid entries are dropped with a console warning and Settings stays available |
| Unknown app id in `open()` (stale recent or deep link) | not pushed; recents entries for unknown or uninstalled apps are skipped when rendering |
| Stored settings missing or invalid | defaults used, no error shown |
| Phone opened while driving at speed | not opened, toast `phone.toast.stopFirst` |
| New Save_Slot attached | phoneStore reset to closed + `[home]` |

## Testing Strategy

- `apps/web/test/phoneStore.test.ts`:
  - unit tests for open, back order, home, recents, the cap, lastTab per app, no duplicate push
  - Property 1 (≥ 100 runs, tag `// Feature: ceo-phone, Property 1: phone stack invariants`) and Property 2
- `apps/web/test/phoneApps.test.ts`:
  - the schema passes
  - `nameKey`/`labelKey` exist in `en.json`
  - every non-null `revealFeature` is a known feature, collected from every trigger's `reveals` of the loaded registry
  - Property 3
- `apps/web/test/phoneInput.test.ts`: `phoneKeyAction` and `canOpenPhone`, both pure.
- `apps/web/test/content.test.ts`: add the `phone` prefix to the quoted-key list.
- Run from the repo root: `npm.cmd run typecheck`, `npx.cmd eslint .`, `npm.cmd run build`, and `node .\node_modules\vitest\vitest.mjs run` as a background process.
