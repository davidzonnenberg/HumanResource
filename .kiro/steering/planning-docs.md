---
inclusion: always
---

# Where plans, ideas and wishes live

Four documents, four meanings. Put new things in the right one, and never treat an idea or wish as an instruction to build.

| Document | What it is | Build from it? |
|---|---|---|
| `.kiro/specs/human-resource-mvp/tasks.md` (+ `requirements.md`, `design.md`) | Committed plan. Numbered tasks with checkboxes. | Yes. This is the only source of work to implement. |
| `docs/ideas.md` | Near-term idea backlog. The user wants these, but they have not been reviewed or replanned yet. | No. They become tasks only after the user reviews and replans them. |
| `docs/wishlist.md` | Far-future ideas, "nowhere near implementation". The architecture should simply not block them. | No. Never build speculatively. |
| `docs/game-overview.md` | Status snapshot: concept, constraints, how it plays, done vs outstanding. Written to brainstorm with another AI. | No. It is a summary. Keep it in sync when features land or plans change. |

## Rules

- **New user idea:**
  - Add it to `docs/ideas.md` if it is meant for soon, or `docs/wishlist.md` if it is "someday".
  - Add it to `tasks.md` only when the user says to plan or build it.
  - If unclear, ask, or default to `ideas.md`.
- **Replanning:**
  - When the user asks to "replan" or "turn ideas into tasks", move items from `docs/ideas.md` into `tasks.md` as numbered tasks, with requirement or design updates where needed.
  - Remove or mark them as moved in `ideas.md`, so nothing exists twice.
- **Built something:**
  - Tick the task in `tasks.md`.
  - Update `docs/game-overview.md` ("Done" and "Outstanding", controls if they changed).
- **Checkboxes are not proof of playability.** Only call something playable if the player can reach it in the UI.
- **"What's next?" or "what's open?":** answer from `tasks.md`. Mention relevant `ideas.md` items separately as "not planned yet".
- **Unclear placement:** ideas that change the start state, saves or core loop belong in `ideas.md` until replanned, even if they sound small.
