import { describe, expect, it } from 'vitest';
import { formatAirDate, nextBroadcastDate } from '@/shared/broadcast';

// Fixed reference: 2026-07-01T12:00:00Z is a Wednesday (21:00 JST).
const NOW = new Date('2026-07-01T12:00:00Z');

describe('nextBroadcastDate', () => {
  it('finds the next weekly slot in JST and returns an absolute time', () => {
    // Sunday 23:15 JST → Sunday 14:15 UTC.
    const d = nextBroadcastDate('sunday', '23:15', NOW)!;
    expect(d.toISOString()).toBe('2026-07-05T14:15:00.000Z');
  });

  it('rolls to next week when the slot today has already passed', () => {
    // It's Wednesday 21:00 JST; a Wednesday 20:00 JST slot is gone.
    const d = nextBroadcastDate('wednesday', '20:00', NOW)!;
    expect(d.toISOString()).toBe('2026-07-08T11:00:00.000Z');
  });

  it('uses the slot later today when it has not passed yet', () => {
    // Wednesday 23:30 JST is still ahead of 21:00 JST.
    const d = nextBroadcastDate('wednesday', '23:30', NOW)!;
    expect(d.toISOString()).toBe('2026-07-01T14:30:00.000Z');
  });

  it('assumes start-of-day when no time is given', () => {
    const d = nextBroadcastDate('thursday', null, NOW)!;
    // Thursday 00:00 JST = Wednesday 15:00 UTC.
    expect(d.toISOString()).toBe('2026-07-01T15:00:00.000Z');
  });

  it('returns null for unknown days or malformed times', () => {
    expect(nextBroadcastDate('other', '20:00', NOW)).toBeNull();
    expect(nextBroadcastDate('friday', 'nope', NOW)).toBeNull();
  });
});

describe('formatAirDate', () => {
  it('labels same-day as today and next-day as tomorrow', () => {
    const now = new Date(2026, 6, 1, 12, 0);
    expect(formatAirDate(new Date(2026, 6, 1, 23, 30), now)).toMatch(/^today · /);
    expect(formatAirDate(new Date(2026, 6, 2, 23, 30), now)).toMatch(/^tomorrow · /);
  });
  it('uses the weekday name further out', () => {
    const now = new Date(2026, 6, 1, 12, 0);
    expect(formatAirDate(new Date(2026, 6, 5, 23, 30), now)).toMatch(/^Sunday · /);
  });
});
