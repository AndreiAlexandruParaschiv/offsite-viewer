import { describe, expect, it } from 'vitest';
import {
  formatWeekLabel,
  parseWeekLabel,
  opportunityTouchedInWeeks,
  availableWeeks,
} from './weekFilter';
import type { SpacecatOpportunity } from '../types';

const opp = (updatedAt: string, overrides: Partial<SpacecatOpportunity> = {}): SpacecatOpportunity => ({
  id: 'x',
  siteId: 'y',
  type: 'cited-analysis',
  status: 'NEW',
  updatedAt,
  ...overrides,
});

describe('formatWeekLabel', () => {
  it('formats an ISO date as W<NN> YYYY', () => {
    expect(formatWeekLabel('2026-08-12T00:00:00.000Z')).toBe('W33 2026');
    expect(formatWeekLabel('2026-01-01T00:00:00.000Z')).toBe('W01 2026');
  });

  it('returns empty string for invalid input', () => {
    expect(formatWeekLabel('')).toBe('');
    expect(formatWeekLabel('not-a-date')).toBe('');
  });
});

describe('parseWeekLabel', () => {
  it('returns Monday 00:00 UTC start and Sunday 23:59:59.999 UTC end', () => {
    const { start, end } = parseWeekLabel('W33 2026');
    expect(start.toISOString()).toBe('2026-08-10T00:00:00.000Z'); // Mon Aug 10 2026
    expect(end.toISOString()).toBe('2026-08-16T23:59:59.999Z');   // Sun Aug 16 2026
  });

  it('throws on unrecognised format', () => {
    expect(() => parseWeekLabel('33 2026')).toThrow();
  });
});

describe('opportunityTouchedInWeeks', () => {
  it('returns true when updatedAt falls in the selected week', () => {
    expect(opportunityTouchedInWeeks(opp('2026-08-12T10:00:00.000Z'), ['W33 2026'])).toBe(true);
  });

  it('returns false when updatedAt is outside all selected weeks', () => {
    expect(opportunityTouchedInWeeks(opp('2026-08-01T10:00:00.000Z'), ['W33 2026'])).toBe(false);
  });

  it('returns true when weeks is empty (no filter)', () => {
    expect(opportunityTouchedInWeeks(opp('2026-01-01T00:00:00.000Z'), [])).toBe(true);
  });

  it('falls back to createdAt when updatedAt is absent', () => {
    const o: SpacecatOpportunity = {
      id: 'x', siteId: 'y', type: 't', status: 'NEW',
      createdAt: '2026-08-11T00:00:00.000Z',
    };
    expect(opportunityTouchedInWeeks(o, ['W33 2026'])).toBe(true);
  });
});

describe('availableWeeks', () => {
  it('returns n labels ending with the current week, most recent first', () => {
    const weeks = availableWeeks(4, new Date('2026-08-12T00:00:00.000Z'));
    expect(weeks).toHaveLength(4);
    expect(weeks[0]).toBe('W33 2026');
    expect(weeks[1]).toBe('W32 2026');
    expect(weeks[3]).toBe('W30 2026');
  });
});
