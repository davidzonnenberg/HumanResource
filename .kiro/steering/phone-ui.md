---
inclusion: auto
name: phone-ui
description: Read before implementing or changing the CEO Phone UI (phone shell, apps, notification shade, Settings app, "Drive there" waypoints, desk screens) of Human Resource.
---

# CEO Phone UI – design guide

This guide **adds to** `architecture.md`. If anything here conflicts with a requirement in `.kiro/specs/`, the requirement wins: stop and tell the user.

Visual and navigation reference: `docs/mockups/ceo-phone.html`. Open it in a browser and click through it. It is a **reference, not code to copy**: it uses string literals, innerHTML and fake numbers. Rebuild it as React components that follow the rules below.

## 1. Concept

- The CEO's phone is the main management UI. It replaces most separate panels over time.
- **Looking is free, small changes are remote, big decisions are in person.**
  - `remote` actions (toggles, − / +, segmented choices) send a Command immediately.
  - `presence` actions show a 📍 row with a **Drive there** button. The sim enforces presence and rejects with `reason.not_present` when the CEO isn't at the building.
- Each reveal **installs an app** (toast `toast.app_installed`, icon bounce). The home grid only shows revealed apps.

## 2. Three UI layers

| Layer | When | Contents |
|---|---|---|
| HUD | Always | Money pill (Gold, Gold per hour, loan chip), quest tracker, alert bell, context button, phone button |
| Phone | Always; while driving only when the van is stopped | Apps, overview, remote settings |
| Desk | Only inside an office building (Bank, Municipality, Supplier, Job centre) | Service cards with hold-to-confirm, via `useService` |

## 3. Phone anatomy

Top to bottom:

1. **Status bar**:
   - elapsed game time derived from the Tick (for example "1h 23m"), the current Game_Speed icon, the DND icon and a decorative battery
   - tapping it opens the notification shade
   - there is no clock and there are no days, because time of day is out of scope
   - deadlines are shown as remaining game time ("in 3m 40s")
2. **Screen**: Home, an App, or Recents.
3. **System nav bar**: Back ◀, Home ●, Recents ■.

**Home:**
- an elapsed-time widget
- a money widget, which taps to Ledgr once Ledgr is installed
- a quest widget, which taps to To-Do™ once installed and is a placeholder until then
- a 4-column app grid
- a dock

The dock shows **installed apps only**, with no empty slots, ordered by `dock: number | null` in apps.json. Settings is always in it.

**App screen:** top app bar (← title, optional 🔍/⋮), scrolling body of Cards, optional bottom tabs (2–4, Material 3 style with an icon pill on the active tab).

**Notification shade:** quick tiles (DND, Dark mode, Haptics, Settings) + notification cards. Tapping a card deep-links into its app. With DND on it shows "Silenced", but the HUD bell still shows alerts.

**Recents:** the last 5 opened apps as large cards.

## 4. Navigation rules

One screen stack in `phoneStore` (web session state, like game speed; never in `SimState`).

- `open(appId, {tab?, id?})` pushes the app (no duplicate if already on top), records recents (max 5, newest first), clears that app's badge-seen marker, closes the shade.
- **Back** order: shade → open dialog → detail page → previous screen. On Home, Back closes the phone.
- **Home** resets the stack to `['home']`.
- Stack cap: 12. When exceeded keep `home` + the last 6.
- Each app remembers its last tab (`lastTab[appId]`).
- Detail pages (a Human, a van, a pub when the player owns > 1) are pushed screens: `{app:'staff', id:'hum_3'}`.
- **Drive there** sets the waypoint (web-only, path from `pathCacheFor`, drawn as road arrows) and closes the phone.
- **Deep links:** HUD money pill → Ledgr; quest tracker → To-Do™; alert "Fix" → the owning app + tab + id; notification → its app. All through `phone.open(...)`.

### Input

| Action | Touch | Keyboard (only while the phone has focus) |
|---|---|---|
| Open / close phone | Phone button | `Q` |
| Back | ◀ or edge swipe | `Esc` / `Backspace` |
| Home | ● | `H` |
| Recents | ■ | `R` |
| Shade | Tap or swipe down on the status bar | `N` |
| Switch tab | Tap tab | `Tab` / `Shift+Tab` |
| Activate / Drive there | Tap | `Enter` / `Space` |

- While the phone has focus, it **captures** WASD/arrows, Tab, Enter, Space and Esc.
  - WASD and arrows move focus instead of the CEO.
  - Tab switches phone tabs, so the human-resource-mvp 18.6 rule that Tab cycles world objects is suspended while the phone is focused.
  - `Q` and `P` keep working.
  - Don't use number keys: 1/2/3/0/[ ] are game speed and keep working.
- Every target ≥ 44×44 CSS px, visible focus ring, `aria-live="polite"` on the screen area, switches use `role="switch"` + `aria-checked`.

## 5. Layout per device

- **PC and landscape phones:** a side panel docked right, full height minus margins, **max 40% of the screen width**, at phone proportions where the width allows (≈ 9:19.5).
  - There is no bottom sheet and no full-screen drag. The phone never exceeds the 40% rule (architecture.md, human-resource-mvp 18.7 / 71.11).
  - Portrait already shows the rotate prompt.
  - The joystick stays on the left, so the phone never covers it.
- Theme follows Settings → Dark mode (default: `prefers-color-scheme`). Phone frame/case tinted in the player's owner colour.
- Colours (CSS variables, from the mockup): light `--bg #f6f2fb --card #fff --fg #1c1b1f --mut #6b6875 --acc #d9480f --chip #ece6f3`; dark `--bg #121116 --card #1f1d25 --fg #ece9f1 --mut #a7a2b3 --acc #ff8a3d --chip #2c2934`. Bottleneck/negative = `#e03131`, positive = `#2f9e44`.

## 6. Apps

| id | Name key | Reveal feature | Tabs | Remote | Presence |
|---|---|---|---|---|---|
`revealFeature` is always a reveal **feature**, an entry in a trigger's `reveals` list, never a trigger id.

- **Naming.** App features are named `app_<id>`, for example `app_pintly`. The feature is added to the `reveals` list of the installing trigger in the task that builds the app.
- **Reuse.** An app may reuse an existing feature when one fits. LinkedOut uses `news_feed`.

| id | Name key | Feature (installing trigger) | Tabs | Remote | Presence |
|---|---|---|---|---|---|
| `todo` | To-Do™ | `app_todo` (start) | Main · Side · Requests | Track quest | Each located step |
| `map` | Wayfindr | `app_map` (start) | — (layer segment) | Layer, waypoint | — |
| `pint` | Pintly | `app_pintly` (`license_granted`) | Status · Dials · Visit | Open/closed, price, pace, reorder threshold | Service style, fit-out, license tier |
| `ledgr` | Ledgr | `app_ledgr` (`loan_taken`) | Overview · Loan | — | Pay off early, refinance |
| `staff` | Staffly | `app_staffly` (`first_hire`) | list → detail | Pay, pace, fire | Interview, hire |
| `van` | Vanly | `app_vanly` (`supplier_deal`) | list → detail | Route, orders | Take the wheel |
| `news` | LinkedOut | `news_feed` (`first_news`, existing) | — | — | — |
| `gem` | MijnGemeente | `app_gemeente` (`first_permit_offer`) | Permits · Requests · Votes | Vote, lobby | Apply for permit |
| `set` | Settings | `null` (always) | sections | everything | — |

- **apps.json lists only apps that are built.** Each later task adds its own app entry together with its feature and trigger. The content test stays strict: every non-null `revealFeature` must be a known feature.
- **Dev Mode.** "Reveal all apps" shows every registered app.
- **Pre-opening apps.** Apps needed before the Grand Opening exists (Pintly, Staffly and Vanly wrapping the Phase 1 panels) may be gated on an existing feature until their own trigger exists.

### Screen contents (match the mockup)

- **Pintly / Status:** pub name + Open switch; Seats / Taps / Hands rows with bars, the lowest-headroom one red with "⚠ bottleneck"; Waiting, Lost per hour, Vibe; shortcut "Open Staffly".
- **Pintly / Dials:** price − / + (step from data) with a tolerance hint text key; pace segmented Relaxed/Normal/Hustle with a hint; auto-reorder slider.
- **Pintly / Visit:** presence rows with current value + Drive there.
- **Ledgr / Overview:** big Gold per hour (green/red), previous hour, SVG sparkline (last 60 game minutes), per-category rows per hour. Runway line only when Gold per hour < 0.
- **Ledgr / Loan:** name, remaining + bar, next payment, interest, "Pay off early" presence row.
- **Staffly:** card per Human (name, job, quirk, morale bar red < 50, pay), candidates with "Interview" presence row. Headcount fills show as one grey card "N × headcount", no names.
- **Settings:** the sections are
  - Display: dark mode, text size S/M/L, reduced motion
  - Sound: master/SFX/music, plus the mute setting of human-resource-mvp 75.3
  - Notifications: DND, quest pings, per-app toggles
  - Controls: joystick side, haptics, key bindings
  - Game: autosave, save slot and sync status, profile/PIN
  - Developer, in dev mode only: Testing toggle, reveal all apps, debug overlay
  - About

  Settings are stored **per device in IndexedDB** (`meta` store, keyed by profileId), like the Testing toggle. They are never in SimState, and there is no server change. Syncing settings is on the wishlist.

## 7. Data and state

```ts
// packages/content/data/ui/apps.json  (validated by a zod schema in apps/web or sim defs)
{ id: string; nameKey: string; icon: string; colour: string;
  revealFeature: string | null;   // null = always installed
  tabs: { id: string; labelKey: string; icon: string }[];
  dock: number | null;            // pinned position in the dock, null = grid
  order: number }

// apps/web/src/ui/phone/phoneStore.ts  (session, not saved in SimState)
{ open: boolean; stack: PhoneScreen[]; lastTab: Record<AppId, string>;
  shadeOpen: boolean; recents: AppId[]; waypoint: { businessId: Id } | null }
PhoneScreen = { kind: 'home' } | { kind: 'recents' } | { kind: 'app'; app: AppId; tab?: string; id?: Id }

// Settings: per device in IndexedDB (meta store, key phoneSettings:<profileId>), never in SimState.
```

- Badges = alert counts per app from throttled `useHud` selectors (alert type → app id mapping in `apps.json` or alert defs).
- Notifications = derived from alerts + domain events in `simBridge.publish`; DND filters them in the web layer only.
- Gold per hour needs sim data (`finance.buckets`, 60 one-minute buckets per category). That is a **separate sim task** with a schema bump + migration. Until it exists, Ledgr shows totals only.
- Sim stays untouched by the phone shell itself. Remote actions call existing/new helpers in `panelActions.ts`; rejections are toasted by `simBridge` as today.

## 8. File layout

```
apps/web/src/ui/phone/
  Phone.tsx            // frame, status bar, nav bar, side-panel layout
  phoneStore.ts
  HomeScreen.tsx       // widgets, grid, dock
  AppShell.tsx         // top bar + body + bottom tabs
  NotificationShade.tsx
  RecentsScreen.tsx
  components/          // Switch, Segmented, Stepper, Slider, DriveThereButton, Sparkline
  apps/
    TodoApp.tsx  MapApp.tsx  PintlyApp.tsx  LedgrApp.tsx  StafflyApp.tsx
    VanlyApp.tsx  NewsApp.tsx  GemeenteApp.tsx  SettingsApp.tsx
```

- Cards still use `Card`, `Row`, `Bar`, `PanelButton` from `ui/components/Card.tsx`; add the new controls in `phone/components/`. Max 8 rows per card, no tables.
- All text via `t('phone.*')`, `t('app.<id>.*')`. No literals in JSX. Gold through the existing formatter.
- Existing panels (`PubPanel` etc.) keep working; migrate them into apps one at a time.

## 9. Build order (one task each, CI green after each)

1. `phoneStore` + `Phone` shell + Home + nav (Back/Home/Recents) + keyboard/touch input, with apps.json and Settings (Display + Notifications only).
2. Notification shade + badges + deep links from HUD and alerts.
3. Pintly (Status, Dials) wired to existing pub Commands; Visit tab with Drive there + waypoint arrows.
4. Staffly, Vanly wrapping the existing Human/Vehicle panels.
5. To-Do™ (needs quests data) and Ledgr (needs `finance.buckets`) – each after its sim task.
6. MijnGemeente, LinkedOut, Desk screens – with their features.

## 10. Tests

- `phoneStore` unit tests: open/back/home/recents/stack cap/lastTab, plus a fast-check property: any sequence of nav actions keeps `stack[0].kind === 'home'`, length ≤ 12, recents ≤ 5 and unique.
- Content test: every `apps.json` `nameKey`/tab `labelKey` exists in `en.json`; every `revealFeature` is a known reveal.
- Before done: typecheck, lint, tests, build (see `architecture.md`).
