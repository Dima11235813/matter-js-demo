import { describe, it, expect } from 'vitest';
import { Calibration, magnetismMagnitude, similarityPercentile } from '../src/embeddings/calibration';
import { createProfanityPolicy, isProfanityFilterEnabled } from '../src/embeddings/profanity';

// Values measured for all-MiniLM-L6-v2 over the 20k centered vocabulary.
const cal: Calibration = {
  p1: -0.15, p5: -0.11, p10: -0.09, p25: -0.05, p50: -0.01,
  p75: 0.04, p90: 0.1, p95: 0.14, p99: 0.23,
};

describe('similarityPercentile', () => {
  it('returns the measured percentile at calibration points', () => {
    expect(similarityPercentile(cal.p50, cal)).toBeCloseTo(50, 5);
    expect(similarityPercentile(cal.p95, cal)).toBeCloseTo(95, 5);
  });

  it('interpolates between points and clamps the extremes', () => {
    const mid = similarityPercentile((cal.p90 + cal.p95) / 2, cal);
    expect(mid).toBeGreaterThan(90);
    expect(mid).toBeLessThan(95);
    expect(similarityPercentile(1, cal)).toBe(100);
    expect(similarityPercentile(-1, cal)).toBe(0);
  });
});

describe('magnetismMagnitude', () => {
  it('attracts only the top 10% of related pairs', () => {
    expect(magnetismMagnitude(0.5, 200, cal)).toBeGreaterThan(0);
    expect(magnetismMagnitude(cal.p75, 200, cal)).toBe(0);
  });

  it('attracts more strongly as similarity grows', () => {
    expect(magnetismMagnitude(0.6, 200, cal)).toBeGreaterThan(magnetismMagnitude(0.2, 200, cal));
  });

  it('repels the least related pairs, fading with distance', () => {
    const near = magnetismMagnitude(-0.3, 50, cal);
    const far = magnetismMagnitude(-0.3, 500, cal);
    expect(near).toBeLessThan(0);
    expect(Math.abs(near)).toBeGreaterThan(Math.abs(far));
  });

  it('leaves the neutral middle band untouched', () => {
    expect(magnetismMagnitude(cal.p50, 100, cal)).toBe(0);
  });
});

describe('profanity policy', () => {
  it('blocks listed and build-flagged words when enabled', () => {
    const policy = createProfanityPolicy(true, ['flaggedword']);
    expect(policy.isAllowed('fuck')).toBe(false);
    expect(policy.isAllowed('FlaggedWord')).toBe(false);
    expect(policy.isAllowed('kitten')).toBe(true);
  });

  it('includes the supplementary list (terms the base list misses)', () => {
    const policy = createProfanityPolicy(true);
    expect(policy.isAllowed('dick')).toBe(false);
    expect(policy.isAllowed('rapist')).toBe(false);
    expect(policy.isAllowed('screw')).toBe(true); // ambiguous everyday words are left alone
  });

  it('allows everything when disabled', () => {
    expect(createProfanityPolicy(false).isAllowed('fuck')).toBe(true);
  });

  it('always filters in production; dev shows everything unless opted in', () => {
    expect(isProfanityFilterEnabled({ DEV: false })).toBe(true);
    expect(isProfanityFilterEnabled({ DEV: false, VITE_PROFANITY_FILTER: 'off' })).toBe(true);
    expect(isProfanityFilterEnabled({ DEV: true })).toBe(false);
    expect(isProfanityFilterEnabled({ DEV: true, VITE_PROFANITY_FILTER: 'on' })).toBe(true);
  });
});
