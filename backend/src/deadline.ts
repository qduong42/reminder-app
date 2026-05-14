export type UrgencyLevel = 'overdue' | 'due-soon' | 'on-track';

export function computeNextDeadline(referenceTime: Date, intervalHours: number): Date {
  return new Date(referenceTime.getTime() + intervalHours * 3600 * 1000);
}

export function getUrgency(nextDeadline: Date, intervalHours: number, now: Date = new Date()): UrgencyLevel {
  const msUntilDue = nextDeadline.getTime() - now.getTime();
  if (msUntilDue <= 0) return 'overdue';
  if (msUntilDue <= intervalHours * 3600 * 1000 * 0.2) return 'due-soon';
  return 'on-track';
}
