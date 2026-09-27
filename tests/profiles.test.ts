import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  activeAccount, applySwitch, dbNameFor, GUEST_DB_NAME, knownAccounts, pendingAdoption, planSwitch, touchAccount, type KeyValueStore, type KnownAccount,
} from '../src/account/profiles';
import { openLexicalDb } from '../src/persistence/db';
import { LexicalRepository } from '../src/persistence/LexicalRepository';

const memory = (): KeyValueStore => {
  const map = new Map<string, string>();
  return { getItem: k => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: k => void map.delete(k) };
};
const account = (uid: string, provider: KnownAccount['provider'] = 'dev'): KnownAccount => ({ uid, label: uid, provider, lastUsedAt: 1 });

describe('accounts on one device', () => {
  it('gives each account its own database and keeps the original one for the guest', () => {
    expect(dbNameFor(undefined)).toBe(GUEST_DB_NAME);
    expect(dbNameFor('dev:alice')).toBe('lexical-fountain@dev:alice');
  });

  it('reloads only when the signed-in user differs from the active database', () => {
    expect(planSwitch(undefined, undefined, [])).toEqual({ reload: false, adoptGuest: false });
    expect(planSwitch('dev:alice', { uid: 'dev:alice' }, [account('dev:alice')])).toEqual({ reload: false, adoptGuest: false });
    expect(planSwitch('dev:alice', { uid: 'dev:bob' }, [account('dev:alice')]).reload).toBe(true);
    expect(planSwitch('dev:alice', undefined, [account('dev:alice')])).toEqual({ reload: true, adoptGuest: false });
  });

  it("adopts the guest's progress only into the first account ever used on the device", () => {
    expect(planSwitch(undefined, { uid: 'dev:alice' }, [])).toEqual({ reload: true, adoptGuest: true });
    expect(planSwitch(undefined, { uid: 'dev:bob' }, [account('dev:alice')])).toEqual({ reload: true, adoptGuest: false });
    expect(planSwitch('dev:alice', { uid: 'dev:bob' }, [])).toEqual({ reload: true, adoptGuest: false }); // not from the guest
  });

  it('records accounts, the active one, and the adoption flag', () => {
    const storage = memory();
    const alice = account('dev:alice');
    applySwitch(alice, planSwitch(undefined, alice, knownAccounts(storage)), storage);
    expect(activeAccount(storage)).toBe('dev:alice');
    expect(pendingAdoption(storage)).toBe('dev:alice');
    applySwitch(account('dev:bob'), { reload: true, adoptGuest: false }, storage);
    touchAccount({ ...alice, lastUsedAt: 2 }, storage);
    expect(knownAccounts(storage).map(a => a.uid)).toEqual(['dev:alice', 'dev:bob']); // most recent first
    applySwitch(undefined, { reload: true, adoptGuest: false }, storage);
    expect(activeAccount(storage)).toBeUndefined();
  });
});

describe('guest adoption', () => {
  it("copies the guest's score, analogies, words, and games into the account; everything is pending to sync", async () => {
    const guest = await LexicalRepository.open(await openLexicalDb('adopt-guest'));
    await guest.addScore(70);
    await guest.recordAnalogy({ a: 'man', b: 'king', c: 'woman', answer: 'queen', similarity: 0.47, alternatives: [] }, 'v1');
    await guest.savePlayerWord('zyzzyva', Float32Array.from([1, 2]), 'm', 'q8');
    await guest.saveGame({ mode: 'timed', rulesVersion: 2, startedAt: 1, endedAt: 2, score: 300, analogies: 3, wordsDealt: 10, hintMode: true });

    const account = await LexicalRepository.open(await openLexicalDb('adopt-account'));
    await account.addScore(5);
    for (const record of await guest.allSyncRecords()) await account.adoptRecord(record);

    expect(account.score).toBe(75); // 70 from the guest device + 5 from this one: nothing lost, nothing doubled
    const data = await account.exportAll();
    expect(data.analogies.map(a => a.id)).toEqual(['man:king::woman']);
    expect(data.words.map(w => w.word)).toEqual(['zyzzyva']);
    expect(data.games.map(g => g.score)).toEqual([300]);
    expect((await account.pendingSyncRecords()).map(r => r.collection).sort()).toEqual(['analogies', 'games', 'profile', 'words']);
    expect(guest.score).toBe(70); // the guest keeps its own copy
  });
});
