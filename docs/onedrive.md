# Working in a OneDrive-synced folder

This repository lives in `C:\Users\David\OneDrive\Laptop Python\Human Resource`, which OneDrive syncs. That is fine for source files, but build output and `node_modules` cause sync churn and lock errors (`EPERM ... unlink`).

## What the project already does

- **Caches outside OneDrive.** Vite and Vitest caches go to `HR_CACHE_DIR` if set, otherwise `%TEMP%\human-resource` (see `scripts/cacheDir.mjs`).
- **One hoisted `node_modules`** at the repo root (npm workspaces), so there is only one big folder to worry about.
- **Build output** (`apps/web/dist`, `apps/server/dist`) is git-ignored and cleaned with `npm.cmd run clean`.

## What OneDrive cannot do

Personal OneDrive accounts cannot exclude a folder by name, and a junction/symlink inside the synced tree is still followed and synced. So `node_modules` cannot be reliably excluded.

## Recommended routine

1. Pause OneDrive sync (tray icon → Pause syncing → 2 hours) before `npm.cmd ci` or `npm.cmd install`.
2. Resume afterwards. `node_modules` will sync once; later installs only touch changed packages.
3. If a build fails with `EPERM` on a file in `dist`, run `npm.cmd run clean` and retry.
4. When switching between PC and laptop, run `npm.cmd ci` on the machine you switch to.

## Alternative: a working copy outside OneDrive

If OneDrive keeps getting in the way, clone the repo outside OneDrive and use GitHub to move work between machines:

```powershell
git clone https://github.com/davidzonnenberg/HumanResource.git C:\dev\HumanResource
```

The project itself is not moved by any task; this is only an option.
