import { describe, it, expect } from 'vitest';
import { analogyPoints, applyPlay, defaultTimedRules, nextRewardAt, remainingMs, startGame, tick, TimedGameRules } from '../src/game/timedGame';
import { dealWords } from '../src/game/dealer';
import { buildIndex } from './helpers/indexFixtures';

const rules: TimedGameRules = { durationMs: 60_000, initialWords: 6, rewardEveryPoints: 100, wordsPerReward: 2, maxDealtWords: 10 };

describe('timed game rules', () => {
  it('starts running with the initial hand dealt', () => {
    const s = startGame(1000, rules);
    expect(s).toMatchObject({ phase: 'running', endsAt: 61_000, score: 0, dealt: 6 });
    expect(remainingMs(s, 31_000)).toBe(30_000);
  });

  it('ends when the timer runs out', () => {
    const s = tick(startGame(0, rules), 60_000);
    expect(s.phase).toBe('over');
    expect(remainingMs(s, 60_000)).toBe(0);
  });

  it('scores sandbox plays by similarity, minimum 10', () => {
    expect(analogyPoints(0.62)).toBe(62);
    expect(analogyPoints(0.02)).toBe(10);
  });

  it('deals reward words at each score milestone', () => {
    let s = startGame(0, rules);
    const first = applyPlay(s, 'a:b::c', 60, 1, rules);
    expect(first).toMatchObject({ points: 60, wordsToDeal: 0 });
    s = first.state;
    const second = applyPlay(s, 'a:b::d', 50, 2, rules);
    expect(second.wordsToDeal).toBe(2);
    expect(second.state).toMatchObject({ score: 110, dealt: 8, rewardsGranted: 1, analogies: 2 });
    expect(nextRewardAt(second.state, rules)).toBe(200);
  });

  it('never deals beyond the cap, however high the score', () => {
    let s = startGame(0, rules);
    for (let i = 0; i < 10; i++) s = applyPlay(s, `q${i}`, 90, i, rules).state;
    expect(s.dealt).toBe(rules.maxDealtWords);
    expect(nextRewardAt(s, rules)).toBeUndefined();
  });

  it('gives nothing for repeating a question within the round', () => {
    const s = applyPlay(startGame(0, rules), 'a:b::c', 60, 1, rules).state;
    const repeat = applyPlay(s, 'a:b::c', 60, 2, rules);
    expect(repeat).toMatchObject({ points: 0, duplicate: true });
    expect(repeat.state.score).toBe(60);
  });

  it('applies penalties but never takes the round score below zero', () => {
    const up = applyPlay(startGame(0, rules), 'a:b::c', 100, 1, rules);
    const down = applyPlay(up.state, 'a:b::d', -10, 2, rules);
    expect(down).toMatchObject({ points: -10, wordsToDeal: 0 });
    expect(down.state.score).toBe(90);
    expect(down.state.rewardsGranted).toBe(1); // rewards already granted stay granted
    const floor = applyPlay(startGame(0, rules), 'x:y::z', -10, 1, rules);
    expect(floor.points).toBe(0);
    expect(floor.state.score).toBe(0);
  });

  it('ignores plays that land after time is up', () => {
    const late = applyPlay(startGame(0, rules), 'a:b::c', 90, 60_001, rules);
    expect(late.points).toBe(0);
    expect(late.state.phase).toBe('over');
  });

  it('ships sensible defaults', () => {
    expect(defaultTimedRules.durationMs).toBeGreaterThanOrEqual(60_000);
    expect(defaultTimedRules.initialWords).toBeLessThan(defaultTimedRules.maxDealtWords);
  });
});

describe('dealWords', () => {
  const index = buildIndex({
    king: [1, 0, 0, 0], queen: [0.95, 0.3, 0, 0],
    ocean: [0, 0, 1, 0], sea: [0, 0.1, 0.97, 0],
    kings: [1, 0.02, 0, 0], stone: [0, 0, 0, 1],
  });
  const seq = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]; };

  it('deals seeds with their closest partners', () => {
    const dealt = dealWords(index, { count: 4, inPlay: [], allow: () => true, partnerThreshold: 0.5, seedMaxRank: 6, random: seq(0, 2 / 6) });
    expect(dealt).toEqual(['king', 'queen', 'ocean', 'sea']);
  });

  it('skips words already in play and their stem variants', () => {
    const dealt = dealWords(index, { count: 2, inPlay: ['king'], allow: () => true, partnerThreshold: 0.5, seedMaxRank: 6, random: seq(0, 4 / 6, 2 / 6) });
    expect(dealt).not.toContain('king');
    expect(dealt).not.toContain('kings');
  });

  it('leaves a seed unpaired when no neighbour clears the threshold', () => {
    const dealt = dealWords(index, { count: 2, inPlay: [], allow: () => true, partnerThreshold: 0.99, seedMaxRank: 6, random: seq(5 / 6, 2 / 6) });
    expect(dealt[0]).toBe('stone');
    expect(dealt).toHaveLength(2);
  });

  it('respects the allow policy', () => {
    const dealt = dealWords(index, { count: 6, inPlay: [], allow: w => w !== 'queen', partnerThreshold: 0.5, seedMaxRank: 6 });
    expect(dealt).not.toContain('queen');
  });
});
