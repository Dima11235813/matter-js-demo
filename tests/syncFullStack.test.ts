import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { openLexicalDb } from '../src/persistence/db';
import { LexicalRepository } from '../src/persistence/LexicalRepository';
import { ApiClient } from '../src/account/apiClient';
import { syncOnce, SyncConflictError, type SyncPort } from '../src/account/syncService';
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
  const api = new ApiClient(async () => token, '/api/v1', (url, init) => Promise.resolve(app.request(url, init)));
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
  return { repo, sync: (uid = `dev:${subject}`) => syncOnce(api, port, uid) };
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
