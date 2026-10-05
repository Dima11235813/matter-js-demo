import { describe, it, expect } from 'vitest';
import { CATEGORY_DIFFICULTY, difficultyOf, expectedScore, NEW_RATING, pickCategory, rateGuess, Rating, RATING_RULES } from '../src/game/rating';

const categories = Object.keys(CATEGORY_DIFFICULTY);
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0xffffffff; };
}

describe('skill rating (Feature 2.12)', () => {
  it('expects 50% at equal rating and difficulty, more for stronger players', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
    expect(expectedScore(1400, 1000)).toBeCloseTo(10 / 11, 3);
    expect(expectedScore(1000, 1400)).toBeCloseTo(1 / 11, 3);
  });

  it('moves up when right and down when wrong, by the same amount at equal odds (symmetric)', () => {
    const up = rateGuess({ value: 1000, plays: 20 }, 1000, true);
    const down = rateGuess({ value: 1000, plays: 20 }, 1000, false);
    expect(up.value - 1000).toBe(1000 - down.value);
    expect(up.plays).toBe(21);
  });

  it('rewards beating a hard relation more than an easy one', () => {
    const hard = rateGuess({ value: 1000, plays: 20 }, difficultyOf('city-in-state'), true).value;
    const easy = rateGuess({ value: 1000, plays: 20 }, difficultyOf('family'), true).value;
    expect(hard - 1000).toBeGreaterThan(easy - 1000);
  });

  it('stays within bounds', () => {
    let r: Rating = { value: RATING_RULES.max - 1, plays: 50 };
    for (let i = 0; i < 100; i++) r = rateGuess(r, 100, true);
    expect(r.value).toBeLessThanOrEqual(RATING_RULES.max);
    r = { value: RATING_RULES.min + 1, plays: 50 };
    for (let i = 0; i < 100; i++) r = rateGuess(r, 3000, false);
    expect(r.value).toBeGreaterThanOrEqual(RATING_RULES.min);
  });

  it("converges near a simulated player's true skill without oscillating", () => {
    for (const skill of [800, 1200, 1500]) {
      const random = lcg(skill);
      let r: Rating = NEW_RATING;
      const late: number[] = [];
      for (let i = 0; i < 400; i++) {
        const category = pickCategory(r.value, categories, random);
        const correct = random() < expectedScore(skill, difficultyOf(category));
        r = rateGuess(r, difficultyOf(category), correct);
        if (i >= 300) late.push(r.value);
      }
      const mean = late.reduce((a, b) => a + b, 0) / late.length;
      const sd = Math.sqrt(late.reduce((a, b) => a + (b - mean) ** 2, 0) / late.length);
      expect(Math.abs(mean - skill)).toBeLessThan(120);
      expect(sd).toBeLessThan(120);
    }
  });

  it('deals easy relations to a novice and hard ones to an expert', () => {
    const easy = new Set(['family', 'gram2-opposite', 'gram3-comparative', 'gram5-present-participle']);
    const hard = new Set(['city-in-state', 'capital-world', 'gram6-nationality-adjective']);
    const random = lcg(7);
    for (let i = 0; i < 50; i++) {
      expect(easy.has(pickCategory(800, categories, random))).toBe(true);
      expect(hard.has(pickCategory(1600, categories, random))).toBe(true);
    }
  });
});
