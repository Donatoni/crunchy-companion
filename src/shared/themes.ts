/**
 * Parsing for Jikan theme-song strings. The API returns opening/ending themes
 * as display strings like:
 *
 *   1: "R★O★C★K★S" by Hound Dog (eps 1-25)
 *   2: "Haruka Kanata (遥か彼方)" by Asian Kung-fu Generation (eps 26-53)
 *   "unravel" by TK from Ling tosite sigure
 *
 * Pure + exported for unit tests.
 */

export interface ThemeSong {
  /** Song title (without quotes), or the raw string if parsing failed. */
  song: string;
  /** Performing artist, if the string carried one. */
  artist: string;
  /** Episode range like "eps 1-25", if present. */
  eps: string;
}

export function parseThemeEntry(raw: string): ThemeSong {
  let s = raw.trim();
  // Leading index: `1: ` / `#2: `
  s = s.replace(/^#?\d+\s*:\s*/, '');
  // Trailing episode range: `(eps 1-25)` / `(ep 5)`
  let eps = '';
  const epMatch = s.match(/\((eps?\.?\s*[^)]*)\)\s*$/i);
  if (epMatch) {
    eps = epMatch[1];
    s = s.slice(0, epMatch.index).trim();
  }
  // `"Song" by Artist`
  const m = s.match(/^"(.+)"\s+by\s+(.+)$/i);
  if (m) return { song: m[1], artist: m[2].trim(), eps };
  // Unquoted `Song by Artist` (best effort — split on the LAST " by ").
  const idx = s.toLowerCase().lastIndexOf(' by ');
  if (idx > 0) {
    return { song: s.slice(0, idx).replace(/^"|"$/g, '').trim(), artist: s.slice(idx + 4).trim(), eps };
  }
  return { song: s.replace(/^"|"$/g, ''), artist: '', eps };
}

/** YouTube search URL for a theme — a search always resolves, a direct video link can't be guaranteed. */
export function themeSearchUrl(theme: ThemeSong): string {
  const q = [theme.song, theme.artist].filter(Boolean).join(' ');
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}
