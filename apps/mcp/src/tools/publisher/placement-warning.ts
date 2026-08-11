/**
 * Warns when a slot's name and its declared `placement.position` disagree.
 *
 * The check is a heuristic on the name, and it is worth keeping because the
 * mismatch is invisible otherwise: a slot named "Header banner" placed as
 * `sidebar` still serves, still earns, and only looks wrong to whoever opens
 * the page. Nothing downstream can catch it.
 *
 * It lived twice, copied verbatim into create-slot.ts and update-slot.ts,
 * and matched Icelandic words only — so an agent naming slots in English
 * (which is most of them, since the tools are driven by coding assistants)
 * got no warning at all. One copy now, and both languages.
 */

/** Name fragments that imply the slot sits at the top of the page. */
const TOP_OF_PAGE = ['haus', 'header', 'topp', 'top', 'billboard', 'leaderboard', 'banner'];

/** Name fragments that imply the slot sits in a side column. */
const SIDE_COLUMN = ['hlið', 'hliðar', 'sidebar', 'side', 'rail', 'skyscraper'];

interface SlotLike {
  name?: unknown;
  placement?: { position?: unknown } | null;
}

function mentions(name: string, fragments: string[]): boolean {
  return fragments.some((f) => name.includes(f));
}

/**
 * Returns an Icelandic warning string, or undefined when the name and the
 * position are consistent (or there isn't enough information to tell).
 */
export function placementWarning(slot: SlotLike | null | undefined): string | undefined {
  const name = typeof slot?.name === 'string' ? slot.name : null;
  const position = typeof slot?.placement?.position === 'string' ? slot.placement.position : null;
  if (!name || !position) return undefined;

  const lower = name.toLowerCase();

  // A name can hit both lists ("Sidebar banner"). That is ambiguous rather
  // than wrong, so say nothing instead of guessing which half was meant.
  const looksTop = mentions(lower, TOP_OF_PAGE);
  const looksSide = mentions(lower, SIDE_COLUMN);
  if (looksTop && looksSide) return undefined;

  if (position === 'sidebar' && looksTop) {
    return `Viðvörun: Plássið heitir "${name}" (bendir til efsta hluta síðu) en staðsetningin (placement.position) er skilgreind sem "sidebar".`;
  }
  if ((position === 'above_fold' || position === 'in_content') && looksSide) {
    return `Viðvörun: Plássið heitir "${name}" (bendir til hliðardálks) en staðsetningin (placement.position) er skilgreind sem "${position}".`;
  }
  return undefined;
}

/** Attaches the warning to an API response when there is one. */
export function withPlacementWarning(response: unknown): unknown {
  const warning = placementWarning(response as SlotLike);
  return warning ? { ...(response as object), warning } : response;
}
