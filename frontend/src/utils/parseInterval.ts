export type ParseResult =
  | { ok: true; hours: number }
  | { ok: false; error: string };

export function parseInterval(input: string): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'Interval is required' };

  // Reject minute/second suffixes explicitly
  if (/min|sec|\ds$/i.test(trimmed)) {
    return { ok: false, error: 'Minimum interval unit is hours (e.g. 1h, 2d, 1m)' };
  }

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(h|d|m)?$/i);
  if (!match) return { ok: false, error: 'Use format: 2h, 3d, 1m, or a plain number (hours)' };

  const value = parseFloat(match[1]);
  const unit = (match[2] || 'h').toLowerCase();

  const multipliers: Record<string, number> = { h: 1, d: 24, m: 720 };
  const hours = value * multipliers[unit];

  if (hours <= 0 || !isFinite(hours)) {
    return { ok: false, error: 'Interval must be greater than zero' };
  }

  return { ok: true, hours };
}
