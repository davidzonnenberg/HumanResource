# Human Resource

A toy-like corporate satire business game. You start as one person running a tiny pub (with Jan, Julia and Thomas), zoom out into the city, allocate Humans and personally drive a goofy delivery van. Mobile-first PWA, also plays on PC.

- Spec: `.kiro/specs/human-resource-mvp/` (requirements, design, tasks)
- Architecture rules for every contributor (human or AI): `.kiro/steering/architecture.md`
- Deployment (Docker + Tailscale): `docs/deployment.md`
- Adding content: `docs/content-authoring.md`
- Far-future ideas (not planned): `docs/wishlist.md`
- OneDrive notes: `docs/onedrive.md`

## Layout

| Path | What |
|---|---|
| `packages/content` | Game data only: definitions, Districts/map, text (`text/en.json`), name pool, tunables |
| `packages/sim` | Pure deterministic simulation (no DOM/three/physics/network) |
| `packages/shared` | Save_Document envelope, migrations, API DTOs, PIN hashing |
| `apps/web` | Vite + React + React Three Fiber game (loop, render, input, HUD, saves, sync) |
| `apps/server` | Fastify Save_API, serves the built web app |

## Commands (PowerShell: use `npm.cmd`)

```powershell
npm.cmd ci                 # install (pause OneDrive first, see docs/onedrive.md)
npm.cmd run dev            # web dev server on http://localhost:5173 (also on your LAN)
npm.cmd run dev --workspace @hr/server   # Save_API on http://localhost:8787 (proxied as /api)
npm.cmd test               # all tests once (Vitest + fast-check)
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Testing tips: open the game with `?dev=1` (or use the Pause menu "Testing" toggle) to unlock 1x/2x/4x game speed. Dev builds unlock it automatically.

## Controls

| | Touch | PC |
|---|---|---|
| Walk / drive | Left-thumb joystick | WASD / arrows |
| Action (Enter, Drive, Load, …) | Big yellow button | E |
| Zoom | Pinch, +/− buttons | Mouse wheel, + / − |
| Pan (Management View) | Drag | Mouse drag, WASD |
| Select | Tap | Click, Tab |
| Pause | II button | P |
| Game speed (when unlocked) | Speed buttons | 1 / 2 / 3, [ ], 0 |
