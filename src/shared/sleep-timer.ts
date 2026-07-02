/**
 * Sleep timer: "N more auto-advances, then stop auto-play". Device-local and
 * session-transient (storage.local), set from the side panel and consumed by
 * the content script's auto-next gate. `remaining` counts auto-advances still
 * allowed; 0 means "stop after the episode now playing".
 */
const KEY = 'sleep_timer';

export interface SleepTimer {
  /** Auto-advances still allowed. */
  remaining: number;
  /** Epoch ms when the timer was set (panel shows nothing for stale timers). */
  setAt: number;
}

/** Timers older than this are ignored — yesterday's "2 more eps" shouldn't bind today. */
const STALE_MS = 12 * 3600_000;

export async function getSleepTimer(): Promise<SleepTimer | null> {
  const r = await chrome.storage.local.get(KEY);
  const t = (r[KEY] as SleepTimer | undefined) ?? null;
  if (!t) return null;
  if (Date.now() - t.setAt > STALE_MS) {
    await clearSleepTimer();
    return null;
  }
  return t;
}

export async function setSleepTimer(remaining: number): Promise<void> {
  await chrome.storage.local.set({ [KEY]: { remaining, setAt: Date.now() } satisfies SleepTimer });
}

export async function clearSleepTimer(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}

/** Consume one auto-advance. Returns the new remaining count (or null if unset). */
export async function decrementSleepTimer(): Promise<number | null> {
  const t = await getSleepTimer();
  if (!t) return null;
  const remaining = Math.max(0, t.remaining - 1);
  await chrome.storage.local.set({ [KEY]: { ...t, remaining } satisfies SleepTimer });
  return remaining;
}

/** Live subscription (content script gate + panel display). Returns unsubscribe. */
export function onSleepTimerChanged(cb: (t: SleepTimer | null) => void): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: string,
  ) => {
    if (area !== 'local' || !(KEY in changes)) return;
    cb((changes[KEY].newValue as SleepTimer | undefined) ?? null);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
