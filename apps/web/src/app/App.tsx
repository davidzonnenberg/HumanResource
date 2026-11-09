// Screen flow: boot (registry + storage) -> Profile picker -> Slot list -> Game.
import { useEffect, useState } from 'react';
import type { DefinitionError } from '@hr/sim';
import { t } from '../text/t';
import { boot, getServices } from '../game/session';
import { useSession } from '../store/stores';
import type { LocalProfile } from '../persistence/saves';
import { ProfilePicker } from '../ui/screens/ProfilePicker';
import { SlotList } from '../ui/screens/SlotList';
import { GameScreen } from '../ui/screens/GameScreen';

type Screen = { kind: 'loading' } | { kind: 'defErrors'; errors: DefinitionError[] } | { kind: 'profiles' } | { kind: 'slots'; profile: LocalProfile } | { kind: 'game'; profile: LocalProfile };

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });

  useEffect(() => {
    void boot().then(async (b) => {
      if (!b.ok) return setScreen({ kind: 'defErrors', errors: b.errors });
      const testing = await getServices()?.repo.store.get<boolean>('meta', 'devTesting');
      useSession.getState().set({ devTesting: testing === true });
      setScreen({ kind: 'profiles' });
    });
  }, []);

  switch (screen.kind) {
    case 'loading':
      return <div className="screen center">{t('app.loading')}</div>;
    case 'defErrors':
      return (
        <div className="screen">
          <h1>{t('app.defErrors.title')}</h1>
          <p>{t('app.defErrors.body')}</p>
          <ul className="def-errors">
            {screen.errors.map((e, i) => (
              <li key={i}>
                <code>{e.definition}</code> · <code>{e.field}</code> · {e.message}
              </li>
            ))}
          </ul>
        </div>
      );
    case 'profiles':
      return <ProfilePicker onPick={(profile) => setScreen({ kind: 'slots', profile })} />;
    case 'slots':
      return <SlotList profile={screen.profile} onPlay={() => setScreen({ kind: 'game', profile: screen.profile })} onBack={() => setScreen({ kind: 'profiles' })} />;
    case 'game':
      return <GameScreen onExit={() => setScreen({ kind: 'slots', profile: screen.profile })} />;
  }
}
