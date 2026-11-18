# Proposal: Morale and Debt escalation (human-resource-mvp spec diffs)

Status: **proposed, not applied**. This file shows the exact text to add to `.kiro/specs/human-resource-mvp/` once approved. No code. Both features use no RNG, keep every tunable in data, and never cause a game over.

Placement: a new block "Phase 3b – Morale and debt" in tasks.md. It needs Fit_Out, License_Tier, pace and the Bank (Phase 3). Because its save version (v5) comes after the Gold-bucket version (v4, task 54.2), task 68 also depends on 54.2. The Phase 1 golden is not touched.

---

## 1. requirements.md additions

### Requirement 81: Morale (Phase 3b)

**User Story:** As a player, I want my named staff to have morale that reacts to pace and pay, so that Hustle mode has a real cost and the people feel like people.

#### Acceptance Criteria

1. THE Simulation SHALL give every named Human (a Job_Slot filled by kind `human`, and every Human in the Workforce) an integer morale between 0 and 100, and THE Simulation SHALL give Headcount_Fills no morale.
2. WHEN the Simulation creates a Human, including the start-state Humans Jan, Julia and Thomas, THE Simulation SHALL set the Human's morale to `config.morale.start`.
3. WHILE a Human is in the Workforce, THE Simulation SHALL change the Human's morale once per Game_Minute by the sum of three data-driven per-minute deltas:
   - the pace delta of the Human's Business (`relaxed` positive, `normal` toward `config.morale.baseline`, `hustle` negative)
   - the pay band delta, from the ratio of the Human's Salary to the Job's `marketSalary`
   - for an unassigned or idle Human, a small drift toward the baseline

   The change SHALL use the integer carry pattern of the Salary deduction (no floating point), and morale SHALL be clamped to 0–100.
4. THE Simulation SHALL apply morale to work speed through the data table `config.morale.speedTable`, as a Modifier on the Human's work-speed StatId, so that it stacks with the pace bonus and goes through getStat without special-casing a Job.
5. WHEN a Human's morale drops below `config.morale.warnBelow`, THE Simulation SHALL raise the Alert `low_morale@<humanId>` and THE Phone SHALL show a notification from that Human with a satirical text key.
6. WHILE a Human's morale stays below `config.morale.quitBelow` without interruption, THE Simulation SHALL emit a resignation warning when half of `config.morale.quitAfterSeconds` has passed.
7. WHEN that time reaches `config.morale.quitAfterSeconds`, THE Simulation SHALL let the Human resign:
   - clear the Human's Job_Slot
   - remove the Human from the Workforce
   - pay no Severance
   - post the news text "excited to share I've started a new position…" (LinkedOut)
8. WHEN a Human's morale is at or above `config.morale.quitBelow` for one Tick, THE Simulation SHALL reset that Human's low-morale timer.
9. THE Definition_Registry SHALL define the pace values so that `hustle` is the fastest and `relaxed` the slowest pace.
10. THE Game SHALL keep pace (Pintly) and pay (Staffly) as remote actions.
11. THE Simulation SHALL accept a `setSalary { humanId, salary }` Command for a Player-owned Human, validated against the Job's `minSalary` and `maxSalary`, and SHALL apply the new Salary from the next Salary carry.
12. IF a `setSalary` Command is outside the Job's limits, THEN THE Simulation SHALL reject it with Reason_Code `invalid_salary` and keep the Salary unchanged.
13. THE Definition_Registry SHALL validate at load that `config.morale.payBands` and `config.morale.speedTable` are sorted and cover morale 0–100, and that every Job has `marketSalary`, `minSalary ≤ marketSalary ≤ maxSalary`.
14. THE morale system SHALL never consume a value from the seeded random number generator.

### Requirement 82: Debt Escalation (Phase 3b)

**User Story:** As a player, I want debt to have escalating but survivable consequences, so that going broke matters without ending the game.

#### Acceptance Criteria

1. WHEN the Player's Gold first goes below 0 in a Save_Slot, THE Simulation SHALL fire the `first_debt` Reveal_Trigger, which reveals the feature `debt` (toast, and it unlocks the Requests entry). Before that, THE debt system SHALL do nothing.
2. THE Simulation SHALL keep `debt.sinceTick`: the first Tick at which the Player's Gold went below 0. THE Simulation SHALL reset it, and the escalation stage, to null once Gold has stayed at or above 0 for `config.debt.recoverSeconds`.
3. WHILE `debt.sinceTick` is set, THE Simulation SHALL escalate through the data-driven stages of `config.debt.stages` by time in debt:
   - **Stage `request`:** raise an Alert and create the To-Do™ Request "The bank would like a word", a presence Service at the Bank.
   - **Stage `repossess`:** a Bailiff visit. THE Simulation SHALL remove, with no refund, the most recently bought Fit_Out item of the Player Pub with the most Seats, lowering its Seats or Taps, and SHALL post the news "Bailiff takes table, leaves the vibes".
   - **Later stages:** repeat the repossession every `config.debt.repeatSeconds` while still in debt.
4. THE Simulation SHALL break ties for "the Pub with the most Seats" by the lower Business identifier, and for "the most recent Fit_Out item" by the higher purchase sequence and then the lower item identifier.
5. THE Simulation SHALL never take a Pub below its License_Tier `minSeats` or `minTaps`. IF nothing can be taken, THEN THE Simulation SHALL only post the news and raise the Alert.
6. THE Simulation SHALL never end the game, close a Pub, or stop Mandatory_Expenses because of debt.
7. WHILE `debt.sinceTick` is set and no payment plan pause is active, THE Bank SHALL offer the presence Service `payment_plan`. It charges `config.debt.planFee` as a Mandatory_Expense and pauses escalation for `config.debt.planPauseSeconds`.
8. IF the Player uses `payment_plan` while a pause is active or while not in debt, THEN THE Simulation SHALL reject the Command through the Service condition with Reason_Code `conditions_not_met`.
9. THE Simulation SHALL let the Player buy repossessed Fit_Out items again later at their normal price.
10. THE debt system SHALL never consume a value from the seeded random number generator.

---

## 2. design.md additions

### Data (config/sim.json and jobs.json)

```jsonc
// config/sim.json
"morale": {
  "start": 70, "baseline": 60, "warnBelow": 35, "quitBelow": 20, "quitAfterSeconds": 300,
  "paceDeltaPerMinute": { "relaxed": 2, "normal": 1, "hustle": -3 },   // normal = magnitude of drift toward baseline
  "idleDriftPerMinute": 1,
  "payBands": [[0, -3], [8000, -1], [9500, 0], [11500, 1]],            // [salary/marketSalary in bp from, delta/min]
  "speedTable": [[0, -1500], [25, 0], [60, 500]]                       // [morale from, work-speed bp]
},
"debt": {
  "recoverSeconds": 120,
  "stages": [{ "afterSeconds": 60, "kind": "request" }, { "afterSeconds": 240, "kind": "repossess" }],
  "repeatSeconds": 180, "planFee": 5000, "planPauseSeconds": 300
}
// jobs.json: per job "marketSalary", "minSalary", "maxSalary" (Gold hundredths per Game_Minute)
```

### State (schema v5)

```ts
interface Human { ...; morale?: number; moraleCarry?: number; lowMoraleSinceTick?: Tick | null }   // human fills only
interface PubRuntime { ...; fitOut?: { itemId: string; seq: number }[] }                          // purchase order for repossession
interface SimState { ...; debt?: { sinceTick: Tick | null; stage: number; nextActionTick: Tick | null; pausedUntilTick: Tick | null; nonNegativeSinceTick: Tick | null }; fitOutSeq?: number }
```

### Systems

- **`morale`:** reserved pipeline slot right after `finance`. It runs once per Game_Minute boundary, per Human. It uses an integer carry: deltas are per minute, so no fractional part is needed at a minute step, and `moraleCarry` stays for future per-Tick deltas.
  - `delta = paceDelta(pace, morale) + payDelta(salary / marketSalary) + idleDrift`, then clamp to 0–100.
  - `normal` pace moves morale by `paceDeltaPerMinute.normal` toward the baseline, never past it.
  - Low-morale timer: set `lowMoraleSinceTick` on the first Tick below `quitBelow`. Clear it on any Tick at or above it. Warn at half time. Resign at full time.
  - The work-speed Modifier: the source is `{ kind: 'morale', id: humanId }`, and the value is read from `speedTable`. It is recomputed when the morale band changes, so the Modifier set stays small.
- **StatId.** Morale reuses the design's existing `workSpeed` StatId. The brief mentions `serviceSpeed` (Bar_Worker) and `loadSpeed` (Driver); see open point P1.
- **`debt`:** reserved slot after `morale`.
  - It returns immediately unless `isRevealed('debt')`.
  - It tracks `sinceTick` and `nonNegativeSinceTick` and handles recovery.
  - At `nextActionTick` it applies the current stage: either a `request` (through `requests` + Effects) or a `repossess` (domain op `repossessFitOut`, deterministic pick as in 82.4, limited by License_Tier minimums). Then it advances `stage` and schedules the next action (`repeatSeconds` after the last stage).
  - A pause shifts `nextActionTick` by the time remaining in the pause.
- **Commands and Services:** `setSalary` (new Command, reason `invalid_salary`). `payment_plan` is a Bank Service with Conditions `inDebt` and `not planPaused`, and Effects `gold` (−planFee, category `fine`) plus the domain op `pauseDebt`.
- **New Condition kinds:** `inDebt` and `debtPaused`. New domain ops: `repossessFitOut` and `pauseDebt`. New reveal trigger: `first_debt` (feature `debt`). New Alert: `low_morale`. New text keys for the news and notifications.

### Migration v4 → v5 (pure JSON, its own step)

- Every Human referenced by a `kind: 'human'` fill, or in the Workforce, gets the literal values `morale: 70`, `moraleCarry: 0` and `lowMoraleSinceTick: null`. These are literals, not imported config.
- Add `debt: { sinceTick: null, stage: 0, nextActionTick: null, pausedUntilTick: null, nonNegativeSinceTick: null }`.
- Each Pub's existing fit-out items get `fitOut` entries with `seq` in their current order. `fitOutSeq` is the count.
- Never edit an earlier step.

### Correctness properties (numbered after the existing ones)

- **Property 76: Morale bounds.** For any run, every named Human's morale stays an integer in 0–100, and no Headcount_Fill has morale. Validates 81.1, 81.3.
- **Property 77: Morale and debt use no RNG.** For any run, the `morale` and `debt` systems leave `state.rng` unchanged. Validates 81.14, 82.10.
- **Property 78: Resignation needs continuous low morale.** A Human resigns only after `quitAfterSeconds` of uninterrupted morale below `quitBelow`, and any Tick at or above it resets the timer. Validates 81.6–81.8.
- **Property 79: Debt stages are monotone.** While Gold < 0, the stage never decreases; a payment plan only delays the next action. Everything resets after `recoverSeconds` at or above 0. Validates 82.2, 82.3, 82.7.
- **Property 80: Repossession respects licence minimums.** For any state, repossession never takes Seats below `minSeats` or Taps below `minTaps`, and it picks deterministically by 82.4. Validates 82.4, 82.5.
- **Property 81: Debt does nothing before the reveal.** Before `debt` is revealed, the debt system changes no state. Validates 82.1.

---

## 3. tasks.md additions (new block "Phase 3b – Morale and debt", after Phase 3; task 68 also needs 54.2)

- [ ] 68. Morale and debt data, schemas and v5 migration
  - [ ] 68.1 Add `config.morale` and `config.debt` with zod schemas, plus `marketSalary`/`minSalary`/`maxSalary` in jobs.json. Validate that the tables are sorted and cover 0–100. _Requirements: 81.13_
  - [ ] 68.2 Add the state fields (Human morale, `debt`, `PubRuntime.fitOut`, `fitOutSeq`) and the `first_debt` reveal (feature `debt`). _Requirements: 81.1, 82.1, 82.2_
  - [ ] 68.3 Add the `v4_to_v5` migration and a v4 fixture. Run the migration property test. _Requirements: 81.2, 82.2_
- [ ] 69. Morale system and `setSalary`
  - [ ] 69.1 Add the `morale` system after `finance`: per-minute deltas, clamp, `workSpeed` Modifier from `speedTable`, low-morale timer, warning, resignation with news and no Severance. _Requirements: 81.3–81.9_
  - [ ] 69.2 Add the `setSalary` Command with `invalid_salary`, and `panelActions.setSalary`. _Requirements: 81.10–81.12_
  - [ ] 69.3 Write property tests for morale. **Property 76, 77 (morale part), 78**
- [ ] 70. Debt system and the `payment_plan` Service
  - [ ] 70.1 Add the `debt` system after `morale`: `sinceTick` and recovery, the stage schedule, the `request` stage through `requests`, and the `repossess` stage through `repossessFitOut` with the deterministic pick and licence minimums. _Requirements: 82.1–82.6, 82.9_
  - [ ] 70.2 Add the `payment_plan` Bank Service (`inDebt`, `debtPaused` conditions, `pauseDebt` op). _Requirements: 82.7, 82.8_
  - [ ] 70.3 Write property tests for debt. **Property 77 (debt part), 79, 80, 81**
- [ ] 71. Morale and debt UI
  - [ ] 71.1 Staffly: a morale bar per Human (red below `warnBelow`) and a pay row with a Stepper (`setSalary`, remote). The Pintly pace hint reads "Faster service, morale drains". _Requirements: 81.5, 81.10_
  - [ ] 71.2 To-Do™ Request for the bank, alerts, phone notifications, and LinkedOut news keys in en.json (resignation, bailiff). _Requirements: 81.5, 81.7, 82.3_

---

## 4. Open points for your OK

- **P1 – StatId.** The brief names `serviceSpeed` (Bar_Worker) and `loadSpeed` (Driver). The design already has one `workSpeed` StatId that pace and quirks use, and Driver load speed is currently not a stat. Should morale use `workSpeed` for both (simplest, one stat), or should `serviceSpeed` and `loadSpeed` be added as two new StatIds?
- **P2 – Order vs. versions.** Morale and debt are "after Phase 3", but their save version (v5) comes after the Gold buckets (v4, Phase 4 task 54.2). So 54.2 must land first, or the two version numbers swap. This proposal keeps v4 = buckets, v5 = morale/debt, with 68 depending on 54.2.
- **P3 – Morale for unassigned Humans.** 81.1 gives morale to every named Human in the Workforce, including unassigned ones (they drift toward the baseline). This matches the brief's "unassigned or idle drift".
- **P4 – Plan fee category.** Should the `payment_plan` fee be category `fine` or the new `service` category?
