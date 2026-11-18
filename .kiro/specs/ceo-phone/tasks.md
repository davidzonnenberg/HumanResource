# Implementation Plan: CEO Phone

## Overview

Build order follows `.kiro/steering/phone-ui.md` §9: one task each, CI green after each. Phone tasks (1–6) are web-only: no changes in `packages/sim`, no save schema bump. Tasks that need Simulation data are separate Simulation tasks (S1–S4), each with a schema bump and a migration. Phone tasks that depend on them say so.

This spec replaces human-resource-mvp tasks 56 and 59. Top priority applies to the phone shell only (tasks 1–2). To-Do™, Ledgr and MijnGemeente stay blocked until their Simulation tasks exist. Pintly, Staffly and Vanly may wrap the existing Phase 1 panels and Commands. Decisions D1–D8 are applied (see `requirements.md`). The Waypoint is human-resource-mvp task 57, so it is not built here.

Definition of done for every task, run from the repo root:
- `npm.cmd run typecheck`
- `npx.cmd eslint .`
- `npm.cmd run build`
- `node .\node_modules\vitest\vitest.mjs run`, as a background process (poll until the Test Files summary; never run vitest from `apps/web`)

No commits or pushes unless the user asks.

## Tasks

- [x] 1. Phone shell, Home, navigation, input, apps.json and Settings (Display + Notifications)
  - [x] 1.1 Navigation store
    - Files: `apps/web/src/ui/phone/phoneNav.ts` (pure reducers), `apps/web/src/ui/phone/phoneStore.ts` (Zustand wrapper).
    - State: `open`, `stack`, `lastTab`, `shadeOpen`, `recents`, `dialog`. Actions: `toggle`, `setOpen`, `open`, `back`, `home`, `recents`, `setTab`, `toggleShade`, `closeShade`.
    - Session state only: reset on `attachSimulation`, never in `SimState`, never saved.
    - _Requirements: 4.1–4.11_
  - [x] 1.2 Write unit tests for phoneStore
    - File: `apps/web/test/phoneStore.test.ts`.
    - Cases: open, back (shade → dialog → pop → close on Home), home, recents, the stack cap (13th push keeps home + last 6), lastTab per app, no duplicate push.
    - _Requirements: 4.2–4.9_
  - [x] 1.3 Write property test for phone stack invariants
    - **Property 1: Phone stack invariants**
    - **Validates: Requirements 4.3, 4.7, 4.10**
    - fast-check, at least 100 runs, tag `// Feature: ceo-phone, Property 1: phone stack invariants`. Any sequence of nav actions keeps `stack[0].kind === 'home'`, length ≤ 12, and recents ≤ 5 and unique.
    - App ids are drawn from the registry, including apps with `revealFeature: null` (Settings), plus arbitrary ids.
    - Also Property 2 (open is idempotent on top).
  - [x] 1.4 App registry
    - Files: `packages/content/data/ui/apps.json`, `packages/content/index.ts` (export `phoneApps`), `apps/web/src/ui/phone/appsSchema.ts` (zod), `apps/web/src/ui/phone/installedApps.ts`.
    - Add `zod` 4.6.7 (the exact version `packages/shared` pins) to `apps/web/package.json`.
    - apps.json lists only built apps: Settings (`revealFeature: null`, `dock: 0`) and LinkedOut (`news_feed`). No reveal triggers are added.
    - `dock` is `number | null`. Dev Mode "reveal all apps" shows every registered app.
    - _Requirements: 3.1–3.6, 2.6_
  - [x] 1.5 Write content and property tests for the app registry
    - File: `apps/web/test/phoneApps.test.ts`.
    - Cases: the schema passes; every `nameKey` and tab `labelKey` exists in `en.json`; every non-null `revealFeature` is a known reveal feature (strict).
    - Extend the quoted-key prefix list in `apps/web/test/content.test.ts` with `phone`.
    - **Property 3: Installed apps follow reveals**
    - **Validates: Requirements 2.4, 2.6, 3.4**
  - [x] 1.6 Phone controls
    - Files: `apps/web/src/ui/phone/components/Switch.tsx`, `Segmented.tsx`, `Stepper.tsx`, `DriveThereButton.tsx`.
    - DriveThereButton shows a toast `phone.driveThere.toast` (the waypoint comes in task 3).
    - Controls: 44 px targets, focus ring, `role="switch"` + `aria-checked`, `aria-pressed`, labels via `t()`.
    - _Requirements: 13.1–13.3, 14.1–14.3, 8.3_
  - [x] 1.7 Phone shell, Home, AppShell and Recents
    - Files: `apps/web/src/ui/phone/Phone.tsx`, `HomeScreen.tsx`, `AppShell.tsx`, `RecentsScreen.tsx`, `apps/web/src/ui/screens/GameScreen.tsx` (mount `<Phone/>`), `apps/web/src/styles.css` (`.phone` scope, theme variables from phone-ui.md §5).
    - Phone.tsx: frame tinted in the owner colour; status bar with the elapsed game time (no clock, no days), the Game_Speed icon, a DND icon and a decorative battery; a screen area with `aria-live="polite"`; a nav bar with Back, Home and Recents.
    - HomeScreen.tsx:
      - elapsed-game-time widget
      - money widget, with Gold from `useHud` through the existing formatter
      - quest widget placeholder
      - 4-column grid
      - dock (installed apps only, ordered by `dock`, Settings always present)
    - AppShell.tsx: top bar, body and bottom tabs (≤ 4, active pill, `aria-current`).
    - Layout: a side panel docked right on PC and landscape phones, full height minus margins, max 40% width, about 9 : 19.5. No bottom sheet and no full-screen drag.
    - All text via `t('phone.*')` and `t('app.<id>.*')` keys added to `en.json`.
    - _Requirements: 1.1–1.9, 2.1–2.6, 5.1–5.4, 11.1–11.4, 13.4–13.6_
  - [x] 1.7b LinkedOut (minimal)
    - File: `apps/web/src/ui/phone/apps/NewsApp.tsx`: a Card list of `state.news` (newest first, text via `tDynamic(textKey, params)`), read through `useSimSelector`. It is installed by the existing `news_feed` feature.
    - _Requirements: 3.4, 1.8_
  - [x] 1.8 Settings app (Display + Notifications only)
    - Files: `apps/web/src/ui/phone/apps/SettingsApp.tsx`, `apps/web/src/ui/phone/phoneSettings.ts`.
    - Display: Dark mode, Text size S/M/L, Reduced motion. Notifications: Do-Not-Disturb, Quest pings.
    - Settings are validated on load (defaults if missing or invalid), applied immediately, and stored per device in IndexedDB (`meta` store, `phoneSettings:<profileId>`). Never in `SimState`.
    - A Developer section, Dev_Mode only, has the "reveal all apps" toggle.
    - _Requirements: 12.1–12.7_
  - [x] 1.9 Input and focus
    - Files: `apps/web/src/input/keyboard.ts`, `apps/web/src/ui/hud/Hud.tsx` (phone button outside the joystick zone), `Phone.tsx` (focus in and out, edge swipe for Back, arrow-key focus movement).
    - Keys:
      - `Q` toggles the phone (not inside text fields).
      - While the phone has focus: `Esc`/`Backspace` = Back, `H` = Home, `R` = Recents, `Tab`/`Shift+Tab` = tabs, `Enter`/`Space` = activate.
      - The phone captures WASD, arrows, `Tab`, `Enter`, `Space` and `Esc`, so the 18.6 Tab cycle is suspended; `E` and `V` are not handled by the game either.
      - `Q`, `P` and the speed keys `1 2 3 0 [ ]` keep working.
    - On open, clear `inputState.keys` and call `recomputeMove()`.
    - While driving: the phone opens only when the van is stopped, closes when it starts moving, and shows toast `phone.toast.stopFirst` otherwise.
    - _Requirements: 9.1–9.5, 10.1–10.7_
  - [x] 1.10 Write unit tests for phone key routing
    - File: `apps/web/test/phoneInput.test.ts`.
    - Cases:
      - with phone focus, WASD doesn't fill `inputState.keys`
      - number keys still change speed
      - `H`/`R` do nothing without phone focus
      - `Q` doesn't open while the van moves
    - _Requirements: 9.3, 10.2–10.5_
  - [ ] 1.11 Manual check (PC and phone) - for the user
    - PC:
      - Q opens and closes the phone
      - Esc, Backspace, H, R and Tab work only while the phone has focus
      - the CEO doesn't move while typing WASD in the phone
      - 1/2/3 still change speed
      - the side panel stays ≤ 40% wide
      - dark mode, text size and reduced motion apply at once and persist after a reload
    - Phone:
      - the phone button sits outside the joystick zone
      - the phone stays docked right, ≤ 40% of the width, and doesn't cover the joystick
      - all buttons are easy to hit
      - edge swipe goes Back
    - Existing panels (Pub, Vehicle, Finance) still open and work.

- [ ] 2. Notification shade, badges and deep links
  - [ ] 2.1 Shade and notification feed
    - Files: `apps/web/src/ui/phone/NotificationShade.tsx`, `apps/web/src/ui/phone/phoneNotifications.ts` (session ring of the last 20, derived from `useHud.alerts` and `onDomainEvents`).
    - Quick tiles: DND, Dark mode, Haptics, Settings. DND shows "silenced"; the HUD bell is unaffected. `N` key and status-bar tap/swipe open it.
    - _Requirements: 6.1–6.5_
  - [ ] 2.2 Badges and the alert → app mapping
    - Files: `packages/content/data/ui/apps.json` (`alertTypes` per app, `fix` targets), `appsSchema.ts`, `HomeScreen.tsx`, `phoneStore.ts` (`badgeSeen`).
    - _Requirements: 7.1–7.3_
  - [ ] 2.3 Deep links from the HUD
    - Files: `apps/web/src/ui/hud/Hud.tsx`: money pill → Ledgr (once installed), quest tracker → To-Do™ (once S2 exists), alert "Fix" → `phone.open(app, {tab, id})`.
    - _Requirements: 7.4, 7.5_
  - [ ] 2.4 Write unit tests for badges and deep links
    - Cases: badge counts and seen markers, the DND filter, deep-link targets resolve to installed apps only.
    - _Requirements: 6.4, 7.1–7.5_

- [ ] 3. Pintly (Status, Dials, Visit) and the waypoint
  - [ ] 3.1 Pintly Status and Dials on existing pub Commands
    - Files: `apps/web/src/ui/phone/apps/PintlyApp.tsx`, `panelActions.ts` (reuse the drink price and auto-reorder helpers), `components/Slider.tsx`.
    - The data shown is what the sim has today. Seats/Taps/Hands, Vibe, the Open/Closed toggle and Worker pace appear only when their sim features exist (human-resource-mvp Phase 3); until then those rows are hidden.
    - _Requirements: 8.1, 8.5, 5.1–5.4_
  - [ ] 3.2 Visit tab with Drive there
    - Presence rows from data (`access: 'presence'`).
    - _Requirements: 8.2, 8.5_
  - [ ] 3.3 Wire DriveThereButton to the Waypoint (after human-resource-mvp task 57)
    - The Waypoint store and road arrows are human-resource-mvp task 57, not built here. Once it exists, DriveThereButton sets the Waypoint instead of showing the toast, and closes the phone.
    - _Requirements: 8.3_

- [ ] 4. Staffly and Vanly
  - [ ] 4.1 Staffly
    - File: `apps/web/src/ui/phone/apps/StafflyApp.tsx`, wrapping the existing Human panel content.
    - A card per Human with a detail page (`{app:'staff', id}`). Headcount fills show as one grey card "N × headcount". Interview is a presence row.
    - _Requirements: 4.9, 5.1–5.4, 8.1, 8.2_
  - [ ] 4.2 Vanly
    - File: `apps/web/src/ui/phone/apps/VanlyApp.tsx`, wrapping the existing Vehicle panel content (route editor, driver slot, orders). "Take the wheel" is a presence row.
    - _Requirements: 4.9, 5.1–5.4, 8.1, 8.2_
  - [ ] 4.3 Write unit tests for Staffly and Vanly
    - Cases: headcount fills show no names, detail screens push and pop correctly.
    - _Requirements: 4.9_

- [ ] 5. To-Do™ and Ledgr (each after its Simulation task)
  - [ ] 5.1 Ledgr Overview and Loan tabs (after S1; Loan tab after the human-resource-mvp loans task)
    - Files: `apps/web/src/ui/phone/apps/LedgrApp.tsx`, `components/Sparkline.tsx`.
    - Content: Gold per hour (green/red), previous hour, a 60-minute sparkline, per-category rows, and a runway line only when negative. Until S1 is done, totals only.
    - _Requirements: 15.1_
  - [ ] 5.2 To-Do™ Main, Side and Requests tabs (after S2)
    - File: `apps/web/src/ui/phone/apps/TodoApp.tsx`. Located steps get a DriveThereButton.
    - _Requirements: 15.2_

- [ ] 6. MijnGemeente, LinkedOut and Desk screens (with their features)
  - [ ] 6.1 Expand LinkedOut
    - Task 1 ships a minimal LinkedOut on the existing `news_feed` feature (a list of `state.news`). This task adds the LinkedIn-style posts and reactions of human-resource-mvp 79.8.
    - _Requirements: 3.4_
  - [ ] 6.2 MijnGemeente and Desk screens
    - Built together with the human-resource-mvp Services, offices and permits work (Requirements 51, 60, 72). Desk screens use `useService` with hold-to-confirm.
    - _Requirements: 8.1–8.5_

## Simulation prerequisites (separate tasks; each bumps the save schema with a migration)

These change `packages/sim` and `packages/shared`. Don't build them as part of a phone task. Each follows architecture.md: a pure migration, fixtures, and round-trip and migration property tests.

- [ ] S1. Gold per hour: `finance.buckets` as 60 one-minute buckets per category (integer Gold)
  - Files: `packages/sim/src/money/gold.ts`, `state/schema.ts`, `packages/shared/src/migrations/` (+ fixture), `packages/sim/src/index.ts` (selector `goldPerHour`, `runway`).
  - Schema bump and migration (old saves get buckets rebuilt from the existing per-second buckets, or zeros).
  - Property: bucket sums equal the recorded changes within the window.
  - _Requirements: 15.1 (human-resource-mvp 70)_
- [ ] S2. Quest data for To-Do™: `quests.json` + quest state + step evaluation through the shared conditions engine
  - Schema bump and migration (no active quests for old saves). Covered by the human-resource-mvp quest-engine task.
  - _Requirements: 15.2 (human-resource-mvp 73)_
- [ ] S3. New reveal features that install apps: `app_pintly` (trigger `license_granted`), `app_ledgr` (`loan_taken`), `app_staffly` (`first_hire`), `app_vanly` (`supplier_deal`), `app_gemeente` (`first_permit_offer`), `app_todo` / `app_map` (start)
  - Each is added to `reveal-triggers.json`, with its `toast.reveal.<feature>` text, in the task that introduces the feature. A schema bump is only needed if the trigger needs new state.
  - _Requirements: 15.3_
- [ ] S4. Presence enforcement: Reason_Code `not_present` for presence actions
  - Comes with `useService` and `access` tags (human-resource-mvp Requirement 51). Schema bump only if the Services task adds state.
  - _Requirements: 8.4, 15.4_

## Notes

- Mandatory tests: 1.2, 1.3 (Property 1), 1.5 (content + Property 3), 1.10.
- Existing panels (PubPanel, InfoPanels, Finance) keep working until each one is migrated into its app (tasks 3–5).
- The mockup `docs/mockups/ceo-phone.html` is a visual reference only. It uses string literals, innerHTML and float Gold, so don't copy its code.
