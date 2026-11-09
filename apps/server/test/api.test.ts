import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { removePin } from '../src/cli';

let dir: string;
let app: FastifyInstance;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hr-api-'));
  app = await buildApp({ dataDir: dir, webDir: null, maxSaveBytes: 2000 });
});
afterEach(async () => {
  await app.close();
  await rm(dir, { recursive: true, force: true });
});

const doc = (pid: string, sid: string, revision: number, extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  revision,
  syncedRevision: 0,
  timestamp: new Date().toISOString(),
  profileId: pid,
  slotId: sid,
  state: { tick: revision, ...extra },
});

describe('Save_API', () => {
  it('health probes the data dir', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/health' });
    expect(r.statusCode).toBe(200);
  });

  it('creates profiles, rejects duplicates and invalid fields', async () => {
    const a = await app.inject({ method: 'POST', url: '/api/profiles', payload: { displayName: 'David', pin: '1234' } });
    expect(a.statusCode).toBe(201);
    expect(a.json()).toMatchObject({ displayName: 'David', hasPin: true });
    const dup = await app.inject({ method: 'POST', url: '/api/profiles', payload: { displayName: 'david' } });
    expect(dup.statusCode).toBe(409);
    const bad = await app.inject({ method: 'POST', url: '/api/profiles', payload: { displayName: 'X', pin: '12' } });
    expect(bad.json()).toEqual({ error: 'invalid_field', field: 'pin' });
  });

  it('verifies PINs and locks after 5 failures; CLI removes a PIN', async () => {
    const p = (await app.inject({ method: 'POST', url: '/api/profiles', payload: { displayName: 'Sam', pin: '4321' } })).json() as { id: string };
    expect((await app.inject({ method: 'POST', url: `/api/profiles/${p.id}/pin/verify`, payload: { pin: '4321' } })).statusCode).toBe(200);
    let last = 0;
    for (let i = 0; i < 5; i++) last = (await app.inject({ method: 'POST', url: `/api/profiles/${p.id}/pin/verify`, payload: { pin: '0000' } })).statusCode;
    expect(last).toBe(423);
    expect(await removePin(dir, 'sam')).toBe(true);
    const list = (await app.inject({ method: 'GET', url: '/api/profiles' })).json() as { hasPin: boolean }[];
    expect(list[0]?.hasPin).toBe(false);
  });

  it('accepts uploads only on the current base revision (409 otherwise)', async () => {
    const url = '/api/profiles/p1/slots/s1/save';
    expect((await app.inject({ method: 'PUT', url, payload: { baseRevision: 0, document: doc('p1', 's1', 1) } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PUT', url, payload: { baseRevision: 1, document: doc('p1', 's1', 2) } })).statusCode).toBe(200);
    const stale = await app.inject({ method: 'PUT', url, payload: { baseRevision: 1, document: doc('p1', 's1', 3) } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ error: 'conflict', serverRevision: 2 });
    const over = await app.inject({ method: 'POST', url: `${url}/overwrite`, payload: { replacedRevision: 2, document: doc('p1', 's1', 5) } });
    expect(over.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `${url}/meta` })).json()).toMatchObject({ revision: 5 });
  });

  it('rejects oversized, unsupported and deleted-slot uploads', async () => {
    const url = '/api/profiles/p1/slots/s2/save';
    const big = await app.inject({ method: 'PUT', url, payload: { baseRevision: 0, document: doc('p1', 's2', 1, { pad: 'x'.repeat(5000) }) } });
    expect(big.statusCode).toBe(413);
    const newer = await app.inject({ method: 'PUT', url, payload: { baseRevision: 0, document: { ...doc('p1', 's2', 1), schemaVersion: 99 } } });
    expect(newer.statusCode).toBe(422);
    expect((await app.inject({ method: 'DELETE', url: '/api/profiles/p1/slots/s2' })).statusCode).toBe(204);
    expect((await app.inject({ method: 'PUT', url, payload: { baseRevision: 0, document: doc('p1', 's2', 1) } })).statusCode).toBe(410);
  });
});
