import {
  DEFAULT_SETTINGS,
  getSettings,
  onSettingsChanged,
  type Settings,
} from '@/shared/settings';
import { onEpisodeChange, parseEpisode } from './navigation';
import { waitForVideo } from './player';
import { getSkipSegments } from './skip-api';
import { attachSkipEngine } from './skip-engine';
import { startDomSkip } from './dom-skip';
import { attachAutoNext } from './autonext';
import { attachProgress } from './progress';
import { extractMeta } from './meta';
import { startKeepWatching } from './keep-watching';
import { showToast } from './toast';
import { requestSkipEvents, sendEpisodeMeta } from '@/shared/messages';
import { log } from '@/shared/log';
import type { EpisodeContext } from '@/shared/types';

log('content script loaded in', location.href);

/**
 * True when this frame is currently showing a watch page (URL has /watch/).
 * Evaluated live, NOT once at load: Crunchyroll is an SPA, so the same top-frame
 * document goes series-page -> watch-page without reloading the content script.
 * A cached value would stay false after navigating in from a series page.
 */
const isTopWatch = () => /\/watch\//.test(location.href);

chrome.runtime.onMessage.addListener(
  (
    msg: { type?: string; text?: string },
    _sender,
    sendResponse: (r: unknown) => void,
  ) => {
    // Worker -> top frame: show a tracker result toast (top frame only, so it
    // isn't duplicated inside the iframe).
    if (msg?.type === 'TRACKER_TOAST' && isTopWatch() && msg.text) {
      showToast({ message: msg.text, durationMs: 4000 });
      return false;
    }
    // Popup -> page: live status for the card. Only the top watch frame answers.
    if (msg?.type === 'GET_STATUS') {
      if (!isTopWatch()) return false;
      const ctx = parseEpisode();
      if (!ctx) {
        sendResponse({ meta: null, segments: 0 });
        return true;
      }
      const meta = extractMeta(ctx.episodeId);
      requestSkipEvents(ctx.episodeId)
        .then((r) => sendResponse({ meta, segments: r.ok ? r.segments.length : 0 }))
        .catch(() => sendResponse({ meta, segments: 0 }));
      return true; // async response
    }
    return false;
  },
);

/**
 * Content-script entry. Coordinates, per episode:
 *   - seek-mode auto-skip from skip-events data (when available), and
 *   - a DOM fallback that clicks the native skip button otherwise,
 *   - auto-play-next.
 *
 * Runs in every frame (all_frames). In the watch document it gets the episode id
 * from the URL and can use the API; in an embedded player iframe (no episode id)
 * it still drives the DOM fallback once a <video> appears.
 */

// Live settings mirror, kept fresh so popup/options toggles apply instantly.
// Starts from defaults, then loads the real values asynchronously.
let settings: Settings = DEFAULT_SETTINGS;
getSettings()
  .then((s) => (settings = s))
  .catch(() => {});
onSettingsChanged((s) => (settings = s));

// Runs for the whole frame lifetime (not per-episode): dismiss "still watching"
// / profile prompts so auto-play sessions aren't interrupted.
startKeepWatching(() => settings.enabled && settings.keepWatching);

let teardown: Array<() => void> = [];
function teardownSession(): void {
  for (const fn of teardown) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
  teardown = [];
}

function startSession(ctx: EpisodeContext | null): void {
  teardownSession();

  // Top frame: scrape episode metadata for the tracker and hand it to the worker.
  if (isTopWatch() && ctx) {
    const meta = extractMeta(ctx.episodeId);
    if (meta) {
      log('episode meta', `${meta.series} S${meta.season} E${meta.episode}`);
      sendEpisodeMeta(meta);
    }
  }

  const cancelWait = waitForVideo(async (video) => {
    // When we have an episode id, try the skip-events API for precise seeking.
    const segments = ctx ? await getSkipSegments(ctx.episodeId) : [];
    log(
      'video ready.',
      ctx ? `episode=${ctx.episodeId}` : 'no episode id (iframe)',
      `skip segments=${segments.length}`,
    );
    // API is "active" only when seek mode is on AND we actually have data.
    // dom-skip defers while the seek engine owns skipping; otherwise it clicks.
    const apiActive = () => settings.mode === 'seek' && segments.length > 0;

    if (segments.length > 0) {
      teardown.push(attachSkipEngine(video, segments, () => settings).detach);
    }

    teardown.push(
      startDomSkip(
        () => settings.enabled && (settings.mode === 'click' || !apiActive()),
      ).stop,
    );

    teardown.push(
      attachAutoNext(video, () => settings.enabled && settings.autoNext).detach,
    );

    if (ctx) {
      teardown.push(
        attachProgress(
          video,
          ctx.episodeId,
          () => settings.enabled && settings.mal.enabled,
        ).detach,
      );
    }
  });

  teardown.push(cancelWait);
}

onEpisodeChange(startSession);
