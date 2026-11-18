# Requirements Document

## Introduction

The CEO Phone is the new main management UI of Human Resource: an Android-style phone whose apps appear through reveals. It realises the Phone layer of the human-resource-mvp spec (Requirements 69–74, Phase 4) and is pulled forward as the top priority. The design guide is `.kiro/steering/phone-ui.md`. The visual and navigation reference is `docs/mockups/ceo-phone.html` (a reference, not code to copy). All rules in `.kiro/steering/architecture.md` apply.

The phone shell itself changes nothing in `packages/sim` and does not change the save schema. Features that need Simulation data (Gold per hour buckets, quests, new reveal features, presence enforcement) are separate Simulation requirements, each with its own schema bump and migration.

### Decisions

The user answered decisions D1–D8 (Nov 2026). They are listed at the end of this document and already applied to the criteria below and to `.kiro/steering/phone-ui.md`.

### Scope

- This spec replaces human-resource-mvp Phase 4 tasks 56 (phone shell) and 59 (phone apps). Tasks 54, 55, 57 (Waypoint), 58 and 60 stay in the main spec.
- Top priority applies to the phone shell only (tasks 1–2). App screens that need Phase 3 data (To-Do™, Ledgr, MijnGemeente) stay blocked until their Simulation task exists. Pintly, Staffly and Vanly may wrap the existing Phase 1 panels and Commands.

## Glossary

- **Phone**: the CEO Phone UI component in `apps/web/src/ui/phone/`.
- **Phone_Store**: the web session store `phoneStore` holding the phone's navigation state. It is never part of `SimState` and is never saved.
- **Screen_Stack**: the ordered list of Phone_Screens in the Phone_Store. Index 0 is always Home.
- **Phone_Screen**: one of `{kind:'home'}`, `{kind:'recents'}` or `{kind:'app', app, tab?, id?}`.
- **Phone_App**: an app defined in `packages/content/data/ui/apps.json`.
- **App_Registry**: the validated list of Phone_Apps.
- **Installed_App**: a Phone_App whose reveal feature is `null` or has been revealed in the Save_Slot.
- **Recents**: the list of the last opened Phone_Apps, newest first.
- **Shade**: the notification shade with quick tiles and notification cards.
- **Dock**: the row of pinned apps at the bottom of Home.
- **Phone_Focus**: the state in which keyboard input goes to the Phone instead of the game.
- **Remote_Action**: a phone action that sends a Command immediately from anywhere.
- **Presence_Action**: a phone action that needs the CEO at a building; the phone shows a "Drive there" button for it.
- **Phone_Settings**: the player's phone preferences (Display, Notifications, later Sound/Controls/Game). Never part of `SimState`.
- **Waypoint**: a web-only navigation target drawn as road arrows (built in task 3).
- Other terms (Simulation, SimState, Reveal_Trigger, Gold, Command, Reason_Code, Panel, HUD, Toast, t(), Save_Slot, Profile, Manual_Driving, Delivery_Van, CEO) are defined in the human-resource-mvp requirements.

## Requirements

### Requirement 1: Phone Shell

**User Story:** As a player, I want a phone that frames everything I manage, so that the business feels like apps in my pocket.

#### Acceptance Criteria

1. THE Phone SHALL render, from top to bottom, a status bar, one screen area and a system navigation bar with Back, Home and Recents buttons.
2. THE status bar SHALL show the elapsed game time derived from the Tick (for example "1h 23m"), the current Game_Speed icon, a Do-Not-Disturb icon WHILE Do-Not-Disturb is on, and a decorative battery; THE Phone SHALL show no clock and no days.
3. WHEN the Player taps or clicks the status bar, THE Phone SHALL toggle the Shade.
4. THE screen area SHALL show Home, a Phone_App screen or Recents, according to the top of the Screen_Stack.
5. THE Phone SHALL tint its frame in the Player's owner colour.
6. THE Phone SHALL take all user-facing text from `t('phone.*')` and `t('app.<id>.*')` keys in `packages/content/data/text/en.json`.
7. THE Phone SHALL show Gold through the existing Gold formatter on integer hundredths and SHALL not use floating-point Gold arithmetic.
8. THE Phone SHALL read Simulation data through `simBridge` and throttled `useHud` / `useSimSelector` selectors and SHALL keep no per-Tick Simulation data in React state.
9. WHILE the Phone is open, THE existing HUD, Panels (PubPanel and the info panels), dialogs and Pause_Menu SHALL keep working unchanged.
10. WHEN the Phone shows a deadline, THE Phone SHALL show it as remaining game time (for example "in 3m 40s").

### Requirement 2: Home Screen

**User Story:** As a player, I want a home screen with my key numbers and my apps, so that I see the state of my business at a glance.

#### Acceptance Criteria

1. THE Home screen SHALL show an elapsed-game-time widget, a money widget, a quest widget, a 4-column app grid and a Dock.
2. THE money widget SHALL show the Player's Gold, and WHEN the Player activates it, THE Phone SHALL open the Ledgr app WHERE Ledgr is an Installed_App.
3. WHILE the quest data of the Simulation does not exist, THE quest widget SHALL show a placeholder text key and SHALL not be activatable.
4. THE app grid SHALL show every Installed_App that is not in the Dock, ordered by its `order` value.
5. THE Dock SHALL show only Installed_Apps with a non-null `dock` number, ordered by that number, with no empty slots, and THE Settings app SHALL always be in the Dock.
6. THE Phone SHALL never show a Phone_App whose reveal feature is not `null` and has not been revealed in the Save_Slot.

### Requirement 3: App Registry

**User Story:** As the developer, I want phone apps defined in data, so that a reveal can install an app without code changes.

#### Acceptance Criteria

1. THE App_Registry SHALL be defined in `packages/content/data/ui/apps.json` with, per app, `id`, `nameKey`, `icon`, `colour`, `revealFeature` (a reveal feature name or `null`), `tabs` (list of `id`, `labelKey`, `icon`), `dock` (dock position number or `null`) and `order`.
2. THE App_Registry SHALL be validated by a zod schema, and IF the file is invalid, THEN THE Game SHALL report an error naming the app and the field.
3. IF two apps share an `id`, or an app has more than 4 tabs, or two tabs of an app share an `id`, THEN THE validation SHALL fail.
4. THE `revealFeature` of an app SHALL name a reveal FEATURE (an entry of a Reveal_Trigger's `reveals` list), never a trigger id; app features SHALL be named `app_<id>` and SHALL be added to the installing trigger in the task that builds the app, except that an app MAY reuse a fitting existing feature (LinkedOut uses `news_feed`).
5. THE Phone SHALL render apps only from the App_Registry and SHALL contain no hard-coded app list.
6. FOR ALL apps in the App_Registry, the `nameKey` and every tab `labelKey` SHALL exist in `en.json` (content property).
7. THE App_Registry SHALL list only apps that are built; each later task SHALL add its own app entry together with its feature.
8. IF a non-null `revealFeature` is not a known reveal feature, THEN THE content test SHALL fail (strict).
9. WHERE Dev_Mode is on, THE Developer setting "reveal all apps" SHALL show every registered app.

### Requirement 4: Navigation

**User Story:** As a player, I want phone navigation that behaves like a real phone, so that I never get lost in it.

#### Acceptance Criteria

1. WHEN the Phone is opened for the first time in a session, THE Phone_Store SHALL hold the Screen_Stack `[home]`.
2. WHEN `open(appId, {tab?, id?})` is called, THE Phone_Store SHALL push the app screen unless the same app screen is already on top, close the Shade, and move the app to the front of Recents.
3. THE Phone_Store SHALL keep at most 5 Recents, newest first and without duplicates.
4. WHEN Back is triggered, THE Phone_Store SHALL close the Shade if it is open; otherwise close an open dialog if one is open; otherwise pop the top screen; and WHEN the top screen is Home, Back SHALL close the Phone.
5. WHEN Home is triggered, THE Phone_Store SHALL reset the Screen_Stack to `[home]` and close the Shade.
6. WHEN Recents is triggered, THE Phone_Store SHALL push the Recents screen unless it is already on top, and THE Recents screen SHALL show the Recents as large cards that open their app.
7. WHEN a push would make the Screen_Stack longer than 12, THE Phone_Store SHALL keep Home plus the last 6 screens.
8. THE Phone_Store SHALL remember the last tab per app, and WHEN an app is opened without a tab, THE Phone SHALL show its last tab, or its first tab if none is remembered.
9. WHEN a detail page is opened (for example a Human or a van), THE Phone_Store SHALL push it as an app screen with an `id`.
10. FOR ALL sequences of navigation actions, THE Phone_Store SHALL keep `stack[0].kind === 'home'`, a stack length of at most 12, and at most 5 unique Recents (stack invariant property).
11. THE Phone_Store SHALL be web session state and SHALL never be written to `SimState` or a Save_Document.

### Requirement 5: App Screens and Tabs

**User Story:** As a player, I want each app to have a clear top bar and tabs, so that bigger apps stay simple.

#### Acceptance Criteria

1. THE app screen SHALL show a top app bar with a Back arrow and the app name, a scrolling body of Cards, and, WHERE the app defines tabs, a bottom tab bar.
2. THE bottom tab bar SHALL show 2 to 4 tabs, each with an icon and a label, and SHALL mark the active tab with an icon pill and `aria-current`.
3. WHEN the Player activates a tab, THE Phone_Store SHALL record it as the app's last tab.
4. THE Cards in the body SHALL use the `Card`, `Row`, `Bar` and `PanelButton` patterns with at most 8 rows per Card and no tables.

### Requirement 6: Notification Shade

**User Story:** As a player, I want a notification shade, so that I see what happened and can jump straight to it.

#### Acceptance Criteria

1. THE Shade SHALL show the quick tiles Do-Not-Disturb, Dark mode, Haptics and Settings, followed by notification cards.
2. THE Phone SHALL derive notifications from Alerts and domain events in the web layer, without new Simulation state.
3. WHEN the Player activates a notification card, THE Phone SHALL open its app through `open(...)`, with tab and id where the notification has them.
4. WHILE Do-Not-Disturb is on, THE Shade SHALL show a "silenced" text instead of the notification cards, and THE HUD alert bell SHALL still show the Alerts.
5. THE Shade SHALL open by tapping or swiping down on the status bar and with the `N` key while the Phone has Phone_Focus.

### Requirement 7: Badges and Deep Links

**User Story:** As a player, I want app badges and links from the HUD into apps, so that I find the problem behind an alert.

#### Acceptance Criteria

1. THE Phone SHALL show on each Installed_App icon a badge with the number of active Alerts mapped to that app, derived from throttled `useHud` selectors.
2. THE mapping from Alert type to app SHALL be defined in data, not in component code.
3. WHEN an app is opened, THE Phone_Store SHALL mark its current badge count as seen, and THE badge SHALL show only Alerts that arrived after that.
4. WHEN the Player activates the HUD money pill, THE Phone SHALL open Ledgr; WHEN the Player activates the HUD quest tracker, THE Phone SHALL open To-Do™; WHEN the Player activates an Alert's "Fix" button, THE Phone SHALL open the owning app with its tab and id.
5. THE Phone SHALL route every deep link through `phone.open(...)`.

### Requirement 8: Remote and Presence Actions

**User Story:** As a player, I want small changes to work from anywhere and big decisions to need me in person, so that driving around matters.

#### Acceptance Criteria

1. WHEN the Player triggers a Remote_Action, THE Phone SHALL submit its Command immediately through `panelActions.ts`, and rejected Commands SHALL be shown as Toasts by `simBridge` as today.
2. THE Phone SHALL show every Presence_Action as a row with a location icon and a "Drive there" button.
3. WHEN the Player activates "Drive there", THE Phone SHALL set the Waypoint to the target building and close the Phone; until the Waypoint exists (task 3), THE Phone SHALL show a Toast naming the target instead.
4. THE Simulation SHALL reject a Presence_Action Command with Reason_Code `not_present` WHILE the CEO is not at the target building (separate Simulation requirement, Requirement 15.4).
5. THE Phone SHALL take the remote or presence tag of an action from data and SHALL not decide it in component code.

### Requirement 9: Opening and Closing the Phone

**User Story:** As a player, I want to open the phone quickly on any device, so that managing never feels slow.

#### Acceptance Criteria

1. WHEN the Player presses `Q` or activates the HUD phone button, THE Game SHALL toggle the Phone.
2. THE HUD phone button SHALL be placed outside the touch joystick zone.
3. WHILE Manual_Driving is active and the van's speed is at or above the stopped speed, THE Game SHALL not open the Phone and SHALL show a Toast explaining that the van must stop.
4. WHEN Manual_Driving is active and the Phone is open and the van starts moving, THE Game SHALL close the Phone.
5. WHEN the Phone closes, THE Game SHALL return keyboard input to the game.

### Requirement 10: Keyboard and Touch Input

**User Story:** As a player, I want to use the phone with only a keyboard or only touch, so that it works on PC and on my phone.

#### Acceptance Criteria

1. WHILE the Phone has Phone_Focus, THE Phone SHALL map `Esc` and `Backspace` to Back, `H` to Home, `R` to Recents, `N` to the Shade, `Tab` / `Shift+Tab` to the next / previous tab, and `Enter` / `Space` to activating the focused control.
2. WHILE the Phone has Phone_Focus, THE Game SHALL not move the CEO or steer the van on WASD or arrow keys, and arrow keys SHALL move focus within the Phone.
3. WHILE the Phone has Phone_Focus, THE Phone SHALL capture WASD/arrows, `Tab`, `Enter`, `Space` and `Esc`, so THE Game SHALL not run its own handlers for them (the human-resource-mvp 18.6 Tab-cycles-world-objects rule is suspended while the Phone is focused), and SHALL also not run `E` and `V`; `Q` and `P` SHALL keep working.
4. THE Phone SHALL use no number keys, because `1`, `2`, `3`, `0`, `[` and `]` control game speed, and those keys SHALL keep working while the Phone is open.
5. WHILE the Phone does not have Phone_Focus, THE Phone shortcut keys `H`, `R`, `N` and `Backspace` SHALL have no effect.
6. THE Phone SHALL offer every action by touch alone (tap targets, a Back button and an edge swipe for Back) and by keyboard alone.
7. WHEN a text field inside the Phone has focus, THE Phone shortcut keys SHALL type into the field instead.

### Requirement 11: Layout per Device

**User Story:** As a player, I want the phone to leave enough of the game visible, so that I can keep an eye on the world.

#### Acceptance Criteria

1. ON a PC and on a landscape phone, THE Phone SHALL appear as a side panel docked on the right, full height minus margins, at most 40% of the screen width, at phone proportions (about 9 : 19.5) where the width allows.
2. THE Phone SHALL offer no bottom sheet and no drag to full screen, and SHALL never exceed 40% of the screen width (human-resource-mvp 18.7, 71.11).
3. WHILE the device is in portrait orientation, THE Game SHALL show the existing rotate prompt instead of the Phone layout, and THE Phone SHALL never cover the joystick zone on the left.
4. THE Phone SHALL use the theme colours of phone-ui.md §5 as CSS variables for light and dark mode, with `#e03131` for bottleneck/negative and `#2f9e44` for positive.

### Requirement 12: Settings App

**User Story:** As a player, I want phone settings, so that the phone looks and behaves the way I like.

#### Acceptance Criteria

1. THE Settings app SHALL be always installed and SHALL contain, in task 1, the sections Display (Dark mode, Text size Small / Normal / Large, Reduced motion) and Notifications (Do-Not-Disturb, Quest pings).
8. WHEN the sound features arrive, THE Settings app SHALL be the home of the Sound section, including the mute setting of human-resource-mvp Requirement 75.3.
2. WHILE no Dark mode choice has been made, THE Phone SHALL follow `prefers-color-scheme`.
3. WHILE Reduced motion is on or the system prefers reduced motion, THE Phone SHALL show no slide, bounce or shake animations.
4. WHEN the Player changes a setting, THE Game SHALL apply it immediately and persist it per device in IndexedDB (`meta` store, key `phoneSettings:<profileId>`), like the Testing toggle, with no server or DTO change; syncing settings is on the wishlist.
5. THE Game SHALL never store Phone_Settings in `SimState` or in a Save_Document's Simulation state.
6. WHEN the Game starts with stored Phone_Settings, THE Phone SHALL apply them before the Phone is first shown.
7. IF stored Phone_Settings are missing or invalid, THEN THE Game SHALL use the defaults and SHALL not show an error.

### Requirement 13: Accessibility

**User Story:** As a player, I want the phone to be accessible, so that every control is reachable and understandable.

#### Acceptance Criteria

1. THE Phone SHALL make every interactive target at least 44 × 44 CSS pixels.
2. THE Phone SHALL show a visible focus ring on every focusable control.
3. THE Phone SHALL render switches with `role="switch"` and `aria-checked`, segmented controls with `aria-pressed` on each option, and icon-only buttons with an `aria-label` from `t()`.
4. THE Phone SHALL mark the screen area with `aria-live="polite"`.
5. WHEN the Phone opens, THE Phone SHALL move focus into the Phone, and WHEN it closes, THE Phone SHALL return focus to the game canvas.
6. THE Phone SHALL keep its text readable at all three Text sizes without clipping row content.

### Requirement 14: Phone Controls

**User Story:** As the developer, I want shared phone controls, so that every app looks and behaves the same.

#### Acceptance Criteria

1. THE Phone SHALL provide the controls Switch, Segmented, Stepper and DriveThereButton in `apps/web/src/ui/phone/components/`.
2. THE Stepper SHALL take its step and limits from props and SHALL not exceed them.
3. THE DriveThereButton SHALL take a target building id and a label key and SHALL behave as in Requirement 8.3.

### Requirement 15: Simulation Prerequisites (separate Simulation tasks)

**User Story:** As the developer, I want the Simulation changes the phone needs kept separate, so that the shell ships without touching saves.

#### Acceptance Criteria

1. THE Ledgr Gold-per-hour view SHALL depend on `finance.buckets` (60 one-minute buckets per category, integer Gold) as a separate Simulation change with a schema bump and migration (human-resource-mvp Requirement 70); until then Ledgr SHALL show totals only.
2. THE To-Do™ app SHALL depend on quest data (`quests.json` and quest state) as a separate Simulation change with a schema bump and migration (human-resource-mvp Requirement 73).
3. Each new reveal feature that installs an app SHALL be added to `reveal-triggers.json` in the task that introduces that feature, not in a phone task.
4. Presence enforcement with Reason_Code `not_present` SHALL be a separate Simulation change (human-resource-mvp Requirement 51.5).

## Decisions (answered by the user, Nov 2026)

- **D1 – No full-screen drag.** The Phone never exceeds the 40% rule. The exception was removed from phone-ui.md §5.
- **D2 – Layout.** A side panel docked right, at most 40% of the screen WIDTH, full height minus margins, on PC and on landscape phones (71.11 wins). There is no bottom sheet. Portrait shows the rotate prompt. The joystick stays left.
- **D3 – Features, not triggers.** `revealFeature` names reveal features, never trigger ids. App features are named `app_<id>` and are added to the installing trigger's `reveals` in the task that builds the app. Existing features may be reused (LinkedOut → `news_feed`). Trigger names follow human-resource-mvp 71.5: `license_granted`, `loan_taken`, `first_hire`, `supplier_deal`, `first_news`, `first_permit_offer`.
- **D4 – apps.json lists only built apps.** The content test stays strict. Task 1 ships Settings (`null`) and LinkedOut (`news_feed`). Dev Mode "reveal all apps" shows every registered app.
- **D5 – No clock, no days.** The status bar shows the elapsed game time from the Tick, the Game_Speed icon and DND. Deadlines are shown as remaining game time.
- **D6 – Dock.** Installed apps only, no empty slots, ordered by `dock: number | null`. Settings is always docked.
- **D7 – Settings storage.** Per device in IndexedDB (`meta` store), keyed by profileId. Syncing is on the wishlist.
- **D8 – Steering file.** The guide was renamed to `.kiro/steering/phone-ui.md` and D1–D7 were applied to it.