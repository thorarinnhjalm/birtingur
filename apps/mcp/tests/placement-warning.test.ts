import { describe, it, expect } from 'vitest';
import { placementWarning, withPlacementWarning } from '../src/tools/publisher/placement-warning';

function slot(name: string, position: string) {
  return { id: 'slot_a', name, placement: { pageMatcher: '*', position } };
}

describe('placementWarning', () => {
  it('warns when a header-sounding slot is placed in the sidebar', () => {
    expect(placementWarning(slot('Forsíða haus', 'sidebar'))).toContain('sidebar');
  });

  // The reason this was worth touching: the old copy matched Icelandic only,
  // and the tools are driven by coding assistants that name things in
  // English, so the warning never fired for the callers most likely to need
  // it.
  it.each(['Header banner', 'Top leaderboard', 'HEADER'])(
    'warns for the English name %s placed in the sidebar',
    (name) => {
      expect(placementWarning(slot(name, 'sidebar'))).toBeDefined();
    },
  );

  it.each(['Hliðardálkur', 'Sidebar box', 'Right rail', 'Skyscraper'])(
    'warns for %s placed in the content flow',
    (name) => {
      expect(placementWarning(slot(name, 'in_content'))).toBeDefined();
      expect(placementWarning(slot(name, 'above_fold'))).toBeDefined();
    },
  );

  it('stays quiet when the name and the position agree', () => {
    expect(placementWarning(slot('Forsíða haus', 'above_fold'))).toBeUndefined();
    expect(placementWarning(slot('Hliðardálkur', 'sidebar'))).toBeUndefined();
  });

  it('stays quiet on a neutral name', () => {
    expect(placementWarning(slot('Pláss 1', 'sidebar'))).toBeUndefined();
  });

  // "Sidebar banner" hits both keyword lists. That is ambiguous, not wrong,
  // and a warning either way would be a coin flip.
  it('stays quiet when the name points both ways at once', () => {
    expect(placementWarning(slot('Sidebar banner', 'sidebar'))).toBeUndefined();
    expect(placementWarning(slot('Sidebar banner', 'in_content'))).toBeUndefined();
  });

  it('stays quiet rather than throwing on a malformed response', () => {
    expect(placementWarning(null)).toBeUndefined();
    expect(placementWarning(undefined)).toBeUndefined();
    expect(placementWarning({})).toBeUndefined();
    expect(placementWarning({ name: 'Haus' })).toBeUndefined();
    expect(placementWarning({ name: 123, placement: { position: 'sidebar' } })).toBeUndefined();
    expect(placementWarning({ name: 'Haus', placement: null })).toBeUndefined();
  });
});

describe('withPlacementWarning', () => {
  it('attaches the warning without dropping any of the response', () => {
    const out = withPlacementWarning(slot('Header', 'sidebar')) as Record<string, unknown>;

    expect(out.id).toBe('slot_a');
    expect(out.placement).toEqual({ pageMatcher: '*', position: 'sidebar' });
    expect(out.warning).toBeDefined();
  });

  it('returns the response untouched when there is nothing to warn about', () => {
    const input = slot('Pláss 1', 'sidebar');

    expect(withPlacementWarning(input)).toBe(input);
  });
});
