import { describe, expect, it } from 'vitest';
import { parseThemeEntry, themeSearchUrl } from '@/shared/themes';

describe('parseThemeEntry', () => {
  it('parses the canonical Jikan format', () => {
    expect(parseThemeEntry('1: "R★O★C★K★S" by Hound Dog (eps 1-25)')).toEqual({
      song: 'R★O★C★K★S',
      artist: 'Hound Dog',
      eps: 'eps 1-25',
    });
  });

  it('keeps parenthesised Japanese titles inside the quotes', () => {
    expect(
      parseThemeEntry('2: "Haruka Kanata (遥か彼方)" by Asian Kung-fu Generation (eps 26-53)'),
    ).toEqual({
      song: 'Haruka Kanata (遥か彼方)',
      artist: 'Asian Kung-fu Generation',
      eps: 'eps 26-53',
    });
  });

  it('handles entries without an index or episode range', () => {
    expect(parseThemeEntry('"unravel" by TK from Ling tosite sigure')).toEqual({
      song: 'unravel',
      artist: 'TK from Ling tosite sigure',
      eps: '',
    });
  });

  it('handles unquoted "Song by Artist"', () => {
    expect(parseThemeEntry('Wind by Akeboshi (ep 26)')).toEqual({
      song: 'Wind',
      artist: 'Akeboshi',
      eps: 'ep 26',
    });
  });

  it('falls back to the raw string when nothing parses', () => {
    expect(parseThemeEntry('Some Instrumental Theme')).toEqual({
      song: 'Some Instrumental Theme',
      artist: '',
      eps: '',
    });
  });
});

describe('themeSearchUrl', () => {
  it('builds a YouTube search from song + artist', () => {
    const url = themeSearchUrl({ song: 'Wind', artist: 'Akeboshi', eps: '' });
    expect(url).toBe('https://www.youtube.com/results?search_query=Wind%20Akeboshi');
  });
  it('omits a missing artist', () => {
    expect(themeSearchUrl({ song: 'Solo', artist: '', eps: '' })).toContain('search_query=Solo');
  });
});
