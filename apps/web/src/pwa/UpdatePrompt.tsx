// Shows the "new version ready" prompt. Saving first is handled by the app's save-on-hide hooks;
// the GameLoop also saves when the page is hidden, so dismissing is safe (42.4).
import { useEffect, useState } from 'react';
import { t } from '../text/t';
import { setupPWA } from './registerSW';
import { runningSession } from '../game/session';

export function UpdatePrompt() {
  const [apply, setApply] = useState<(() => void) | null>(null);
  useEffect(() => {
    setupPWA((doApply) => setApply(() => doApply));
  }, []);
  if (!apply) return null;
  const confirm = async () => {
    await runningSession()?.autosave.save('update'); // save before activating (42.4)
    apply();
  };
  return (
    <div className="update-prompt">
      <span>{t('pwa.update')}</span>
      <button className="small-button primary" onClick={() => void confirm()}>
        {t('pwa.updateNow')}
      </button>
      <button className="small-button" onClick={() => setApply(null)}>
        {t('pwa.later')}
      </button>
    </div>
  );
}
