#!/usr/bin/env node
// Docker smoke test for the Save_API (task 22.3). Builds the image and starts docker-compose.yml
// under a throwaway project name, volume, container name and host port, so a production container
// that is already running is not touched. Checks health, a profile/slot/save round trip, rejection
// of a stale revision, and that a save survives a container restart. Everything is torn down
// afterwards, including the volume.
//
// Requires Docker with Compose v2.24.4 or newer (the override uses the !override YAML tag).
// Usage: npm run smoke:docker        Optional: HR_SMOKE_PORT (host port, default 13003).
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const composeFile = join(root, 'docker-compose.yml');
const service = 'human-resource';
const id = randomBytes(4).toString('hex');
const project = `hr-smoke-${id}`;
const port = Number(process.env.HR_SMOKE_PORT ?? 13003);
const base = `http://127.0.0.1:${port}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function docker(args) {
  const { stdout } = await execFileAsync('docker', args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

function compose(overrideFile, args) {
  return docker(['compose', '-p', project, '-f', composeFile, '-f', overrideFile, ...args]);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

async function waitHealthy(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const r = await api('/api/health');
      if (r.status === 200 && r.json?.ok === true) return;
    } catch {
      // Container not accepting connections yet; keep polling.
    }
    if (Date.now() > deadline) throw new Error(`health endpoint not ready on ${base} within ${timeoutMs / 1000} s`);
    await sleep(1000);
  }
}

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`FAIL  ${name}: ${err.message}`);
    throw err;
  }
}

const workDir = await mkdtemp(join(tmpdir(), 'hr-smoke-'));
const overrideFile = join(workDir, 'override.yml');
// Throwaway image tag, container name and host port; the base compose file supplies everything else.
await writeFile(
  overrideFile,
  [
    'services:',
    `  ${service}:`,
    `    image: hr-smoke:${id}`,
    `    container_name: hr-smoke-${id}`,
    '    ports: !override',
    `      - "127.0.0.1:${port}:8080"`,
    '',
  ].join('\n'),
);

let pid = '';
const sid = 'smokeslot';
const documentAt = (revision) => ({
  schemaVersion: 1,
  revision,
  syncedRevision: 0,
  timestamp: new Date().toISOString(),
  profileId: pid,
  slotId: sid,
  state: { smoke: id, revision },
});

try {
  await step('docker daemon reachable', () => docker(['version', '--format', '{{.Server.Version}}']));
  await step('compose stack builds and starts', () => compose(overrideFile, ['up', '-d', '--build']));
  await step('health endpoint responds', waitHealthy);

  await step('create profile', async () => {
    const r = await api('/api/profiles', { method: 'POST', body: { displayName: `smoke-${id}` } });
    assert.equal(r.status, 201);
    pid = r.json.id;
    assert.ok(pid, 'profile id returned');
  });

  await step('create slot', async () => {
    const r = await api(`/api/profiles/${pid}/slots/${sid}`, { method: 'PUT', body: { name: 'Smoke' } });
    assert.equal(r.status, 200);
  });

  const saved = documentAt(1);
  await step('upload save at revision 1', async () => {
    const r = await api(`/api/profiles/${pid}/slots/${sid}/save`, { method: 'PUT', body: { baseRevision: 0, document: saved } });
    assert.equal(r.status, 200);
    assert.equal(r.json.revision, 1);
  });

  await step('download save matches what was uploaded', async () => {
    const r = await api(`/api/profiles/${pid}/slots/${sid}/save`);
    assert.equal(r.status, 200);
    assert.deepStrictEqual(r.json, saved);
  });

  await step('stale upload is rejected with 409', async () => {
    const r = await api(`/api/profiles/${pid}/slots/${sid}/save`, { method: 'PUT', body: { baseRevision: 0, document: documentAt(1) } });
    assert.equal(r.status, 409);
  });

  await step('save survives a container restart', async () => {
    await compose(overrideFile, ['restart', service]);
    await waitHealthy();
    const r = await api(`/api/profiles/${pid}/slots/${sid}/save`);
    assert.equal(r.status, 200);
    assert.deepStrictEqual(r.json, saved);
  });
} finally {
  // Always tear down, even after a failed step: stack, containers, the throwaway volume and image.
  await compose(overrideFile, ['down', '--volumes', '--rmi', 'local', '--remove-orphans']).catch((err) => {
    console.log(`WARN  teardown reported an error: ${err.message}`);
  });
  await rm(workDir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok).length;
console.log(failed === 0 ? `\nDocker smoke test passed (${results.length} checks).` : `\nDocker smoke test failed.`);
process.exitCode = failed === 0 ? 0 : 1;
