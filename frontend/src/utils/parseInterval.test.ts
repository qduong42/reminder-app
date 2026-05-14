import { parseInterval } from './parseInterval';

describe('parseInterval', () => {
  it('parses hours: 2h → 2', () => {
    expect(parseInterval('2h')).toEqual({ ok: true, hours: 2 });
  });

  it('parses days: 2d → 48', () => {
    expect(parseInterval('2d')).toEqual({ ok: true, hours: 48 });
  });

  it('parses months: 1m → 720', () => {
    expect(parseInterval('1m')).toEqual({ ok: true, hours: 720 });
  });

  it('parses bare number as hours: 24 → 24', () => {
    expect(parseInterval('24')).toEqual({ ok: true, hours: 24 });
  });

  it('parses fractional: 1.5h → 1.5', () => {
    expect(parseInterval('1.5h')).toEqual({ ok: true, hours: 1.5 });
  });

  it('parses fractional days: 0.5d → 12', () => {
    expect(parseInterval('0.5d')).toEqual({ ok: true, hours: 12 });
  });

  it('is case-insensitive: 2H, 2D, 1M', () => {
    expect(parseInterval('2H')).toEqual({ ok: true, hours: 2 });
    expect(parseInterval('2D')).toEqual({ ok: true, hours: 48 });
    expect(parseInterval('1M')).toEqual({ ok: true, hours: 720 });
  });

  it('rejects empty string', () => {
    expect(parseInterval('')).toMatchObject({ ok: false });
  });

  it('rejects zero: 0h', () => {
    expect(parseInterval('0h')).toMatchObject({ ok: false });
  });

  it('rejects negative: -1d', () => {
    expect(parseInterval('-1d')).toMatchObject({ ok: false });
  });

  it('rejects min suffix: 30min', () => {
    expect(parseInterval('30min')).toMatchObject({ ok: false });
  });

  it('rejects gibberish: abc', () => {
    expect(parseInterval('abc')).toMatchObject({ ok: false });
  });

  it('trims whitespace: " 2h "', () => {
    expect(parseInterval(' 2h ')).toEqual({ ok: true, hours: 2 });
  });
});
