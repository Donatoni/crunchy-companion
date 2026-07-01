/**
 * Idle / home dashboard: skip-stats "run" card, resume card, jump-back-in rail,
 * MAL watching rail, seasonal trending, and the "because you watched…"
 * recommendations rail.
 */
import { requestMyList, requestSeasonal, requestRecommendations } from '@/shared/messages';
import { formatSaved, getStats, lastNDays } from '@/shared/stats';
import { clearHistory, getHistory } from '@/shared/history';
import {
  $,
  makeActivatable,
  makeRailScrollable,
  openCrSearch,
  openEpisode,
  posterCard,
  railSkeleton,
  setBg,
} from './helpers';

const idleHistorySection = $('#idleHistorySection');
const idleHistory = $('#idleHistory');
const runTime = $('#runTime');
const runDesc = $('#runDesc');
const runBars = $('#runBars');
const runTotal = $('#runTotal');
const runSegments = $('#runSegments');
const runShows = $('#runShows');
const resumeCard = $<HTMLButtonElement>('#resumeCard');
const resumeThumb = $('#resumeThumb');
const resumeTitle = $('#resumeTitle');
const resumeSub = $('#resumeSub');
const myListSection = $('#myListSection');
const myListRail = $('#myListRail');
const seasonalSection = $('#seasonalSection');
const seasonalRail = $('#seasonalRail');
const recsSection = $('#recsSection');
const recsRail = $('#recsRail');
const recsLabel = $('#recsLabel');

[idleHistory, myListRail, seasonalRail, recsRail].forEach(makeRailScrollable);

const SECONDS_PER_EP = 24 * 60; // avg anime episode for the "≈ N episodes" line

export async function renderRun(): Promise<void> {
  const [s, hist] = await Promise.all([getStats(), getHistory()]);

  runTime.textContent = s.secondsSaved > 0 ? formatSaved(s.secondsSaved).replace('~', '') : '0m';

  const eps = Math.round(s.secondsSaved / SECONDS_PER_EP);
  runDesc.replaceChildren();
  runDesc.append('of intros, recaps & credits skipped');
  if (eps >= 1) {
    runDesc.append(' — that’s roughly ');
    const b = document.createElement('b');
    b.textContent = `${eps} full episode${eps === 1 ? '' : 's'}`;
    runDesc.append(b, ' you didn’t have to sit through.');
  } else {
    runDesc.append('.');
  }

  // recent-activity sparkline: a bar per day, height ∝ that day's skips
  const counts = lastNDays(s, 14);
  const max = Math.max(1, ...counts);
  runBars.replaceChildren();
  counts.forEach((count, i) => {
    const bar = document.createElement('div');
    bar.className = 'bar' + (count > 0 ? ' on' : '');
    bar.style.height = count > 0 ? `${Math.max(10, Math.round((count / max) * 38))}px` : '5px';
    const ago = counts.length - 1 - i;
    bar.title = `${count} skip${count === 1 ? '' : 's'} · ${ago === 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago}d ago`}`;
    runBars.appendChild(bar);
  });
  runTotal.textContent = `${s.skips} skips total`;
  runSegments.textContent = String(s.skips);
  runShows.textContent = String(hist.length);
}

export async function renderResume(): Promise<void> {
  const [latest] = await getHistory();
  if (!latest) {
    resumeCard.hidden = true;
    return;
  }
  resumeCard.hidden = false;
  setBg(resumeThumb, latest.thumbnail);
  resumeTitle.textContent = latest.series;
  const se = [latest.season ? `S${latest.season}` : null, latest.episode ? `E${latest.episode}` : null]
    .filter(Boolean)
    .join(' · ');
  resumeSub.textContent = [se, latest.episodeTitle].filter(Boolean).join(' — ');
  resumeCard.onclick = () => void openEpisode(latest.url);
}

export async function renderIdleHistory(): Promise<void> {
  const items = await getHistory();
  idleHistory.replaceChildren();
  idleHistorySection.hidden = items.length === 0;
  for (const it of items.slice(0, 12)) {
    const el = document.createElement('div');
    el.className = 'cw';
    el.innerHTML = `<div class="ph"></div><div class="t"></div><div class="s"></div>`;
    setBg(el.querySelector('.ph')!, it.thumbnail);
    el.querySelector<HTMLElement>('.t')!.textContent = it.series;
    el.querySelector<HTMLElement>('.s')!.textContent = [
      it.season ? `S${it.season}` : null,
      it.episode ? `E${it.episode}` : null,
    ]
      .filter(Boolean)
      .join(' ');
    el.title = it.series;
    makeActivatable(el, () => void openEpisode(it.url));
    idleHistory.appendChild(el);
  }
}
$('#idle-clear').addEventListener('click', async () => {
  await clearHistory();
  await renderIdleHistory();
});

/** Everything the idle view shows from local data (no network). */
export function renderIdleAll(): void {
  void renderRun();
  void renderResume();
  void renderIdleHistory();
}

// ── network sections (once per panel session) ───────────────────────
let homeLoaded = false;

export function loadHomeContent(): void {
  if (homeLoaded) return; // network sections load once per panel session
  homeLoaded = true;
  void loadMyList();
  void loadSeasonal();
  void loadRecs();
}

/** Re-pull My List / Seasonal / Recs next time the idle view shows. */
export function invalidateHome(): void {
  homeLoaded = false;
}

async function loadMyList(): Promise<void> {
  myListSection.hidden = true;
  try {
    const r = await requestMyList('watching');
    if (!r.connected || !r.items.length) return;
    myListRail.replaceChildren();
    for (const it of r.items) {
      const card = posterCard(
        it.picture,
        it.title,
        it.total ? `${it.watched} / ${it.total}` : `Ep ${it.watched}`,
        { progress: it.total ? it.watched / it.total : 0 },
      );
      makeActivatable(card, () => void openCrSearch(it.title));
      myListRail.appendChild(card);
    }
    myListSection.hidden = false;
  } catch {
    /* leave hidden */
  }
}

async function loadSeasonal(): Promise<void> {
  // Trending is always expected to exist, so show the section immediately with
  // skeleton cards instead of popping in when the network resolves.
  seasonalSection.hidden = false;
  railSkeleton(seasonalRail);
  try {
    const r = await requestSeasonal();
    if (!r.items.length) {
      seasonalSection.hidden = true;
      return;
    }
    seasonalRail.replaceChildren();
    for (const it of r.items) {
      const card = posterCard(it.picture, it.title, it.type ?? 'TV', { score: it.score });
      makeActivatable(card, () => void openCrSearch(it.title));
      seasonalRail.appendChild(card);
    }
  } catch {
    seasonalSection.hidden = true;
  }
}

/** "Because you watched X" — picks seeded from the most recent show we can map. */
async function loadRecs(): Promise<void> {
  recsSection.hidden = true;
  try {
    const r = await requestRecommendations();
    if (!r.ok || !r.items.length) return;
    recsLabel.textContent = r.seedTitle ? `Because you watched ${r.seedTitle}` : 'Recommended for you';
    recsLabel.title = recsLabel.textContent; // full title on hover (label is one-line clamped)
    recsRail.replaceChildren();
    for (const it of r.items) {
      const card = posterCard(it.picture, it.title, it.type ?? '');
      makeActivatable(card, () => void openCrSearch(it.title));
      recsRail.appendChild(card);
    }
    recsSection.hidden = false;
  } catch {
    /* leave hidden */
  }
}
