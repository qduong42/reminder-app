import { computeNextDeadline, getUrgency } from '../deadline';

describe('computeNextDeadline', () => {
  it('adds interval hours to reference time', () => {
    const ref = new Date('2026-01-01T00:00:00Z');
    expect(computeNextDeadline(ref, 24)).toEqual(new Date('2026-01-02T00:00:00Z'));
  });

  it('handles fractional hours (30 min)', () => {
    const ref = new Date('2026-01-01T00:00:00Z');
    expect(computeNextDeadline(ref, 0.5)).toEqual(new Date('2026-01-01T00:30:00Z'));
  });

  it('handles large intervals (1 month = 720h)', () => {
    const ref = new Date('2026-01-01T00:00:00Z');
    const result = computeNextDeadline(ref, 720);
    expect(result.getTime()).toBe(new Date('2026-01-01T00:00:00Z').getTime() + 720 * 3600 * 1000);
  });
});

describe('getUrgency', () => {
  const now = new Date('2026-01-05T12:00:00Z');

  it('returns overdue when deadline is in the past', () => {
    const past = new Date('2026-01-05T11:59:59Z');
    expect(getUrgency(past, 24, now)).toBe('overdue');
  });

  it('returns overdue when deadline equals now', () => {
    expect(getUrgency(now, 24, now)).toBe('overdue');
  });

  it('returns due-soon when within 20% of interval (< 4.8h for 24h task)', () => {
    const soon = new Date('2026-01-05T15:00:00Z'); // 3h from now
    expect(getUrgency(soon, 24, now)).toBe('due-soon');
  });

  it('returns on-track when more than 20% of interval remains', () => {
    const safe = new Date('2026-01-06T00:00:00Z'); // 12h from now, 24h interval
    expect(getUrgency(safe, 24, now)).toBe('on-track');
  });

  it('uses current time as default for now parameter', () => {
    const farFuture = new Date(Date.now() + 99 * 24 * 3600 * 1000);
    expect(getUrgency(farFuture, 24)).toBe('on-track');
  });
});
