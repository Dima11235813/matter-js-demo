import { describe, it, expect, beforeEach } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { analogyKey, counterTotal, SyncRecord } from '@lexical/shared';
import { createApp } from '../src/app';
import { createVerifier } from '../src/auth';
import { loadConfig } from '../src/config';
import { createPgliteDb, type Db } from '../src/db';
import { migrate } from '../src/migrations';

const PROJECT = 'lexical-test';
const DEV_SECRET = 'dev-secret-for-tests-only-0123456789';
const DEVICE_A = '11111111-1111-4111-8111-111111111111';
const DEVICE_B = '22222222-2222-4222-8222-222222222222';
const SECRET_A = 'a'.repeat(64);
const SECRET_B = 'b'.repeat(64);

let db: Db;
let app: ReturnType<typeof createApp>;
let signFirebase: (claims: { sub: string; aud?: string; iss?: string }) => Promise<string>;

beforeEach(async () => {
  db = await createPgliteDb(); // in-memory
  await migrate(db);
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256' };
  signFirebase = ({ sub, aud = PROJECT, iss = `https://securetoken.google.com/${PROJECT}` }) =>
    new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer(iss).setAudience(aud).setSubject(sub)
      .setIssuedAt().setExpirationTime('1h').sign(privateKey);
  const verifier = createVerifier({ firebaseProjectId: PROJECT, devAuthSecret: DEV_SECRET, firebaseKeys: createLocalJWKSet({ keys: [jwk] }) });
  app = createApp({ db, verifier });
});

const call = (method: string, path: string, token?: string, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const devToken = async (subject: string) => (await (await call('POST', '/dev/token', undefined, { subject })).json()).token as string;

const profile = (deviceId: string, at: number, scoreByDevice: Record<string, number>): SyncRecord => ({
  collection: 'profile', key: 'profile', schemaVersion: 1, clientUpdatedAt: at, deviceId, payload: { hintMode: true, scoreByDevice },
});
const analogy = (deviceId: string, at: number, plays: Record<string, number>): SyncRecord => ({
  collection: 'analogies', key: analogyKey('man', 'king', 'woman'), schemaVersion: 1, clientUpdatedAt: at, deviceId,
  payload: { a: 'man', b: 'king', c: 'woman', answer: 'queen', similarity: 0.47, alternatives: [], vocabVersion: 'v1', playsByDevice: plays, createdAt: at },
});

describe('API basics and auth', () => {
  it('reports health without auth', async () => {
    expect(await (await call('GET', '/health')).json()).toEqual({ ok: true, db: 'pglite' });
  });

  it('rejects requests without a valid token', async () => {
    expect((await call('GET', '/sync/pull')).status).toBe(401);
    expect((await call('GET', '/sync/pull', 'garbage')).status).toBe(401);
  });

  it('accepts Firebase tokens for this project only', async () => {
    const good = await signFirebase({ sub: 'google-user-1' });
    expect((await call('GET', '/sync/pull', good)).status).toBe(200);
    expect((await call('GET', '/sync/pull', await signFirebase({ sub: 'x', aud: 'other-project' }))).status).toBe(401);
    expect((await call('GET', '/sync/pull', await signFirebase({ sub: 'x', iss: 'https://securetoken.google.com/other-project' }))).status).toBe(401);
  });

  it('maps one identity to one user across requests', async () => {
    const token = await signFirebase({ sub: 'google-user-2' });
    await call('POST', '/devices/claim', token, { deviceId: DEVICE_A, deviceSecret: SECRET_A });
    const exported = await (await call('GET', '/me/export', token)).json();
    const again = await (await call('GET', '/me/export', await signFirebase({ sub: 'google-user-2' }))).json();
    expect(again.userId).toBe(exported.userId);
    expect(again.devices).toHaveLength(1);
  });

  it('refuses the dev token issuer in production configuration', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', DEV_AUTH_SECRET: DEV_SECRET, DATABASE_URL: 'postgres://x' })).toThrow(/DEV_AUTH_SECRET/);
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
  });
});

describe('device claim', () => {
  it('claims, recognizes the owner, and protects against other accounts and wrong secrets', async () => {
    const alice = await devToken('alice');
    const bob = await devToken('bob');
    expect((await call('POST', '/devices/claim', alice, { deviceId: DEVICE_A, deviceSecret: SECRET_A })).status).toBe(201);
    expect(await (await call('POST', '/devices/claim', alice, { deviceId: DEVICE_A, deviceSecret: SECRET_A })).json()).toEqual({ status: 'already-yours' });
    expect((await call('POST', '/devices/claim', bob, { deviceId: DEVICE_A, deviceSecret: SECRET_A })).status).toBe(409);
    expect((await call('POST', '/devices/claim', bob, { deviceId: DEVICE_A, deviceSecret: SECRET_B })).status).toBe(403);
  });

  it('requires a claimed device before syncing', async () => {
    const alice = await devToken('alice');
    const push = await call('POST', '/sync/push', alice, { deviceId: DEVICE_A, records: [profile(DEVICE_A, 1, { [DEVICE_A]: 5 })] });
    expect(push.status).toBe(403);
  });
});

describe('sync', () => {
  const setup = async () => {
    const token = await devToken('carol');
    await call('POST', '/devices/claim', token, { deviceId: DEVICE_A, deviceSecret: SECRET_A });
    await call('POST', '/devices/claim', token, { deviceId: DEVICE_B, deviceSecret: SECRET_B });
    return token;
  };

  it('two devices that played offline converge with no lost points', async () => {
    const token = await setup();
    const first = await (await call('POST', '/sync/push', token, { deviceId: DEVICE_A, records: [profile(DEVICE_A, 100, { [DEVICE_A]: 60 }), analogy(DEVICE_A, 100, { [DEVICE_A]: 2 })] })).json();
    expect(first.results.map((r: { status: string }) => r.status)).toEqual(['applied', 'applied']);

    const second = await (await call('POST', '/sync/push', token, { deviceId: DEVICE_B, records: [profile(DEVICE_B, 200, { [DEVICE_B]: 25 }), analogy(DEVICE_B, 200, { [DEVICE_B]: 1 })] })).json();
    expect(second.results.map((r: { status: string }) => r.status)).toEqual(['merged', 'merged']);
    expect(counterTotal(second.results[0].record.payload.scoreByDevice)).toBe(85);
    expect(counterTotal(second.results[1].record.payload.playsByDevice)).toBe(3);

    // Device A pulls from the start and sees the merged state; pushing its old copy again changes nothing.
    const pulled = await (await call('GET', '/sync/pull', token)).json();
    expect(pulled.changes).toHaveLength(2);
    expect(counterTotal(pulled.changes.find((c: { record: SyncRecord }) => c.record.collection === 'profile').record.payload.scoreByDevice)).toBe(85);
    const replay = await (await call('POST', '/sync/push', token, { deviceId: DEVICE_A, records: [profile(DEVICE_A, 100, { [DEVICE_A]: 60 })] })).json();
    expect(counterTotal(replay.results[0].record.payload.scoreByDevice)).toBe(85);
  });

  it('pulls in pages after a cursor', async () => {
    const token = await setup();
    const games = Array.from({ length: 5 }, (_, i): SyncRecord => ({
      collection: 'games', key: `00000000-0000-4000-8000-00000000000${i}`, schemaVersion: 1, clientUpdatedAt: i, deviceId: DEVICE_A,
      payload: { mode: 'timed', rulesVersion: 2, startedAt: i, endedAt: i + 1, score: i * 100, analogies: i, wordsDealt: 10, hintMode: true },
    }));
    await call('POST', '/sync/push', token, { deviceId: DEVICE_A, records: games });
    const page1 = await (await call('GET', '/sync/pull?limit=3', token)).json();
    expect(page1.changes).toHaveLength(3);
    expect(page1.hasMore).toBe(true);
    const page2 = await (await call('GET', `/sync/pull?since=${page1.nextCursor}&limit=3`, token)).json();
    expect(page2.changes).toHaveLength(2);
    expect(page2.hasMore).toBe(false);
    const empty = await (await call('GET', `/sync/pull?since=${page2.nextCursor}`, token)).json();
    expect(empty.changes).toEqual([]);
  });

  it('rejects non-canonical keys and invalid bodies', async () => {
    const token = await setup();
    const bad = { ...analogy(DEVICE_A, 1, { [DEVICE_A]: 1 }), key: 'Man:King::Woman' };
    const res = await call('POST', '/sync/push', token, { deviceId: DEVICE_A, records: [bad] });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('non-canonical-key');
    expect((await call('POST', '/sync/push', token, { deviceId: DEVICE_A, records: [{ collection: 'meta' }] })).status).toBe(400);
  });

  it("keeps each user's data separate", async () => {
    const carol = await setup();
    await call('POST', '/sync/push', carol, { deviceId: DEVICE_A, records: [profile(DEVICE_A, 1, { [DEVICE_A]: 5 })] });
    const dave = await devToken('dave');
    expect((await (await call('GET', '/sync/pull', dave)).json()).changes).toEqual([]);
  });
});

describe('export and delete', () => {
  it('exports everything, then deletes the account with a receipt', async () => {
    const token = await devToken('erin');
    await call('POST', '/devices/claim', token, { deviceId: DEVICE_A, deviceSecret: SECRET_A });
    await call('POST', '/sync/push', token, { deviceId: DEVICE_A, records: [profile(DEVICE_A, 1, { [DEVICE_A]: 5 }), analogy(DEVICE_A, 1, { [DEVICE_A]: 1 })] });
    const exported = await (await call('GET', '/me/export', token)).json();
    expect(exported.kind).toBe('lexical-fountain-account-export');
    expect(exported.records).toHaveLength(2);

    const deleted = await (await call('DELETE', '/me', token)).json();
    expect(deleted.deleted).toEqual({ records: 2, devices: 1 });
    expect(deleted.receipt).toMatch(/[0-9a-f-]{36}/);
    const ledger = (await db.query<{ completed_at: string | null }>('SELECT completed_at FROM deletion_ledger WHERE receipt = $1', [deleted.receipt])).rows[0];
    expect(ledger.completed_at).not.toBeNull();
    // Signing in again starts a fresh, empty account; the device can be claimed again.
    expect((await (await call('GET', '/me/export', token)).json()).records).toEqual([]);
    expect((await call('POST', '/devices/claim', token, { deviceId: DEVICE_A, deviceSecret: SECRET_A })).status).toBe(201);
  });
});
