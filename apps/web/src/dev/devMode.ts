// Dev_Mode (47.5, 47.6): `?dev=1`, dev builds, or the Pause_Menu "Testing" toggle (stored per
// device). It only unlocks Game_Speeds and debug overlays; it never touches SimState.
export function devModeFromEnvironment(search: string, isDevBuild: boolean): boolean {
  return isDevBuild || new URLSearchParams(search).get('dev') === '1';
}

/** Which start a new Save_Slot gets: the story (Grand Opening) by default, the running pub with `?dev=1` (3.1a, 3.1b). */
export function startKindFromSearch(search: string): 'grand_opening' | 'dev' {
  return new URLSearchParams(search).get('dev') === '1' ? 'dev' : 'grand_opening';
}
export function isDevMode(search: string, isDevBuild: boolean, testingToggle: boolean): boolean {
  return testingToggle || devModeFromEnvironment(search, isDevBuild);
}
