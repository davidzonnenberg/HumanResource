// A minimal checklist of the current Quest (Requirement 61.1, 61.3): every step with a tick, the next
// recommended step highlighted. The To-Do app, tracker and Waypoint replace it in Phase 4 (73.8).
import { questComplete, type DefinitionRegistry, type SimState } from '@hr/sim';
import { t, tDynamic } from '../../text/t';
import { useSimVersion } from '../../store/stores';
import { bridge } from '../../store/simBridge';

/** The first Quest that is not done and whose predecessor is done, or null. */
export function currentQuestId(reg: DefinitionRegistry, state: SimState): string | null {
  for (const q of Object.values(reg.phase3.quests)) {
    if (q.after !== undefined && !questComplete(state, reg, q.after)) continue;
    if (!questComplete(state, reg, q.id)) return q.id;
  }
  return null;
}

export function QuestChecklist() {
  useSimVersion((v) => v.v);
  const reg = bridge.reg;
  const state = bridge.loop?.sim.state;
  if (!reg || !state) return null;
  const id = currentQuestId(reg, state);
  const quest = id ? reg.phase3.quests[id] : undefined;
  if (!quest) return null;
  const done = new Set(state.quests?.[quest.id]?.stepsDone ?? []);
  // the next recommended step: the first open one whose required steps are done
  const next = quest.steps.find((s) => !done.has(s.id) && (s.requires ?? []).every((r) => done.has(r)));
  return (
    <section className="quest-checklist" aria-label={tDynamic(quest.nameKey)}>
      <h3>{tDynamic(quest.nameKey)}</h3>
      <ul>
        {quest.steps.map((s) => (
          <li key={s.id} className={done.has(s.id) ? 'done' : s.id === next?.id ? 'next' : ''}>
            <span aria-hidden="true">{done.has(s.id) ? '\u2713' : '\u25CB'}</span> {tDynamic(s.textKey)}
            <span className="sr-only"> {done.has(s.id) ? t('hud.quest.done') : s.id === next?.id ? t('hud.quest.next') : ''}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
