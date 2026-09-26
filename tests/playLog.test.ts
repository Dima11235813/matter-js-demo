import { describe, it, expect } from 'vitest';
import { analogyPayload, expressionPayload, playLogExport, summarizePlayLog } from '../src/game/playLog';
import { PlayEventRecord } from '../src/persistence/db';

const event = (type: PlayEventRecord['type'], payload: Record<string, unknown>, at: number, sessionId = 's1'): PlayEventRecord => ({
  id: `e${at}`, type, schema: 1, at, sessionId, vocabVersion: 'v1',
  context: { view: 'game', dimension: '2d', hintMode: true, rulesVersion: 2, relation: 'capital-world' },
  payload, createdAt: at, updatedAt: at, syncState: 'pending', deviceId: 'device-secret',
});

describe('play log payloads', () => {
  it('records the top 3 answers and rounded stats, never more', () => {
    const payload = analogyPayload({
      a: 'man', b: 'king', c: 'woman', answer: 'queen', input: 'typed', points: 47, hint: 'carried',
      ranked: [{ word: 'queen', similarity: 0.47123 }, { word: 'monarch', similarity: 0.45 }, { word: 'royalty', similarity: 0.37 }, { word: 'female', similarity: 0.36 }],
      stats: { ab: 0.09812, dc: 0.2244, da: 0.018, db: 0.535, offset: 0.39677 },
    });
    expect(payload.top).toEqual([{ word: 'queen', similarity: 0.471 }, { word: 'monarch', similarity: 0.45 }, { word: 'royalty', similarity: 0.37 }]);
    expect(payload.stats).toEqual({ ab: 0.098, dc: 0.224, da: 0.018, db: 0.535, offset: 0.397 });
    expect(payload).toMatchObject({ a: 'man', b: 'king', c: 'woman', answer: 'queen', input: 'typed', hint: 'carried', points: 47 });
    expect(payload).not.toHaveProperty('ranked');
  });

  it('records expressions as signed terms and the top answers', () => {
    expect(expressionPayload([{ word: 'ocean', sign: 1 }, { word: 'desert', sign: 1 }], [{ word: 'beach', similarity: 0.6712 }]))
      .toEqual({ terms: [{ word: 'ocean', sign: 1 }, { word: 'desert', sign: 1 }], answer: 'beach', top: [{ word: 'beach', similarity: 0.671 }] });
  });
});

describe('play log summary and export', () => {
  const events = [
    event('analogy', { hint: 'carried', verdict: 'full', designed: true }, 100),
    event('analogy', { hint: 'unclear', verdict: 'none', designed: true }, 200),
    event('analogy', { hint: 'collapsed', verdict: 'penalty', designed: false }, 300, 's2'),
    event('word', { word: 'volcano' }, 400, 's2'),
  ];

  it('counts events, hints, verdicts, designed plays, and sessions', () => {
    expect(summarizePlayLog(events)).toEqual({
      events: 4,
      byType: { analogy: 3, word: 1 },
      analogies: { played: 3, hints: { carried: 1, unclear: 1, collapsed: 1 }, verdicts: { full: 1, none: 1, penalty: 1 }, designedPlays: 2, designedCompleted: 1 },
      sessions: 2,
      firstAt: 100,
      lastAt: 400,
    });
  });

  it('exports without the device id or sync bookkeeping', () => {
    const exported = playLogExport(events, new Date('2026-09-25T12:00:00Z'));
    expect(exported.kind).toBe('lexical-fountain-play-log');
    expect(exported.exportedAt).toBe('2026-09-25T12:00:00.000Z');
    expect(exported.events).toHaveLength(4);
    expect(JSON.stringify(exported)).not.toContain('device-secret');
    expect(exported.events[0]).not.toHaveProperty('syncState');
    expect(exported.events[0]).toMatchObject({ id: 'e100', type: 'analogy', sessionId: 's1', vocabVersion: 'v1' });
  });
});
