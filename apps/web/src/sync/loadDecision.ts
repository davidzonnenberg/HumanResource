// Pure load decision (25.7–25.9).
export type LoadDecision = 'useLocal' | 'useServer' | 'useLocalAndUpload' | 'conflict';

export function decideLoad(local: { revision: number; syncedRevision: number } | null, server: { revision: number } | null): LoadDecision {
  if (!local) return 'useServer';
  if (!server) return local.revision > local.syncedRevision ? 'useLocalAndUpload' : 'useLocal';
  if (local.revision === local.syncedRevision) return server.revision > local.syncedRevision ? 'useServer' : 'useLocal';
  return server.revision === local.syncedRevision ? 'useLocalAndUpload' : 'conflict';
}
