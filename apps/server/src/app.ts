// Save_API (Requirements 22, 25, 26, 43). Stores Profiles and Save_Documents as JSON files and
// serves the built web app. Security is deliberately deferred: Tailscale membership is the only
// real access control; `accessGuard` is the single place to add authentication later.
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  CURRENT_SCHEMA_VERSION,
  MAX_SAVE_BYTES,
  MIN_SUPPORTED_SCHEMA_VERSION,
  createProfileBodySchema,
  hashPin,
  lockStatus,
  overwriteSaveBodySchema,
  patchProfileBodySchema,
  putSaveBodySchema,
  putSlotBodySchema,
  sameDisplayName,
  validateDisplayName,
  validatePin,
  validateSlotName,
  verifyPin,
  verifyPinBodySchema,
  type PinRecord,
  type ProfileDto,
  type SaveDocument,
  type SlotDto,
} from '@hr/shared';
import type { z } from 'zod';
import { FileStore, withLock } from './storage/fileStore';

export interface AppOptions {
  dataDir: string;
  webDir: string | null;
  maxSaveBytes?: number;
  maxSchemaVersion?: number;
}

interface ProfileRecord {
  id: string;
  displayName: string;
  pin: PinRecord | null;
  createdAt: string;
}

const toDto = (p: ProfileRecord): ProfileDto => ({ id: p.id, displayName: p.displayName, hasPin: p.pin !== null, pin: p.pin });

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const store = new FileStore(opts.dataDir);
  const maxBytes = opts.maxSaveBytes ?? Number(process.env.MAX_SAVE_BYTES ?? MAX_SAVE_BYTES);
  const maxSchema = opts.maxSchemaVersion ?? CURRENT_SCHEMA_VERSION;
  const failures = new Map<string, number[]>(); // PIN lockout per profile (in memory, 26.4)
  const app = Fastify({ logger: false, bodyLimit: Math.max(6 * 1024 * 1024, maxBytes + 1024 * 1024) });

  // Placeholder access control. Replace this hook to add real auth later; the Save_Document
  // format does not change (26.9).
  app.addHook('onRequest', async () => {});

  const profiles = async (): Promise<ProfileRecord[]> => (await store.readJson<ProfileRecord[]>('profiles.json')) ?? [];
  const slotsFile = (pid: string) => `saves/${pid}/slots.json`;
  const saveFile = (pid: string, sid: string) => `saves/${pid}/${sid}.json`;
  const backupFile = (pid: string, sid: string) => `saves/${pid}/${sid}.backup.json`;
  const slots = async (pid: string): Promise<SlotDto[]> => (await store.readJson<SlotDto[]>(slotsFile(pid))) ?? [];
  const safeId = (s: string) => /^[\w-]{1,64}$/.test(s);

  function parse<T>(schema: z.ZodType<T>, req: FastifyRequest, reply: FastifyReply): T | null {
    const r = schema.safeParse(req.body);
    if (r.success) return r.data;
    void reply.code(400).send({ error: 'invalid_field', field: r.error.issues[0]?.path.join('.') || 'body' });
    return null;
  }

  async function checkPin(p: ProfileRecord, pin: string | undefined, reply: FastifyReply): Promise<boolean> {
    if (!p.pin) return true;
    const now = Date.now();
    const st = lockStatus(failures.get(p.id) ?? [], now);
    if (st.locked) {
      void reply.code(423).send({ error: 'pin_locked', retryAfterSec: Math.ceil(st.retryAfterMs / 1000) });
      return false;
    }
    if (pin !== undefined && (await verifyPin(pin, p.pin))) {
      failures.delete(p.id);
      return true;
    }
    const list = [...(failures.get(p.id) ?? []), now];
    failures.set(p.id, list);
    const after = lockStatus(list, now);
    if (after.locked) void reply.code(423).send({ error: 'pin_locked', retryAfterSec: Math.ceil(after.retryAfterMs / 1000) });
    else void reply.code(401).send({ error: 'wrong_pin', attemptsLeft: after.attemptsLeft });
    return false;
  }

  app.get('/api/health', async (_req, reply) => ((await store.probe()) ? { ok: true } : reply.code(503).send({ ok: false })));

  // ---------- Profiles ----------
  app.get('/api/profiles', async () => (await profiles()).map(toDto));

  app.post('/api/profiles', async (req, reply) => {
    const body = parse(createProfileBodySchema, req, reply);
    if (!body) return reply;
    if (validateDisplayName(body.displayName)) return reply.code(400).send({ error: 'invalid_field', field: 'displayName' });
    if (body.pin !== undefined && validatePin(body.pin)) return reply.code(400).send({ error: 'invalid_field', field: 'pin' });
    return withLock('profiles', async () => {
      const list = await profiles();
      if (list.some((p) => sameDisplayName(p.displayName, body.displayName))) return reply.code(409).send({ error: 'display_name_taken', field: 'displayName' });
      const rec: ProfileRecord = { id: randomUUID(), displayName: body.displayName.trim(), pin: body.pin ? await hashPin(body.pin) : null, createdAt: new Date().toISOString() };
      await store.writeJson('profiles.json', [...list, rec]);
      return reply.code(201).send(toDto(rec));
    });
  });

  app.patch<{ Params: { pid: string } }>('/api/profiles/:pid', async (req, reply) => {
    const body = parse(patchProfileBodySchema, req, reply);
    if (!body) return reply;
    return withLock('profiles', async () => {
      const list = await profiles();
      const p = list.find((x) => x.id === req.params.pid);
      if (!p) return reply.code(404).send({ error: 'not_found' });
      if (!(await checkPin(p, body.currentPin, reply))) return reply; // PIN change/removal needs the current PIN (22.8)
      if (body.displayName !== undefined) {
        if (validateDisplayName(body.displayName)) return reply.code(400).send({ error: 'invalid_field', field: 'displayName' });
        if (list.some((x) => x.id !== p.id && sameDisplayName(x.displayName, body.displayName ?? ''))) return reply.code(409).send({ error: 'display_name_taken', field: 'displayName' });
        p.displayName = body.displayName.trim();
      }
      if (body.newPin !== undefined) {
        if (validatePin(body.newPin)) return reply.code(400).send({ error: 'invalid_field', field: 'newPin' });
        p.pin = body.newPin === '' ? null : await hashPin(body.newPin);
      }
      await store.writeJson('profiles.json', list);
      return toDto(p);
    });
  });

  app.post<{ Params: { pid: string } }>('/api/profiles/:pid/pin/verify', async (req, reply) => {
    const body = parse(verifyPinBodySchema, req, reply);
    if (!body) return reply;
    const p = (await profiles()).find((x) => x.id === req.params.pid);
    if (!p) return reply.code(404).send({ error: 'not_found' });
    if (!(await checkPin(p, body.pin, reply))) return reply;
    return { ok: true };
  });

  // ---------- Slots ----------
  app.get<{ Params: { pid: string } }>('/api/profiles/:pid/slots', async (req, reply) => {
    if (!safeId(req.params.pid)) return reply.code(400).send({ error: 'invalid_field', field: 'pid' });
    return slots(req.params.pid);
  });

  app.put<{ Params: { pid: string; sid: string } }>('/api/profiles/:pid/slots/:sid', async (req, reply) => {
    const { pid, sid } = req.params;
    if (!safeId(pid) || !safeId(sid)) return reply.code(400).send({ error: 'invalid_field', field: 'sid' });
    const body = parse(putSlotBodySchema, req, reply);
    if (!body) return reply;
    if (validateSlotName(body.name)) return reply.code(400).send({ error: 'invalid_field', field: 'name' });
    return withLock(slotsFile(pid), async () => {
      const list = await slots(pid);
      const cur = list.find((x) => x.slotId === sid);
      if (cur?.deleted) return reply.code(410).send({ error: 'slot_deleted' });
      const rec: SlotDto = cur ? { ...cur, name: body.name.trim() } : { slotId: sid, name: body.name.trim(), revision: 0, schemaVersion: 0, updatedAt: new Date().toISOString(), deleted: false };
      await store.writeJson(slotsFile(pid), cur ? list.map((x) => (x.slotId === sid ? rec : x)) : [...list, rec]);
      return rec;
    });
  });

  app.delete<{ Params: { pid: string; sid: string } }>('/api/profiles/:pid/slots/:sid', async (req, reply) => {
    const { pid, sid } = req.params;
    if (!safeId(pid) || !safeId(sid)) return reply.code(400).send({ error: 'invalid_field', field: 'sid' });
    await withLock(slotsFile(pid), async () => {
      const list = await slots(pid);
      const cur = list.find((x) => x.slotId === sid);
      const tomb: SlotDto = { ...(cur ?? { slotId: sid, name: sid, revision: 0, schemaVersion: 0 }), updatedAt: new Date().toISOString(), deleted: true };
      await store.writeJson(slotsFile(pid), cur ? list.map((x) => (x.slotId === sid ? tomb : x)) : [...list, tomb]);
      await store.remove(saveFile(pid, sid));
    });
    return reply.code(204).send();
  });

  // ---------- Saves ----------
  async function slotState(pid: string, sid: string): Promise<'deleted' | 'ok'> {
    return (await slots(pid)).find((x) => x.slotId === sid)?.deleted ? 'deleted' : 'ok';
  }

  app.get<{ Params: { pid: string; sid: string } }>('/api/profiles/:pid/slots/:sid/save/meta', async (req, reply) => {
    const { pid, sid } = req.params;
    if (!safeId(pid) || !safeId(sid)) return reply.code(400).send({ error: 'invalid_field', field: 'sid' });
    if ((await slotState(pid, sid)) === 'deleted') return reply.code(410).send({ error: 'slot_deleted' });
    const doc = await store.readJson<SaveDocument>(saveFile(pid, sid));
    if (!doc) return reply.code(404).send({ error: 'not_found' });
    return { revision: doc.revision, schemaVersion: doc.schemaVersion, updatedAt: doc.timestamp };
  });

  app.get<{ Params: { pid: string; sid: string } }>('/api/profiles/:pid/slots/:sid/save', async (req, reply) => {
    const { pid, sid } = req.params;
    if (!safeId(pid) || !safeId(sid)) return reply.code(400).send({ error: 'invalid_field', field: 'sid' });
    if ((await slotState(pid, sid)) === 'deleted') return reply.code(410).send({ error: 'slot_deleted' });
    const doc = await store.readJson<SaveDocument>(saveFile(pid, sid));
    return doc ?? reply.code(404).send({ error: 'not_found' });
  });

  async function storeDoc(pid: string, sid: string, doc: SaveDocument): Promise<void> {
    await store.writeJson(saveFile(pid, sid), doc);
    const list = await slots(pid);
    const cur = list.find((x) => x.slotId === sid);
    const rec: SlotDto = { slotId: sid, name: cur?.name ?? sid, revision: doc.revision, schemaVersion: doc.schemaVersion, updatedAt: doc.timestamp, deleted: false };
    await store.writeJson(slotsFile(pid), cur ? list.map((x) => (x.slotId === sid ? rec : x)) : [...list, rec]);
  }

  function checkDoc(pid: string, sid: string, doc: SaveDocument, raw: unknown, reply: FastifyReply, stored: SaveDocument | null): boolean {
    if (doc.profileId !== pid || doc.slotId !== sid) {
      void reply.code(400).send({ error: 'invalid_field', field: 'document.slotId' });
      return false;
    }
    const bytes = Buffer.byteLength(JSON.stringify(raw));
    if (bytes > maxBytes) {
      void reply.code(413).send({ error: 'too_large', limitBytes: maxBytes });
      return false;
    }
    if (doc.schemaVersion > maxSchema || doc.schemaVersion < MIN_SUPPORTED_SCHEMA_VERSION) {
      void reply.code(422).send({ error: 'unsupported_schema', supported: [MIN_SUPPORTED_SCHEMA_VERSION, maxSchema] });
      return false;
    }
    if (stored && doc.schemaVersion < stored.schemaVersion) {
      void reply.code(426).send({ error: 'client_outdated', storedSchemaVersion: stored.schemaVersion });
      return false;
    }
    return true;
  }

  app.put<{ Params: { pid: string; sid: string } }>('/api/profiles/:pid/slots/:sid/save', async (req, reply) => {
    const { pid, sid } = req.params;
    if (!safeId(pid) || !safeId(sid)) return reply.code(400).send({ error: 'invalid_field', field: 'sid' });
    const body = parse(putSaveBodySchema, req, reply);
    if (!body) return reply;
    return withLock(saveFile(pid, sid), async () => {
      if ((await slotState(pid, sid)) === 'deleted') return reply.code(410).send({ error: 'slot_deleted' });
      const stored = await store.readJson<SaveDocument>(saveFile(pid, sid));
      const doc = body.document as SaveDocument;
      if (!checkDoc(pid, sid, doc, (req.body as { document: unknown }).document, reply, stored)) return reply;
      const current = stored?.revision ?? 0;
      // Accepted iff the client built on the current server Revision (25.2, 25.3)
      if (body.baseRevision !== current || doc.revision <= body.baseRevision) return reply.code(409).send({ error: 'conflict', serverRevision: current });
      await storeDoc(pid, sid, doc);
      return { revision: doc.revision };
    });
  });

  app.post<{ Params: { pid: string; sid: string } }>('/api/profiles/:pid/slots/:sid/save/overwrite', async (req, reply) => {
    const { pid, sid } = req.params;
    if (!safeId(pid) || !safeId(sid)) return reply.code(400).send({ error: 'invalid_field', field: 'sid' });
    const body = parse(overwriteSaveBodySchema, req, reply);
    if (!body) return reply;
    return withLock(saveFile(pid, sid), async () => {
      if ((await slotState(pid, sid)) === 'deleted') return reply.code(410).send({ error: 'slot_deleted' });
      const stored = await store.readJson<SaveDocument>(saveFile(pid, sid));
      const doc = body.document as SaveDocument;
      if (!checkDoc(pid, sid, doc, (req.body as { document: unknown }).document, reply, stored)) return reply;
      const current = stored?.revision ?? 0;
      if (body.replacedRevision !== current || doc.revision <= current) return reply.code(409).send({ error: 'conflict', serverRevision: current });
      if (stored) await store.writeJson(backupFile(pid, sid), stored); // server backup (25.6)
      await storeDoc(pid, sid, doc);
      return { revision: doc.revision };
    });
  });

  // ---------- Static web app with SPA fallback ----------
  if (opts.webDir && existsSync(opts.webDir)) {
    await app.register(fastifyStatic, {
      root: opts.webDir,
      setHeaders(res, path) {
        // Works with both the raw ServerResponse and FastifyReply shapes across plugin versions.
        const r = res as unknown as { setHeader?: (k: string, v: string) => void; header?: (k: string, v: string) => void };
        const set = (v: string) => (r.setHeader ?? r.header)?.call(r, 'cache-control', v);
        if (/(sw\.js|index\.html|manifest\.webmanifest)$/.test(path)) set('no-cache');
        else if (/[\\/]assets[\\/]/.test(path)) set('public, max-age=31536000, immutable');
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not_found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
