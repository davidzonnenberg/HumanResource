// Typed Save_API client (8 s timeout). Network failures surface as { kind: 'offline' }.
import type { ApiError, ProfileDto, SaveDocument, SaveMeta, SlotDto } from '@hr/shared';

export type ApiResult<T> = { kind: 'ok'; status: number; data: T } | { kind: 'error'; status: number; error: ApiError } | { kind: 'offline' };

export interface ApiClient {
  health(): Promise<ApiResult<{ ok: boolean }>>;
  listProfiles(): Promise<ApiResult<ProfileDto[]>>;
  createProfile(displayName: string, pin?: string): Promise<ApiResult<ProfileDto>>;
  verifyPin(profileId: string, pin: string): Promise<ApiResult<{ ok: true }>>;
  patchProfile(profileId: string, body: { displayName?: string; newPin?: string; currentPin?: string }): Promise<ApiResult<ProfileDto>>;
  listSlots(profileId: string): Promise<ApiResult<SlotDto[]>>;
  putSlot(profileId: string, slotId: string, name: string): Promise<ApiResult<SlotDto>>;
  deleteSlot(profileId: string, slotId: string): Promise<ApiResult<null>>;
  saveMeta(profileId: string, slotId: string): Promise<ApiResult<SaveMeta>>;
  getSave(profileId: string, slotId: string): Promise<ApiResult<SaveDocument>>;
  putSave(profileId: string, slotId: string, baseRevision: number, document: SaveDocument): Promise<ApiResult<{ revision: number }>>;
  overwriteSave(profileId: string, slotId: string, replacedRevision: number, document: SaveDocument): Promise<ApiResult<{ revision: number }>>;
}

export function httpApiClient(base = '/api', timeoutMs = 8000, fetchImpl: typeof fetch = (...a) => fetch(...a)): ApiClient {
  async function call<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const init: RequestInit = { method, signal: ctrl.signal, headers: body === undefined ? {} : { 'content-type': 'application/json' } };
      if (body !== undefined) init.body = JSON.stringify(body);
      const res = await fetchImpl(`${base}${path}`, init);
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? (JSON.parse(text) as unknown) : null;
      } catch {
        json = null;
      }
      if (res.ok) return { kind: 'ok', status: res.status, data: json as T };
      // 5xx (e.g. the dev proxy when the Save_API is not running) counts as unreachable.
      if (res.status >= 500) return { kind: 'offline' };
      return { kind: 'error', status: res.status, error: (json ?? { error: 'not_found' }) as ApiError };
    } catch {
      return { kind: 'offline' };
    } finally {
      clearTimeout(timer);
    }
  }
  const p = (id: string) => `/profiles/${encodeURIComponent(id)}`;
  const s = (pid: string, sid: string) => `${p(pid)}/slots/${encodeURIComponent(sid)}`;
  return {
    health: () => call('GET', '/health'),
    listProfiles: () => call('GET', '/profiles'),
    createProfile: (displayName, pin) => call('POST', '/profiles', pin ? { displayName, pin } : { displayName }),
    verifyPin: (pid, pin) => call('POST', `${p(pid)}/pin/verify`, { pin }),
    patchProfile: (pid, body) => call('PATCH', p(pid), body),
    listSlots: (pid) => call('GET', `${p(pid)}/slots`),
    putSlot: (pid, sid, name) => call('PUT', s(pid, sid), { name }),
    deleteSlot: (pid, sid) => call('DELETE', s(pid, sid)),
    saveMeta: (pid, sid) => call('GET', `${s(pid, sid)}/save/meta`),
    getSave: (pid, sid) => call('GET', `${s(pid, sid)}/save`),
    putSave: (pid, sid, baseRevision, document) => call('PUT', `${s(pid, sid)}/save`, { baseRevision, document }),
    overwriteSave: (pid, sid, replacedRevision, document) => call('POST', `${s(pid, sid)}/save/overwrite`, { replacedRevision, document }),
  };
}
