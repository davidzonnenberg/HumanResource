// Installed apps as a React hook (re-renders on reveals, Dev_Mode and the "reveal all apps" switch).
import { useHud, useSession } from '../../store/stores';
import { devModeOn } from '../../input/actions';
import { PHONE_APPS, type PhoneApp } from './appsSchema';
import { installedApps } from './installedApps';
import { usePhoneSettings } from './phoneSettings';

export function useInstalledApps(): PhoneApp[] {
  const revealed = useHud((h) => h.revealed);
  const revealAll = usePhoneSettings((s) => s.settings.devRevealAllApps);
  useSession((s) => s.devTesting);
  return installedApps(revealed, PHONE_APPS, devModeOn() && revealAll);
}
