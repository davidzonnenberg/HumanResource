// Dev_Mode (47.5, 47.6): `?dev=1`, dev builds, or the Pause_Menu "Testing" toggle (stored per
// device). It only unlocks Game_Speeds and debug overlays; it never touches SimState.
export function devModeFromEnvironment(search: string, isDevBuild: boolean): boolean {
  return isDevBuild || new URLSearchParams(search).get('dev') === '1';
}

export function isDevMode(search: string, isDevBuild: boolean, testingToggle: boolean): boolean {
  return testingToggle || devModeFromEnvironment(search, isDevBuild);
}
