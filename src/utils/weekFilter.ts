import type { SpacecatOpportunity } from '../types';

// Returns "W33 2026" format for UI labels (distinct from formatIsoWeek in
// dashboard.ts which returns "2026-W33" ISO 8601 format for CSV).
export const formatWeekLabel = (dateIso: string): string => {
  if (!dateIso) return '';
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return '';

  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);

  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);

  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `W${String(week).padStart(2, '0')} ${target.getUTCFullYear()}`;
};

// Parses "W33 2026" → { start: Mon 00:00 UTC, end: Sun 23:59:59.999 UTC }.
export const parseWeekLabel = (label: string): { start: Date; end: Date } => {
  const match = /^W(\d{1,2})\s+(\d{4})$/.exec(label);
  if (!match) throw new Error(`Unrecognised week label: "${label}"`);

  const week = parseInt(match[1], 10);
  const year = parseInt(match[2], 10);

  // ISO week 1 contains Jan 4. Find the Thursday of week 1, then go to Monday.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const thu1 = new Date(jan4);
  thu1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + 3);
  const mon1 = new Date(thu1);
  mon1.setUTCDate(thu1.getUTCDate() - 3);

  const start = new Date(mon1);
  start.setUTCDate(mon1.getUTCDate() + (week - 1) * 7);

  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);

  return { start, end };
};

// Returns true if the opportunity was created or updated within any of the
// given week labels. Returns true when weeks is empty (no filter active).
export const opportunityTouchedInWeeks = (
  opportunity: SpacecatOpportunity,
  weeks: string[],
): boolean => {
  if (weeks.length === 0) return true;

  const ts = opportunity.updatedAt ?? opportunity.createdAt;
  if (!ts) return false;

  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return false;

  return weeks.some((label) => {
    const { start, end } = parseWeekLabel(label);
    return date >= start && date <= end;
  });
};

// Returns `n` week labels ending at the week containing `anchor`, most recent
// first. Default anchor is today. Used to populate the week filter dropdown.
export const availableWeeks = (n = 12, anchor = new Date()): string[] => {
  const labels: string[] = [];
  const cursor = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()),
  );
  // Step back to Monday of current week.
  cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7));

  for (let i = 0; i < n; i++) {
    labels.push(formatWeekLabel(cursor.toISOString()));
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }

  return labels;
};

// Returns how many full ISO weeks ago `iso` was relative to `anchor` (today by
// default). Positive = in the past. Returns Infinity for unparseable inputs.
export const isoWeeksAgo = (iso: string, anchor = new Date()): number => {
  if (!iso) return Infinity;
  const targetLabel = formatWeekLabel(iso);
  if (!targetLabel) return Infinity;
  const anchorLabel = formatWeekLabel(anchor.toISOString());
  const anchorStart = parseWeekLabel(anchorLabel).start;
  const targetStart = parseWeekLabel(targetLabel).start;
  return Math.round((anchorStart.getTime() - targetStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
};

// Returns " (current week)" or " (last week)" for the given week label,
// relative to anchor (defaults to today). Empty string for all other weeks.
export const weekSuffix = (label: string, anchor = new Date()): string => {
  const current = formatWeekLabel(anchor.toISOString());
  if (label === current) return ' (current week)';
  const prev = new Date(anchor);
  prev.setUTCDate(prev.getUTCDate() - 7);
  if (label === formatWeekLabel(prev.toISOString())) return ' (last week)';
  return '';
};
