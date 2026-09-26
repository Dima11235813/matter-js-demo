import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { counterTotal, DeviceCounter, incrementCounter, mergeCounters } from '../src/persistence/counters';
import { analogyKey, normalizeKey } from '../src/persistence/keys';
import { openLexicalDb } from '../src/persistence/db';
import { LexicalRepository } from '../src/persistence/LexicalRepository';

describe('per-device counters', () => {
  it('sums every device, and each device only touches its own entry', () => {
    let counter: DeviceCounter = {};
    counter = incrementCounter(counter, 'laptop', 40);
    counter = incrementCounter(counter, 'phone', 25);
    counter = incrementCounter(counter, 'laptop', 10);
    expect(counter).toEqual({ laptop: 50, phone: 25 });
    expect(counterTotal(counter)).toBe(75);
    expect(counterTotal(undefined)).toBe(0);
  });

  it('rejects decrements, which would break the merge', () => {
    expect(() => incrementCounter({}, 'laptop', -10)).toThrow(RangeError);
  });

  it('two devices playing offline, then syncing in either order, lose and double nothing', () => {
    // Both start from the same synced state, then play offline.
    const synced = { laptop: 100, phone: 30 };
    const laptop = incrementCounter(synced, 'laptop', 20); // laptop plays 20 more offline
    const phone = incrementCounter(synced, 'phone', 50);   // phone plays 50 more offline
    const ab = mergeCounters(laptop, phone);
    const ba = mergeCounters(phone, laptop);
    expect(ab).toEqual(ba);                                  // commutative
    expect(counterTotal(ab)).toBe(100 + 30 + 20 + 50);       // nothing lost, nothing doubled
    expect(mergeCounters(ab, ab)).toEqual(ab);               // idempotent: re-syncing changes nothing
    expect(mergeCounters(mergeCounters(ab, laptop), phone)).toEqual(ab); // associative with stale replicas
  });

  it('shows why a plain number fails: last-writer-wins loses the other device plays', () => {
    const lastWriterWins = Math.max(100 + 30 + 20, 100 + 30 + 50); // either device's total, not both
    expect(lastWriterWins).toBeLessThan(200);
  });
});

describe('key normalization', () => {
  it('trims, lowercases, and composes Unicode (NFC)', () => {
    expect(normalizeKey('  King ')).toBe('king');
    expect(normalizeKey('Café')).toBe('café'); // decomposed accent → composed
    expect(normalizeKey('café')).toBe(normalizeKey('Café'));
  });

  it('builds analogy keys from normalized words', () => {
    expect(analogyKey('Man', ' king', 'WOMAN')).toBe('man:king::woman');
  });
});

describe('IndexedDB v4: per-device counters, normalized keys, device meta', () => {
  it('migrates a v3 database: score and play counts are credited to the device that earned them', async () => {
    const { openDB } = await import('idb');
    const v3 = await openDB('counters-upgrade', 3, {
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
      },
    });
    const stamp = { createdAt: 1, updatedAt: 1, syncState: 'pending', deviceId: 'old-device' };
    await v3.put('profile', { id: 'local', score: 321, ...stamp });
    const analogy = { a: 'man', b: 'king', answer: 'queen', similarity: 0.47, alternatives: [], vocabVersion: 'v1', ...stamp };
    await v3.put('analogies', { id: 'man:king::woman', c: 'woman', timesPlayed: 4, ...analogy });
    // A key stored before NFC normalization: re-keyed, and its plays merged into the composed key.
    await v3.put('analogies', { id: 'café:tea::man', a: 'café', b: 'tea', c: 'man', timesPlayed: 2, answer: 'x', similarity: 0.1, alternatives: [], vocabVersion: 'v1', ...stamp });
    await v3.put('analogies', { id: 'café:tea::man', a: 'café', b: 'tea', c: 'man', timesPlayed: 3, answer: 'x', similarity: 0.1, alternatives: [], vocabVersion: 'v1', ...stamp });
    v3.close();

    const db = await openLexicalDb('counters-upgrade');
    const repo = await LexicalRepository.open(db);
    expect(repo.score).toBe(321);
    expect((await db.get('profile', 'local'))!.scoreByDevice).toEqual({ 'old-device': 321 });
    expect((await db.get('analogies', 'man:king::woman'))!.playsByDevice).toEqual({ 'old-device': 4 });
    expect(await db.get('analogies', 'café:tea::man')).toBeUndefined();
    expect(await db.get('analogies', 'café:tea::man')).toMatchObject({ timesPlayed: 5, playsByDevice: { 'old-device': 5 } });
  });

  it('adds points and plays to this device only', async () => {
    const repo = await LexicalRepository.open(await openLexicalDb('counters-fresh'));
    await repo.addScore(60);
    await repo.addScore(25);
    expect(repo.score).toBe(85);
    const result = { a: 'man', b: 'king', c: 'woman', answer: 'queen', similarity: 0.47, alternatives: [] };
    await repo.recordAnalogy(result, 'v1');
    const record = await repo.recordAnalogy(result, 'v1');
    expect(record.playsByDevice).toEqual({ [repo.deviceId]: 2 });
    expect(record.timesPlayed).toBe(2);
  });

  it('creates a device secret once and keeps consent and age band on the device', async () => {
    const db = await openLexicalDb('meta-db');
    const repo = await LexicalRepository.open(db);
    const meta = await db.get('meta', 'device');
    expect(meta!.deviceSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(repo.consent).toBeUndefined();
    await repo.updateMeta({ ageBand: { band: '16plus', at: 1 }, consent: { policyVersion: 'p1', grantedAt: 2, scopes: ['plays'], researchId: 'r1' } });
    const again = await LexicalRepository.open(db);
    expect(again.ageBand).toBe('16plus');
    expect(again.consent).toMatchObject({ policyVersion: 'p1', researchId: 'r1' });
    expect((await db.get('meta', 'device'))!.deviceSecret).toBe(meta!.deviceSecret);
  });
});
