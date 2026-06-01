import { getSettings, patchSettings, type Settings } from '@/shared/settings';
import type { SkipType, TrackerMeta } from '@/shared/types';
import { requestMalStatus, setMalStatus } from '@/shared/messages';
import type {
  ContentStatusRequest,
  MalStatusResponse,
  TabStatusResponse,
} from '@/shared/messages';
import { formatSaved, getStats } from '@/shared/stats';

const enabledEl = document.querySelector<HTMLInputElement>('#enabled')!;
const stateEl = document.querySelector<HTMLDivElement>('#state')!;
const skipEls = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[data-skip]'),
);

/** Boolean settings bound to a checkbox by element id. */
const boolKeys = ['autoNext'] as const;
const boolEls = Object.fromEntries(
  boolKeys.map((k) => [k, document.querySelector<HTMLInputElement>(`#${k}`)!]),
) as Record<(typeof boolKeys)[number], HTMLInputElement>;

function applyEnabledUI(enabled: boolean): void {
  stateEl.textContent = enabled ? 'Active' : 'Paused';
  document.body.classList.toggle('disabled', !enabled);
}

async function render(): Promise<void> {
  const s = await getSettings();
  enabledEl.checked = s.enabled;
  for (const k of boolKeys) boolEls[k].checked = s[k] as boolean;
  for (const el of skipEls) el.checked = s.skip[el.dataset.skip as SkipType];
  applyEnabledUI(s.enabled);
}

async function renderStats(): Promise<void> {
  const s = await getStats();
  const el = document.querySelector<HTMLSpanElement>('#stats')!;
  el.textContent =
    s.skips > 0
      ? `${s.skips} skips · saved ${formatSaved(s.secondsSaved)}`
      : 'No skips yet';
}

async function renderStatus(): Promise<void> {
  const titleEl = document.querySelector<HTMLDivElement>('#statusTitle')!;
  const dotEl = document.querySelector<HTMLSpanElement>('#statusDot')!;
  const subEl = document.querySelector<HTMLSpanElement>('#statusSub')!;
  const thumbEl = document.querySelector<HTMLDivElement>('#statusThumb')!;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      hideMal();
      return;
    }
    // Ask the content script on the page directly — it always has live episode
    // data, unlike the service worker's cache which is cleared when it sleeps.
    const st = await chrome.tabs.sendMessage<ContentStatusRequest, TabStatusResponse>(
      tab.id,
      { type: 'GET_STATUS' },
    );
    if (!st?.meta) {
      hideMal();
      return;
    }

    const { series, season, episode, thumbnail } = st.meta;
    const se = [season ? `S${season}` : null, episode ? `E${episode}` : null]
      .filter(Boolean)
      .join(' ');
    titleEl.textContent = `Now watching${se ? ` · ${se}` : ''}`;
    titleEl.title = series;
    if (thumbnail) {
      thumbEl.style.backgroundImage = `url("${thumbnail}")`;
      thumbEl.style.backgroundSize = 'cover';
      thumbEl.style.backgroundPosition = 'center';
    }
    if (st.segments > 0) {
      dotEl.classList.remove('idle');
      subEl.textContent = `Skip data found · ${st.segments} segment${
        st.segments === 1 ? '' : 's'
      }`;
    } else {
      dotEl.classList.add('idle');
      subEl.textContent = 'No skip data for this episode';
    }

    currentMeta = st.meta;
    void renderMalInfo(st.meta);
  } catch {
    // Not on a watch page / worker asleep — clear the MAL UI, keep the card idle.
    hideMal();
  }
}

// ── MyAnimeList status line (editable) ──────────────────────────────
const malInfoEl = document.querySelector<HTMLDivElement>('#malInfo')!;
const malEpEl = document.querySelector<HTMLInputElement>('#malEp')!;
const malTotalEl = document.querySelector<HTMLSpanElement>('#malTotal')!;
const malStatusSel = document.querySelector<HTMLSelectElement>('#malStatusSel')!;
const malScoreSel = document.querySelector<HTMLSelectElement>('#malScoreSel')!;
const malErrEl = document.querySelector<HTMLDivElement>('#malErr')!;
const malRewatchEl = document.querySelector<HTMLDivElement>('#malRewatch')!;
const malRewatchBtn = document.querySelector<HTMLButtonElement>('#malRewatchBtn')!;
const malLink = document.querySelector<HTMLAnchorElement>('#malLink')!;

/** The show the popup is currently bound to (for edit writes). */
let currentMeta: TrackerMeta | null = null;
/** Total episodes for the current show (for "mark complete" / last-ep logic). */
let malTotal: number | null = null;

function applyMalResponse(r: MalStatusResponse | undefined): void {
  if (!r?.ok) {
    malInfoEl.hidden = true;
    return;
  }
  malTotal = r.total ?? null;
  malEpEl.value = String(r.watched ?? 0);
  if (r.total) malEpEl.max = String(r.total);
  malTotalEl.textContent = r.total ? `/ ${r.total}` : '';
  malStatusSel.value = r.status ?? 'watching';
  malScoreSel.value = r.score ? String(r.score) : '';

  // Link to the show's MyAnimeList page.
  if (r.animeId) {
    malLink.href = `https://myanimelist.net/anime/${r.animeId}`;
    malLink.hidden = false;
  } else {
    malLink.hidden = true;
  }

  // Rewatch button on any completed show.
  malRewatchBtn.hidden = r.status !== 'completed';

  // Show the row only if it has something in it.
  malRewatchEl.hidden = malLink.hidden && malRewatchBtn.hidden;

  malErrEl.hidden = true;
  malInfoEl.hidden = false;
}

/** Hide all MAL UI — used when nothing is playing / not connected. */
function hideMal(): void {
  currentMeta = null;
  malInfoEl.hidden = true;
  malRewatchEl.hidden = true;
  malErrEl.hidden = true;
}

/** Show the signed-in user's MAL list entry for the current show, if connected. */
async function renderMalInfo(meta: TrackerMeta): Promise<void> {
  try {
    applyMalResponse(await requestMalStatus(meta));
  } catch {
    malInfoEl.hidden = true;
  }
}

/** Push an edit to MAL, then re-render from the server's response. */
async function saveMal(patch: {
  num_watched_episodes?: number;
  status?: string;
  score?: number;
  is_rewatching?: boolean;
}): Promise<void> {
  if (!currentMeta) return;
  malErrEl.hidden = true;
  malInfoEl.style.opacity = '0.5';
  try {
    const r = await setMalStatus(currentMeta, patch);
    if (r?.ok) {
      applyMalResponse(r);
    } else {
      malErrEl.textContent = r?.error ? `Couldn't save: ${r.error}` : "Couldn't save to MAL";
      malErrEl.hidden = false;
      console.warn('[Crunchy Tools] MAL save failed:', r?.error);
      await renderMalInfo(currentMeta); // revert controls to the server's truth
    }
  } catch (e) {
    malErrEl.textContent = "Couldn't reach MAL";
    malErrEl.hidden = false;
    console.warn('[Crunchy Tools] MAL save error:', e);
  } finally {
    malInfoEl.style.opacity = '1';
  }
}

malEpEl.addEventListener('change', () => {
  const n = Math.max(0, Math.floor(Number(malEpEl.value) || 0));
  const patch: { num_watched_episodes: number; status?: string } = {
    num_watched_episodes: n,
  };
  // Reaching the final episode marks the show complete.
  if (malTotal && n >= malTotal) patch.status = 'completed';
  void saveMal(patch);
});
malStatusSel.addEventListener('change', () => {
  const patch: { status: string; num_watched_episodes?: number } = {
    status: malStatusSel.value,
  };
  // Marking complete implies every episode was watched.
  if (malStatusSel.value === 'completed' && malTotal) {
    patch.num_watched_episodes = malTotal;
  }
  void saveMal(patch);
});
malScoreSel.addEventListener('change', () =>
  void saveMal({ score: malScoreSel.value ? Number(malScoreSel.value) : 0 }),
);

malRewatchBtn.addEventListener('click', () => {
  malRewatchBtn.hidden = true; // hide immediately; the re-render confirms state
  const ep = currentMeta?.episode;
  // Flip to "watching" and restart progress at the current episode. Clear
  // is_rewatching — MAL forces the status back to "completed" while it's set,
  // which defeats the whole point.
  void saveMal({
    status: 'watching',
    is_rewatching: false,
    num_watched_episodes: ep && ep > 0 ? ep : 1,
  });
});

enabledEl.addEventListener('change', async () => {
  await patchSettings({ enabled: enabledEl.checked });
  applyEnabledUI(enabledEl.checked);
});

for (const k of boolKeys) {
  boolEls[k].addEventListener('change', () =>
    patchSettings({ [k]: boolEls[k].checked } as Partial<Settings>),
  );
}

for (const el of skipEls) {
  el.addEventListener('change', async () => {
    const current = (await getSettings()).skip;
    await patchSettings({
      skip: { ...current, [el.dataset.skip as SkipType]: el.checked },
    });
  });
}

document.querySelector('#open-options')!.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

void render();
void renderStats();
void renderStatus();
