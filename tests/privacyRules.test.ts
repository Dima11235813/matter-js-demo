import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  AGE_RETRY_COOLDOWN_MS, ageBandFor, canAnswerAge, canHaveAccount, canShareResearch, newConsent, PROMPT_AFTER_PLAYS,
  PROMPT_SNOOZE_MS, RESEARCH_POLICY_VERSION, shouldPromptConsent,
} from '../src/game/privacyRules';
import { openLexicalDb } from '../src/persistence/db';
import { LexicalRepository } from '../src/persistence/LexicalRepository';

const now = new Date('2026-09-25T12:00:00Z');

describe('age question', () => {
  it('bands a birth year, counting the younger possibility when the birthday is unknown', () => {
    expect(ageBandFor(2014, now)).toEqual({ ok: true, band: 'under13' }); // 11 or 12
    expect(ageBandFor(2013, now)).toEqual({ ok: true, band: 'under13' }); // 12 or 13: count 12
    expect(ageBandFor(2012, now)).toEqual({ ok: true, band: '13to15' });
    expect(ageBandFor(2010, now)).toEqual({ ok: true, band: '13to15' }); // 15 or 16: count 15
    expect(ageBandFor(2009, now)).toEqual({ ok: true, band: '16plus' });
    expect(ageBandFor(1980, now)).toEqual({ ok: true, band: '16plus' });
  });

  it('rejects impossible years', () => {
    expect(ageBandFor(2027, now).ok).toBe(false);
    expect(ageBandFor(1800, now).ok).toBe(false);
    expect(ageBandFor(Number.NaN, now).ok).toBe(false);
  });

  it('allows research sharing from 16, accounts from 13, and nothing under 13', () => {
    expect([canShareResearch('under13'), canShareResearch('13to15'), canShareResearch('16plus'), canShareResearch(undefined)]).toEqual([false, false, true, false]);
    expect([canHaveAccount('under13'), canHaveAccount('13to15'), canHaveAccount('16plus')]).toEqual([false, true, true]);
  });

  it('does not let the age be re-answered right away', () => {
    const t = now.getTime();
    expect(canAnswerAge(undefined, t)).toBe(true);
    expect(canAnswerAge(t - 60_000, t)).toBe(false);
    expect(canAnswerAge(t - AGE_RETRY_COOLDOWN_MS, t)).toBe(true);
  });
});

describe('consent prompt', () => {
  const base = { consent: undefined, ageBand: undefined, dismissedAt: undefined, sessionPlays: 0, roundsFinished: 0, now: now.getTime() };

  it('appears after a few plays or a finished round, never before', () => {
    expect(shouldPromptConsent(base)).toBe(false);
    expect(shouldPromptConsent({ ...base, sessionPlays: PROMPT_AFTER_PLAYS - 1 })).toBe(false);
    expect(shouldPromptConsent({ ...base, sessionPlays: PROMPT_AFTER_PLAYS })).toBe(true);
    expect(shouldPromptConsent({ ...base, roundsFinished: 1 })).toBe(true);
  });

  it('stays away once answered, for players who cannot share, and for a while after "not now"', () => {
    const ready = { ...base, sessionPlays: 10 };
    expect(shouldPromptConsent({ ...ready, consent: newConsent(1, 'r') })).toBe(false);
    expect(shouldPromptConsent({ ...ready, ageBand: 'under13' })).toBe(false);
    expect(shouldPromptConsent({ ...ready, ageBand: '13to15' })).toBe(false);
    expect(shouldPromptConsent({ ...ready, dismissedAt: ready.now - 1000 })).toBe(false);
    expect(shouldPromptConsent({ ...ready, dismissedAt: ready.now - PROMPT_SNOOZE_MS })).toBe(true);
  });

  it('mints a fresh research id for each grant, separate from any device or account id', () => {
    const first = newConsent(1);
    const second = newConsent(2);
    expect(first.researchId).not.toBe(second.researchId);
    expect(first).toMatchObject({ policyVersion: RESEARCH_POLICY_VERSION, grantedAt: 1, scopes: ['plays'] });
  });
});

describe('local export and erase', () => {
  it('exports every store without the device secret, and erase leaves a fresh profile', async () => {
    const db = await openLexicalDb('export-erase');
    const repo = await LexicalRepository.open(db);
    await repo.addScore(40);
    await repo.savePlayerWord('zyzzyva', Float32Array.from([0.5, -0.25]), 'm', 'q8');
    await repo.updateMeta({ consent: newConsent(3, 'research-1') });
    const exported = await repo.exportAll();
    expect(exported.kind).toBe('lexical-fountain-my-data');
    expect(exported.profile.score).toBe(40);
    expect(exported.words[0].vector).toEqual([0.5, -0.25]);
    expect(exported.meta.consent?.researchId).toBe('research-1');
    const secret = (await db.get('meta', 'device'))!.deviceSecret;
    expect(JSON.stringify(exported)).not.toContain(secret);

    await repo.eraseAll();
    const fresh = await LexicalRepository.open(db);
    expect(fresh.score).toBe(0);
    expect(fresh.deviceId).not.toBe(repo.deviceId);
    expect(fresh.consent).toBeUndefined();
    expect(await fresh.countPlayEvents()).toBe(0);
  });
});
