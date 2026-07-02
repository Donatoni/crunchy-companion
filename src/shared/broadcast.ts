/**
 * Next-broadcast computation for currently-airing shows. MAL's `broadcast`
 * field gives a weekday + start time in JST (no DST, fixed UTC+9); we compute
 * the next occurrence as an absolute Date so the UI can render it in the
 * viewer's local time. Pure + exported for unit tests.
 */

const DAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const JST_OFFSET_MS = 9 * 3600_000;

/**
 * Next occurrence of `dayOfWeek` (MAL's lowercase English day) at `startTime`
 * ("HH:MM", JST), strictly after `now`. Returns null for an unknown day.
 * With no start time, assumes start-of-day JST (date is still meaningful).
 */
export function nextBroadcastDate(
  dayOfWeek: string,
  startTime: string | null,
  now: Date = new Date(),
): Date | null {
  const target = DAYS.indexOf(dayOfWeek.trim().toLowerCase());
  if (target === -1) return null;
  const [hh, mm] = (startTime ?? '00:00').split(':').map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;

  // Work in JST by shifting the clock and using UTC getters.
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  const daysAhead = (target - jstNow.getUTCDay() + 7) % 7;
  let utcMs =
    Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate() + daysAhead, hh, mm) -
    JST_OFFSET_MS;
  // Same weekday but the slot already passed → next week.
  if (utcMs <= now.getTime()) utcMs += 7 * 86_400_000;
  return new Date(utcMs);
}

/** "today" / "tomorrow" / short weekday, plus local time — for the air-date pill. */
export function formatAirDate(date: Date, now: Date = new Date()): string {
  const dayMs = 86_400_000;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(date) - startOfDay(now)) / dayMs);
  const day =
    diffDays === 0
      ? 'today'
      : diffDays === 1
        ? 'tomorrow'
        : date.toLocaleDateString(undefined, { weekday: 'long' });
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}
