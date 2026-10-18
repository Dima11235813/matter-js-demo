import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { openLexicalDb } from '../src/persistence/db';
import { LexicalRepository } from '../src/persistence/LexicalRepository';
import { ApiClient } from '../src/account/apiClient';
import { pushBatches, syncOnce, SyncConflictError, type SyncPort } from '../src/account/syncService';
import type { SavedSession } from '../src/game/sessions';
import { sessionToSync } from '../src/persistence/syncRecords';
import { SyncRecord } from '@lexical/shared';
import { createApp } from '../server/src/app';
import { createVerifier } from '../server/src/auth';
import { createPgliteDb } from '../server/src/db';
import { migrate } from '../server/src/migrations';

/**
 * The whole sync stack in one process: two devices (two IndexedDB databases) with the real repository and
 * sync service, talking to the real server app on in-memory Postgres (PGlite). No network, no browser.
 */
const DEV_SECRET = 'dev-secret-for-tests-only-0123456789';
let app: ReturnType<typeof createApp>;
let dbCount = 0;

beforeEach(async () => {
  const db = await createPgliteDb();
  await migrate(db);
  app = createApp({ db, verifier: createVerifier({ devAuthSecret: DEV_SECRET }) });
});

async function device(subject: string) {
  const repo = await LexicalRepository.open(await openLexicalDb(`sync-device-${++dbCount}`));
  const token = (await (await app.request('/api/v1/dev/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subject }) })).json()).token as string;
  const calls: string[] = [];
  const api = new ApiClient(async () => token, '/api/v1', (url, init) => { calls.push(String(url)); return Promise.resolve(app.request(url, init)); });
  const port: SyncPort = {
    get deviceId() { return repo.deviceId; },
    get deviceSecret() { return repo.deviceSecret; },
    get accountUid() { return repo.accountUid; },
    get syncCursor() { return repo.syncCursor; },
    setAccount: changes => repo.updateMeta(changes),
    pendingSyncRecords: () => repo.pendingSyncRecords(),
    markSynced: record => repo.markSynced(record),
    applyRemote: record => repo.applyRemote(record),
  };
  return { repo, calls, sync: (uid = `dev:${subject}`) => syncOnce(api, port, uid) };
}

const queen = { a: 'man', b: 'king', c: 'woman', answer: 'queen', similarity: 0.47, alternatives: [{ word: 'monarch', similarity: 0.45 }] };
const rome = { a: 'france', b: 'paris', c: 'italy', answer: 'rome', similarity: 0.65, alternatives: [] };

describe('sync across two devices (client + server, in process)', () => {
  it('points, analogies, words, and games from two devices converge on both, with nothing lost or doubled', async () => {
    const laptop = await device('alice');
    const phone = await device('alice');

    // Offline play on both devices.
    await laptop.repo.addScore(60);
    await laptop.repo.recordAnalogy(queen, 'v1');
    await laptop.repo.recordAnalogy(queen, 'v1');
    await laptop.repo.savePlayerWord('zyzzyva', Float32Array.from([0.25, -0.5, 1]), 'model-x', 'q8');
    await phone.repo.addScore(25);
    await phone.repo.recordAnalogy(queen, 'v1');
    await phone.repo.recordAnalogy(rome, 'v1');
    await phone.repo.saveGame({ mode: 'timed', rulesVersion: 2, startedAt: 1, endedAt: 2, score: 300, analogies: 3, wordsDealt: 10, hintMode: true });

    // Sync in either order, then once more so each device sees the other's changes.
    const first = await laptop.sync();
    expect(first.pushed).toBe(3); // profile, analogy, word
    await phone.sync();
    await laptop.sync();

    for (const { repo } of [laptop, phone]) {
      expect(repo.score).toBe(85);
      const exported = await repo.exportAll();
      const queenRecord = exported.analogies.find(a => a.id === 'man:king::woman')!;
      expect(queenRecord.timesPlayed).toBe(3); // 2 on the laptop + 1 on the phone
      expect(exported.analogies.map(a => a.id).sort()).toEqual(['france:paris::italy', 'man:king::woman']);
      expect(exported.words.map(w => w.word)).toEqual(['zyzzyva']);
      expect(exported.words[0].vector).toEqual([0.25, -0.5, 1]);
      expect(exported.games.map(g => g.score)).toEqual([300]);
      expect(await repo.pendingSyncRecords()).toEqual([]); // everything acknowledged
    }
  });

  it('keeps syncing idempotent: repeated syncs change nothing', async () => {
    const laptop = await device('bob');
    await laptop.repo.addScore(40);
    await laptop.sync();
    const again = await laptop.sync();
    expect(again).toEqual({ pushed: 0, pulled: 0, merged: 0 });
    expect(laptop.repo.score).toBe(40);
  });

  it('keeps a local change made after the last sync pending until the next push', async () => {
    const laptop = await device('carol');
    await laptop.repo.addScore(10);
    await laptop.sync();
    await laptop.repo.addScore(5);
    expect((await laptop.repo.pendingSyncRecords()).map(r => r.collection)).toEqual(['profile']);
    await laptop.sync();
    expect(await laptop.repo.pendingSyncRecords()).toEqual([]);
    expect(laptop.repo.score).toBe(15);
  });

  it('never merges a device into a second account silently', async () => {
    const laptop = await device('dave');
    await laptop.repo.addScore(10);
    await laptop.sync('dev:dave');
    await expect(laptop.sync('dev:someone-else')).rejects.toBeInstanceOf(SyncConflictError);
  });
});

describe('sync: the Guess rating and saved sessions (Tasks 2.12.3, 2.15.4)', () => {
  const board = (id: string, name: string, words = 3): SavedSession => ({
    id, name, savedAt: 1_790_000_000_000, schema: 1, view: 'fountain',
    words: Array.from({ length: words }, (_, i) => ({ word: `w${i}`, x: i, y: i, color: '#aabbcc' })),
    analogies: [{ a: 'man', b: 'king', c: 'woman', answer: 'queen', points: 0, similarity: 0.5 }],
  });

  it('the newest rating reaches the other device', async () => {
    const laptop = await device('erin');
    const phone = await device('erin');
    await laptop.repo.setRating({ value: 1040, plays: 5 });
    await laptop.sync();
    await phone.sync();
    expect(phone.repo.rating).toEqual({ value: 1040, plays: 5 });
    await phone.repo.setRating({ value: 1072, plays: 6 }); // played on the phone afterwards
    await phone.sync();
    await laptop.sync();
    expect(laptop.repo.rating).toEqual({ value: 1072, plays: 6 });
  });

  it('a session saved on one device appears on the other, and a delete removes it there too', async () => {
    const laptop = await device('frank');
    const phone = await device('frank');
    const id = '44444444-4444-4444-8444-444444444444';
    await laptop.repo.saveSession(board(id, 'pets'));
    await laptop.sync();
    await phone.sync();
    expect((await phone.repo.listSessions()).map(s => s.name)).toEqual(['pets']);
    expect(await phone.repo.getSession(id)).toEqual(board(id, 'pets'));

    await phone.repo.deleteSession(id);
    expect(await phone.repo.listSessions()).toEqual([]);
    await phone.sync();
    await laptop.sync();
    expect(await laptop.repo.listSessions()).toEqual([]);
    expect(await laptop.repo.getSession(id)).toBeUndefined();
    expect(await laptop.repo.pendingSyncRecords()).toEqual([]);
  });

  it('pushes and pulls large sessions in pages under the request size limit', async () => {
    const laptop = await device('gina');
    const phone = await device('gina');
    // Twenty full boards (400 words, ~22 KB each as JSON): ~440 KB, over one request's budget.
    for (let i = 0; i < 20; i++) await laptop.repo.saveSession(board(`55555555-5555-4555-8555-0000000000${String(i).padStart(2, '0')}`, `board ${i}`, 400));
    const pending = await laptop.repo.pendingSyncRecords();
    const batches = pushBatches(pending);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.every(b => b.length === 1 || JSON.stringify(b).length <= 400_000)).toBe(true);
    expect(batches.flat()).toHaveLength(pending.length);
    await laptop.sync();
    expect(laptop.calls.filter(u => u.includes('/sync/push'))).toHaveLength(batches.length);
    await phone.sync(); // the pull pages by size too (hasMore), and the client follows the pages
    expect(phone.calls.filter(u => u.includes('/sync/pull')).length).toBeGreaterThan(1);
    expect((await phone.repo.listSessions()).length).toBe(20);
  });

  it('maps a pre-v6 session (no sync stamps) with invalid entries to a record the contract accepts', () => {
    const device = '77777777-7777-4777-8777-777777777777';
    const old = {
      ...board('66666666-6666-4666-8666-666666666666', '  '),
      words: [
        { word: 'dog', x: 1, y: 2, color: 'hsl(1, 2%, 3%)' }, // color dropped, word kept
        { word: 'x'.repeat(41), x: 1, y: 2 }, // too long: dropped
        { word: 'cat', x: Number.NaN, y: 2 }, // not finite: dropped
      ],
      analogies: [{ a: 'man', b: 'king', c: 'woman', answer: 'queen', points: 12.6, similarity: 0.5 }],
    };
    const record = sessionToSync(old, device);
    expect(SyncRecord.safeParse(record).success).toBe(true);
    expect(record.deviceId).toBe(device);
    expect(record.clientUpdatedAt).toBe(old.savedAt);
    expect(record.payload.name).toBe('Saved board');
    expect(record.payload.words).toEqual([{ word: 'dog', x: 1, y: 2 }]);
    expect(record.payload.analogies[0].points).toBe(13);
  });
});
