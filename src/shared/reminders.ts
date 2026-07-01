/**
 * Pending "rate what you finished" reminders (storage.local).
 *
 * When MAL progress-sync marks a series COMPLETED and it has no score yet, the
 * service worker enqueues a reminder here; the side panel surfaces it on the home
 * dashboard with a quick 1–10 picker and dequeues it once the user rates (or
 * dismisses) it. Kept in storage.local — not synced settings — because it's small,
 * device-transient UI state, not a preference.
 */
const KEY = 'pendingRatings';
const MAX = 12;

export interface RatingReminder {
  /** MAL anime id to rate. */
  animeId: number;
  /** Display title. */
  title: string;
  /** Epoch ms when the series was finished. */
  at: number;
}

export async function getPendingRatings(): Promise<RatingReminder[]> {
  const r = await chrome.storage.local.get(KEY);
  const list = (r[KEY] as RatingReminder[] | undefined) ?? [];
  // Newest first, so the most recently finished show is prompted first.
  return [...list].sort((a, b) => b.at - a.at);
}

/** Enqueue a reminder, deduped by anime id (a re-finish refreshes the timestamp). */
export async function addPendingRating(reminder: RatingReminder): Promise<void> {
  const r = await chrome.storage.local.get(KEY);
  const list = (r[KEY] as RatingReminder[] | undefined) ?? [];
  const next = [
    reminder,
    ...list.filter((x) => x.animeId !== reminder.animeId),
  ].slice(0, MAX);
  await chrome.storage.local.set({ [KEY]: next });
}

/** Remove a reminder once it's been acted on (rated or dismissed). */
export async function removePendingRating(animeId: number): Promise<void> {
  const r = await chrome.storage.local.get(KEY);
  const list = (r[KEY] as RatingReminder[] | undefined) ?? [];
  await chrome.storage.local.set({ [KEY]: list.filter((x) => x.animeId !== animeId) });
}
