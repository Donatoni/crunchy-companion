import { DEFAULT_SETTINGS, getSettings, saveSettings } from '@/shared/settings';
import type {
  FetchSkipEventsResponse,
  RuntimeMessage,
  TrackerToastMessage,
} from '@/shared/messages';
import { parseSkipEvents, skipEventsUrl } from '@/shared/skip-events';
import type { SkipSegment, TrackerMeta } from '@/shared/types';
import {
  getMapping,
  getTokenData,
  seriesKey,
  setMapping,
  setTokenData,
  type TrackerMapping,
} from '@/shared/tracker-store';
import {
  getAnimeStatus,
  refresh,
  searchAnime,
  setMyListStatus,
} from '@/shared/mal';

/** Seed defaults on install so the popup/options never render an empty state. */
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get('settings');
  if (!current.settings) await saveSettings(DEFAULT_SETTINGS);
});

// ---- skip-events fetch (avoids content-script CORS) -------------------------

const skipCache = new Map<string, SkipSegment[]>();

async function fetchSkipEvents(episodeId: string): Promise<FetchSkipEventsResponse> {
  if (skipCache.has(episodeId)) return { ok: true, segments: skipCache.get(episodeId)! };
  try {
    const res = await fetch(skipEventsUrl(episodeId), { credentials: 'omit' });
    if (!res.ok) return { ok: false, segments: [], error: `HTTP ${res.status}` };
    const segments = parseSkipEvents(await res.json());
    skipCache.set(episodeId, segments);
    return { ok: true, segments };
  } catch (err) {
    return { ok: false, segments: [], error: err instanceof Error ? err.message : String(err) };
  }
}

// ---- tracker (cross-frame hub) ---------------------------------------------

/** Latest episode metadata per tab (set by the top frame). */
const metaByTab = new Map<number, TrackerMeta>();

function toast(tabId: number, text: string): void {
  void chrome.tabs
    .sendMessage<TrackerToastMessage>(tabId, { type: 'TRACKER_TOAST', text })
    .catch(() => {});
}

/** Return a valid MAL access token, refreshing it if expired. */
async function validAccessToken(): Promise<string | null> {
  const data = await getTokenData();
  if (!data) return null;
  if (Date.now() < data.expiresAt - 60_000) return data.access;
  try {
    const fresh = await refresh(data.refresh);
    await setTokenData(fresh);
    return fresh.access;
  } catch {
    return null;
  }
}

/** Resolve (and cache) the MAL anime for a CR series+season. */
async function resolveMapping(
  access: string,
  meta: TrackerMeta,
): Promise<TrackerMapping | null> {
  const key = seriesKey(meta);
  const cached = await getMapping(key);
  if (cached) return cached;

  // Season > 1 entries are separate MAL anime; bias the search accordingly.
  const queries =
    meta.season && meta.season > 1
      ? [`${meta.series} ${meta.season}`, meta.series]
      : [meta.series];

  for (const q of queries) {
    const results = await searchAnime(access, q).catch(() => []);
    if (results.length) {
      const m = results[0];
      const mapping: TrackerMapping = {
        mediaId: m.id,
        title: m.title || meta.series,
        episodes: m.episodes,
      };
      await setMapping(key, mapping);
      return mapping;
    }
  }
  return null;
}

async function onEpisodeWatched(tabId: number): Promise<void> {
  const settings = await getSettings();
  if (!settings.enabled || !settings.mal.enabled) return;

  const meta = metaByTab.get(tabId);
  if (!meta) return;
  if (meta.episode == null) return; // can't determine progress

  const access = await validAccessToken();
  if (!access) {
    toast(tabId, 'Crunchy Tools: connect MyAnimeList in settings to sync progress');
    return;
  }

  try {
    const mapping = await resolveMapping(access, meta);
    if (!mapping) {
      toast(tabId, `Crunchy Tools: couldn't find "${meta.series}" on MyAnimeList`);
      return;
    }
    const current = await getAnimeStatus(access, mapping.mediaId).catch(() => null);
    const total = mapping.episodes ?? current?.total ?? null;
    // Non-destructive: only ever move progress FORWARD. Prevents a casual
    // rewatch / jumping to an earlier episode from dragging your count down.
    const watched = Math.max(current?.watched ?? 0, meta.episode);

    const patch: { num_watched_episodes: number; status?: string } = {
      num_watched_episodes: watched,
    };
    if (current?.rewatching) {
      // Rewatch in progress: bump the episode only; keep completed +
      // is_rewatching (MAL finalizes num_times_rewatched at the total).
    } else if (total != null && watched >= total) {
      patch.status = 'completed';
    } else if (current?.status !== 'completed') {
      // Actively watching, not finished, not already completed → watching.
      // Don't downgrade a completed entry or override on-hold/dropped→completed.
      patch.status = 'watching';
    }
    await setMyListStatus(access, mapping.mediaId, patch);
    toast(tabId, `MyAnimeList updated: ${mapping.title} • episode ${watched}`);
  } catch (err) {
    toast(tabId, `Crunchy Tools: MAL sync failed (${err instanceof Error ? err.message : 'error'})`);
  }
}

// ---- message router ---------------------------------------------------------

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  switch (message?.type) {
    case 'FETCH_SKIP_EVENTS':
      fetchSkipEvents(message.episodeId).then(sendResponse);
      return true; // async response
    case 'EPISODE_META':
      if (sender.tab?.id != null) metaByTab.set(sender.tab.id, message.meta);
      return false;
    case 'EPISODE_WATCHED':
      if (sender.tab?.id != null) void onEpisodeWatched(sender.tab.id);
      return false;
    case 'GET_TAB_STATUS': {
      const meta = metaByTab.get(message.tabId) ?? null;
      const segments = meta ? (skipCache.get(meta.episodeId)?.length ?? 0) : 0;
      sendResponse({ meta, segments });
      return false;
    }
    case 'GET_MAL_STATUS': {
      const meta = message.meta;
      (async () => {
        const access = await validAccessToken();
        if (!access) return sendResponse({ ok: false });
        const mapping = await resolveMapping(access, meta);
        if (!mapping) return sendResponse({ ok: false });
        const s = await getAnimeStatus(access, mapping.mediaId);
        sendResponse({
          ok: true,
          title: mapping.title,
          animeId: mapping.mediaId,
          total: s.total,
          watched: s.watched,
          status: s.status,
          score: s.score,
          mean: s.mean,
          rewatching: s.rewatching,
          rewatchCount: s.rewatchCount,
        });
      })().catch(() => sendResponse({ ok: false }));
      return true; // async response
    }
    case 'SET_MAL_STATUS': {
      const { meta, patch } = message;
      (async () => {
        const access = await validAccessToken();
        if (!access) return sendResponse({ ok: false });
        const mapping = await resolveMapping(access, meta);
        if (!mapping) return sendResponse({ ok: false });
        await setMyListStatus(access, mapping.mediaId, patch);
        const s = await getAnimeStatus(access, mapping.mediaId);
        sendResponse({
          ok: true,
          title: mapping.title,
          animeId: mapping.mediaId,
          total: s.total,
          watched: s.watched,
          status: s.status,
          score: s.score,
          mean: s.mean,
          rewatching: s.rewatching,
          rewatchCount: s.rewatchCount,
        });
      })().catch((err) => {
        console.warn('[Crunchy Tools] MAL update failed:', err);
        sendResponse({ ok: false, error: err instanceof Error ? err.message : 'error' });
      });
      return true; // async response
    }
    default:
      return false;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => metaByTab.delete(tabId));
