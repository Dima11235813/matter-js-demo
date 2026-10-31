import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { openLexicalDb } from '../src/persistence/db';
import { LexicalRepository, analogyKey } from '../src/persistence/LexicalRepository';
import { AnalogyResult } from '../src/embeddings/analogy';

let dbCounter = 0;
const freshRepo = async () => LexicalRepository.open(await openLexicalDb(`test-db-${++dbCounter}`));

const result = (answer: string, similarity = 0.6): AnalogyResult => ({
  a: 'man', b: 'king', c: 'woman', answer, similarity,
  alternatives: [{ word: 'princess', similarity: 0.44 }],
});

describe('LexicalRepository', () => {
  let repo: LexicalRepository;
  beforeEach(async () => { repo = await freshRepo(); });

  it('creates a profile with a stable device id', async () => {
    expect(repo.deviceId).toMatch(/[0-9a-f-]{36}/);
    expect(repo.score).toBe(0);
  });

  it('persists score across repository instances', async () => {
    const db = await openLexicalDb('score-db');
    const first = await LexicalRepository.open(db);
    await first.addScore(40);
    await first.addScore(2);
    const second = await LexicalRepository.open(db);
    expect(second.score).toBe(42);
    expect(second.deviceId).toBe(first.deviceId);
  });

  it('round-trips player word vectors as Float32Array', async () => {
    const vector = Float32Array.from([0.1, 0.2, 0.3]);
    await repo.savePlayerWord('zyzzyva', vector, 'model', 'q8');
    const [record] = await repo.listPlayerWords();
    expect(record.word).toBe('zyzzyva');
    expect(record.vector).toBeInstanceOf(Float32Array);
    expect(Array.from(record.vector)).toEqual(Array.from(vector));
    expect(record.syncState).toBe('pending');
    expect(record.deviceId).toBe(repo.deviceId);
  });

  it('upserts analogies by question and counts repeat plays', async () => {
    const first = await repo.recordAnalogy(result('queen'), 'v1');
    const second = await repo.recordAnalogy(result('queen', 0.61), 'v2');
    expect(first.id).toBe(analogyKey('man', 'king', 'woman'));
    expect(second.timesPlayed).toBe(2);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.vocabVersion).toBe('v2');
    expect(await repo.countAnalogies()).toBe(1);
  });

  it('lists recent analogies newest first', async () => {
    await repo.recordAnalogy({ ...result('queen'), a: 'a1' }, 'v1');
    await new Promise(r => setTimeout(r, 5));
    await repo.recordAnalogy({ ...result('queen'), a: 'a2' }, 'v1');
    const recent = await repo.recentAnalogies(5);
    expect(recent.map(r => r.a)).toEqual(['a2', 'a1']);
  });

  it('reports pending rows for a future sync outbox', async () => {
    await repo.savePlayerWord('newword', Float32Array.from([1]), 'm', 'q8');
    await repo.recordAnalogy(result('queen'), 'v1');
    expect(await repo.pendingSyncCounts()).toEqual({ words: 1, analogies: 1, games: 0, playEvents: 0 });
  });
});

describe('LexicalRepository games and preferences', () => {
  const game = (score: number) => ({
    mode: 'timed' as const, rulesVersion: 1, startedAt: 0, endedAt: 120_000,
    score, analogies: 3, wordsDealt: 12, hintMode: true,
  });

  it('stores finished rounds and reports the best score', async () => {
    const repo = await freshRepo();
    expect(await repo.bestGameScore()).toBe(0);
    await repo.saveGame(game(180));
    await repo.saveGame(game(420));
    await repo.saveGame(game(90));
    expect(await repo.bestGameScore()).toBe(420);
    expect((await repo.pendingSyncCounts()).games).toBe(3);
  });

  it('defaults hint mode on and persists changes', async () => {
    const db = await openLexicalDb('prefs-db');
    const repo = await LexicalRepository.open(db);
    expect(repo.hintMode).toBe(true);
    await repo.setHintMode(false);
    expect((await LexicalRepository.open(db)).hintMode).toBe(false);
  });

  it('upgrades a v1 database without losing player data', async () => {
    const { openDB } = await import('idb');
    const v1 = await openDB('upgrade-db', 1, {
      upgrade(db) {
        db.createObjectStore('words', { keyPath: 'word' }).createIndex('bySyncState', 'syncState');
        const analogies = db.createObjectStore('analogies', { keyPath: 'id' });
        analogies.createIndex('bySyncState', 'syncState');
        analogies.createIndex('byUpdatedAt', 'updatedAt');
        db.createObjectStore('profile', { keyPath: 'id' });
      },
    });
    await v1.put('profile', { id: 'local', score: 77, createdAt: 1, updatedAt: 1, syncState: 'pending', deviceId: 'dev-1' });
    v1.close();

    const repo = await LexicalRepository.open(await openLexicalDb('upgrade-db'));
    expect(repo.score).toBe(77);
    expect(repo.deviceId).toBe('dev-1');
    await repo.saveGame(game(10));
    expect(await repo.bestGameScore()).toBe(10);
    await repo.logPlayEvent({ type: 'word', sessionId: 's', vocabVersion: 'v', context: { view: 'fountain', dimension: '2d', hintMode: true }, payload: {} });
    expect(await repo.countPlayEvents()).toBe(1);
  });
});

describe('LexicalRepository play log', () => {
  const context = { view: 'fountain', dimension: '3d' as const, hintMode: true };

  it('appends play events with client ids, schema, and sync stamps, in time order', async () => {
    const repo = await freshRepo();
    const second = await repo.logPlayEvent({ type: 'analogy', sessionId: 's1', vocabVersion: 'v1', context, payload: { a: 'man' }, at: 200 });
    const first = await repo.logPlayEvent({ type: 'word', sessionId: 's1', vocabVersion: 'v1', context, payload: { word: 'volcano' }, at: 100 });
    expect(first.id).not.toBe(second.id);
    expect(first).toMatchObject({ schema: 1, syncState: 'pending', deviceId: repo.deviceId });
    expect((await repo.listPlayEvents()).map(e => e.type)).toEqual(['word', 'analogy']);
    expect((await repo.listPlayEvents(150)).map(e => e.type)).toEqual(['analogy']);
    expect((await repo.pendingSyncCounts()).playEvents).toBe(2);
  });
});

describe('LexicalRepository Connect-All bests (Task 2.10.7)', () => {
  const context = { view: 'puzzle', dimension: '2d' as const, hintMode: true };
  const solve = (moves: number, solvedAt = 1000) => ({ words: ['sea', 'dog', 'king'], moves, par: 4, seed: 7, solvedAt });

  it('keeps one best per board, pending so it syncs, and only replaces it with fewer moves', async () => {
    const repo = await freshRepo();
    expect(await repo.puzzleBest(['dog', 'king', 'sea'])).toBeUndefined();
    expect(await repo.recordPuzzleSolve(solve(6))).toBe(true);
    expect(await repo.recordPuzzleSolve(solve(6, 2000))).toBe(false); // a tie is not a new best
    expect(await repo.recordPuzzleSolve(solve(8))).toBe(false);
    expect(await repo.puzzleBest(['king', 'sea', 'dog'])).toEqual({ moves: 6, par: 4 });
    expect(await repo.recordPuzzleSolve(solve(5, 3000))).toBe(true);
    expect(await repo.puzzleBest(['dog', 'king', 'sea'])).toEqual({ moves: 5, par: 4 });

    const pending = (await repo.pendingSyncRecords()).filter(r => r.collection === 'puzzles');
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ key: 'dog king sea', deviceId: repo.deviceId, payload: { words: ['dog', 'king', 'sea'], moves: 5, par: 4, seed: 7, solvedAt: 3000 } });
    expect((await repo.exportAll()).puzzles).toHaveLength(1);
    await repo.eraseAll();
    expect(await repo.puzzleBest(['dog', 'king', 'sea'])).toBeUndefined();
  });

  it('counts solves from an uploaded play log as bests', async () => {
    const repo = await freshRepo();
    await repo.importPlayEvents([{ id: 'e1', type: 'puzzle', schema: 1, at: 500, sessionId: 's', vocabVersion: 'v', context, payload: { seed: 7, par: 4, words: ['dog', 'sea'], moveCount: 4 } }]);
    expect(await repo.puzzleBest(['sea', 'dog'])).toEqual({ moves: 4, par: 4 });
  });

  it('upgrades a v6 database: each board\'s best in the play log becomes a pending best', async () => {
    const { openDB } = await import('idb');
    const v6 = await openDB('upgrade-v6', 6, {
      upgrade(db) {
        db.createObjectStore('words', { keyPath: 'word' }).createIndex('bySyncState', 'syncState');
        const analogies = db.createObjectStore('analogies', { keyPath: 'id' });
        analogies.createIndex('bySyncState', 'syncState');
        analogies.createIndex('byUpdatedAt', 'updatedAt');
        db.createObjectStore('profile', { keyPath: 'id' });
        const games = db.createObjectStore('games', { keyPath: 'id' });
        games.createIndex('bySyncState', 'syncState');
        games.createIndex('byScore', 'score');
        const events = db.createObjectStore('playEvents', { keyPath: 'id' });
        events.createIndex('bySyncState', 'syncState');
        events.createIndex('byAt', 'at');
        db.createObjectStore('meta', { keyPath: 'id' });
        const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
        sessions.createIndex('bySavedAt', 'savedAt');
        sessions.createIndex('bySyncState', 'syncState');
      },
    });
    await v6.put('profile', { id: 'local', score: 0, scoreByDevice: {}, createdAt: 1, updatedAt: 1, syncState: 'synced', deviceId: '66666666-6666-4666-8666-000000000006' });
    const stamp = { createdAt: 1, updatedAt: 1, syncState: 'pending', deviceId: '66666666-6666-4666-8666-000000000006', schema: 1, sessionId: 's', vocabVersion: 'v', context };
    await v6.put('playEvents', { ...stamp, id: 'p1', type: 'puzzle', at: 100, payload: { seed: 7, par: 4, words: ['sea', 'dog'], moveCount: 7 } });
    await v6.put('playEvents', { ...stamp, id: 'p2', type: 'puzzle', at: 200, payload: { seed: 7, par: 4, words: ['dog', 'sea'], moveCount: 5 } });
    await v6.put('playEvents', { ...stamp, id: 'p3', type: 'word', at: 300, payload: { word: 'owl' } });
    v6.close();

    const repo = await LexicalRepository.open(await openLexicalDb('upgrade-v6'));
    expect(await repo.puzzleBest(['dog', 'sea'])).toEqual({ moves: 5, par: 4 });
    const pending = (await repo.pendingSyncRecords()).filter(r => r.collection === 'puzzles');
    expect(pending).toEqual([expect.objectContaining({ key: 'dog sea', clientUpdatedAt: 200, deviceId: '66666666-6666-4666-8666-000000000006' })]);
  });
});
