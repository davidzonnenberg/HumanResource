// Whether a feature has been revealed (19.1). Kept apart from the evaluator so the `revealed`
// Condition and the systems that gate on a reveal share one function without an import cycle.
export function isRevealed(state: { reveals: { fired: string[] } }, reg: { revealTriggers: Record<string, { reveals: string[] }> }, feature: string): boolean {
  return state.reveals.fired.some((id) => reg.revealTriggers[id]?.reveals.includes(feature));
}
