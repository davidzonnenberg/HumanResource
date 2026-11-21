import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { townDevRequested } from './dev/townDevFlag';
import { UpdatePrompt } from './pwa/UpdatePrompt';
import './styles.css';

// Town dev scenes (T4 roads, T5/T6 full town) behind `?dev=1&town=roads|full`. Lazy, so they cost nothing otherwise.
const TownRoadsScene = lazy(async () => ({ default: (await import('./render/procedural/town/TownDevScene')).TownRoadsScene }));
const TownFullScene = lazy(async () => ({ default: (await import('./render/procedural/town/TownDevScene')).TownFullScene }));

const root = document.getElementById('root');
if (root) {
  const townScene = townDevRequested(window.location.search, import.meta.env.DEV);
  createRoot(root).render(
    <StrictMode>
      {townScene ? (
        <Suspense fallback={null}>{townScene === 'full' ? <TownFullScene /> : <TownRoadsScene />}</Suspense>
      ) : (
        <>
          <App />
          <UpdatePrompt />
        </>
      )}
    </StrictMode>,
  );
}
