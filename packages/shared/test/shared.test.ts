import { describe, it, expect } from 'vitest';
import {
  analogyKey, counterTotal, decodeVector, encodeVector, mergeRecords, PushRequest, sameRecord, SyncRecord, wordKey,
} from '../src';

const DEVICE_A = '11111111-1111-4111-8111-111111111111';
const DEVICE_B = '22222222-2222-4222-8222-222222222222';

const profile = (deviceId: string, at: number, scoreByDevice: Record<string, number>, hintMode = true): SyncRecord => ({
  collection: 'profile', key: 'profile', schemaVersion: 1, clientUpdatedAt: at, deviceId, payload: { hintMode, scoreByDevice },
});
const analogy = (deviceId: string, at: number, plays: Record<string, number>, answer = 'queen'): SyncRecord => ({
  collection: 'analogies', key: analogyKey('man', 'king', 'woman'), schemaVersion: 1, clientUpdatedAt: at, deviceId,
  payload: { a: 'man', b: 'king', c: 'woman', answer, similarity: 0.47, alternatives: [], vocabVersion: 'v1', playsByDevice: plays, createdAt: at },
});

describe('shared contracts', () => {
  it('validates records and rejects malformed ones', () => {
    expect(SyncRecord.safeParse(profile(DEVICE_A, 1, { [DEVICE_A]: 10 })).success).toBe(true);
    expect(SyncRecord.safeParse({ ...profile(DEVICE_A, 1, {}), collection: 'meta' }).success).toBe(false); // never synced
    expect(SyncRecord.safeParse({ ...profile(DEVICE_A, 1, {}), deviceId: 'not-a-uuid' }).success).toBe(false);
    expect(SyncRecord.safeParse(profile(DEVICE_A, 1, { [DEVICE_A]: -5 })).success).toBe(false); // counters never negative
    expect(PushRequest.safeParse({ deviceId: DEVICE_A, records: Array(201).fill(profile(DEVICE_A, 1, {})) }).success).toBe(false);
  });

  it('builds canonical keys', () => {
    expect(analogyKey(' Man', 'KING', 'woman')).toBe('man:king::woman');
    expect(wordKey('Zyzzyva', 'Xenova/all-MiniLM-L6-v2', 'q8')).toBe('zyzzyva|Xenova/all-MiniLM-L6-v2|q8');
  });

  it('round-trips float32 vectors through base64', () => {
    const v = Float32Array.from([0.5, -0.25, 1e-7, 3.4028234663852886e38]);
    expect(Array.from(decodeVector(encodeVector(v)))).toEqual(Array.from(v));
    expect(encodeVector(new Float32Array(384)).length).toBe(2048); // 1,536 bytes of base64
  });
});

describe('merge rules', () => {
  const records = [
    profile(DEVICE_A, 100, { [DEVICE_A]: 50, [DEVICE_B]: 10 }, true),
    profile(DEVICE_B, 200, { [DEVICE_A]: 40, [DEVICE_B]: 30 }, false),
    profile(DEVICE_A, 200, { [DEVICE_A]: 70 }, true),
  ];

  it('is commutative and idempotent for every pair', () => {
    for (const a of records) for (const b of records) {
      expect(sameRecord(mergeRecords(a, b), mergeRecords(b, a))).toBe(true);
      expect(sameRecord(mergeRecords(a, a), a)).toBe(true);
    }
  });

  it('is associative, so the order devices sync in never matters', () => {
    const [a, b, c] = records;
    expect(sameRecord(mergeRecords(mergeRecords(a, b), c), mergeRecords(a, mergeRecords(b, c)))).toBe(true);
  });

  it('adds up offline points from two devices and keeps the latest settings', () => {
    const merged = mergeRecords(records[0], records[1]);
    if (merged.collection !== 'profile') throw new Error('unexpected');
    expect(merged.payload.scoreByDevice).toEqual({ [DEVICE_A]: 50, [DEVICE_B]: 30 });
    expect(counterTotal(merged.payload.scoreByDevice)).toBe(80);
    expect(merged.payload.hintMode).toBe(false); // device B changed it later
    expect(merged.clientUpdatedAt).toBe(200);
  });

  it('adds analogy plays per device and keeps the newest answer', () => {
    const merged = mergeRecords(analogy(DEVICE_A, 100, { [DEVICE_A]: 3 }, 'queen'), analogy(DEVICE_B, 300, { [DEVICE_B]: 2 }, 'monarch'));
    if (merged.collection !== 'analogies') throw new Error('unexpected');
    expect(counterTotal(merged.payload.playsByDevice)).toBe(5);
    expect(merged.payload.answer).toBe('monarch');
    expect(merged.payload.createdAt).toBe(100);
  });

  it('refuses to merge different records', () => {
    expect(() => mergeRecords(profile(DEVICE_A, 1, {}), analogy(DEVICE_A, 1, {}))).toThrow();
  });
});

describe('merge rules: the Guess rating and saved sessions (Tasks 2.12.3, 2.15.4)', () => {
  const SESSION = '33333333-3333-4333-8333-333333333333';
  const rated = (deviceId: string, at: number, rating?: { value: number; plays: number; at: number }, hintMode = true): SyncRecord => ({
    collection: 'profile', key: 'profile', schemaVersion: 1, clientUpdatedAt: at, deviceId, payload: { hintMode, scoreByDevice: {}, ...(rating ? { rating } : {}) },
  });
  const session = (deviceId: string, at: number, name: string, deleted = false): SyncRecord => ({
    collection: 'sessions', key: SESSION, schemaVersion: 1, clientUpdatedAt: at, deviceId,
    payload: { name, savedAt: 1, schema: 1, view: 'fountain', words: deleted ? [] : [{ word: 'dog', x: 1, y: 2, color: '#aabbcc' }], analogies: [], ...(deleted ? { deleted: true } : {}) },
  });
  const records = [
    rated(DEVICE_A, 100, { value: 1100, plays: 12, at: 90 }),
    rated(DEVICE_B, 200, { value: 950, plays: 30, at: 50 }, false),
    rated(DEVICE_A, 150),
    // Same rating time as the first (a tie: more plays wins). Distinct device/time from the others: one device
    // never writes two different profiles in the same millisecond, the case LWW can't order.
    rated(DEVICE_A, 250, { value: 1000, plays: 31, at: 90 }),
  ];
  const sessions = [session(DEVICE_A, 100, 'pets'), session(DEVICE_B, 200, 'pets, renamed'), session(DEVICE_A, 300, 'pets', true), session(DEVICE_B, 300, 'tie')];

  it('stays commutative, idempotent, and associative with ratings and sessions', () => {
    for (const set of [records, sessions]) {
      for (const a of set) for (const b of set) {
        expect(sameRecord(mergeRecords(a, b), mergeRecords(b, a))).toBe(true);
        expect(sameRecord(mergeRecords(a, a), a)).toBe(true);
      }
      for (const a of set) for (const b of set) for (const c of set) {
        expect(sameRecord(mergeRecords(mergeRecords(a, b), c), mergeRecords(a, mergeRecords(b, c)))).toBe(true);
      }
    }
  });

  it('keeps the newest rating, even when the other device changed its settings later', () => {
    const merged = mergeRecords(records[0], records[1]);
    if (merged.collection !== 'profile') throw new Error('unexpected');
    expect(merged.payload.hintMode).toBe(false); // B's settings are newer
    expect(merged.payload.rating).toEqual({ value: 1100, plays: 12, at: 90 }); // A's rating is newer
    // A device that never rated doesn't erase the rating.
    const kept = mergeRecords(records[0], records[2]);
    if (kept.collection !== 'profile') throw new Error('unexpected');
    expect(kept.payload.rating?.value).toBe(1100);
  });

  it('keeps the newest copy of a session, and a newer delete wins over an older edit', () => {
    const renamed = mergeRecords(sessions[0], sessions[1]);
    if (renamed.collection !== 'sessions') throw new Error('unexpected');
    expect(renamed.payload.name).toBe('pets, renamed');
    const gone = mergeRecords(sessions[1], sessions[2]);
    if (gone.collection !== 'sessions') throw new Error('unexpected');
    expect(gone.payload.deleted).toBe(true);
  });

  it('validates sessions against the contract limits', () => {
    expect(SyncRecord.safeParse(session(DEVICE_A, 1, 'ok')).success).toBe(true);
    const words = Array.from({ length: 401 }, () => ({ word: 'dog', x: 1, y: 2 }));
    const tooBig = { ...session(DEVICE_A, 1, 'big'), payload: { ...(session(DEVICE_A, 1, 'big') as { payload: object }).payload, words } };
    expect(SyncRecord.safeParse(tooBig).success).toBe(false);
    const badColor = { ...session(DEVICE_A, 1, 'x'), payload: { ...(session(DEVICE_A, 1, 'x') as { payload: object }).payload, words: [{ word: 'dog', x: 1, y: 2, color: 'red' }] } };
    expect(SyncRecord.safeParse(badColor).success).toBe(false);
  });
});
