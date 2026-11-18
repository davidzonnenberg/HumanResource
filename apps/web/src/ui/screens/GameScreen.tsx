// The game screen: 3D scene + HUD + dialogs. Input handlers are installed here.
import { useEffect, useRef } from 'react';
import { Scene } from '../../render/Scene';
import { Hud } from '../hud/Hud';
import { PanelHost } from '../panels/PanelHost';
import { GameDialogs, PauseMenu } from '../Dialogs';
import { installKeyboard } from '../../input/keyboard';
import { installGestures } from '../../input/gestures';
import { stopSlot } from '../../game/session';
import { t } from '../../text/t';
import { Phone } from '../phone/Phone';
import { usePhoneSettings } from '../phone/phoneSettings';

export function GameScreen({ onExit, profileId }: { onExit: () => void; profileId: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => installKeyboard(), []);
  useEffect(() => void usePhoneSettings.getState().load(profileId), [profileId]); // per-device phone settings (D7)
  useEffect(() => (wrap.current ? installGestures(wrap.current) : undefined), []);
  const exit = async () => {
    await stopSlot(true);
    onExit();
  };
  return (
    <div className="game" ref={wrap}>
      <Scene />
      <Hud />
      <PanelHost />
      <PauseMenu onExit={() => void exit()} />
      <GameDialogs />
      <Phone />
      <div className="rotate-prompt">{t('app.rotate')}</div>
    </div>
  );
}
