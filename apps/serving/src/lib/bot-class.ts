export type BotClass = 'human' | 'known_bot' | 'suspected_bot';

/**
 * Self-declaring crawlers. Hand-maintained and DELIBERATELY incomplete: this
 * list is a floor on what we can detect, never a claim of completeness, and
 * nothing in the product may describe it as "bot filtering" on that basis.
 * Patterns are deliberately simple substring-ish matches — no nested
 * quantifiers, so no catastrophic backtracking on a hostile user-agent.
 */
export const KNOWN_BOT_PATTERNS: RegExp[] = [
  /googlebot/i,
  /google-inspectiontool/i,
  /bingbot/i,
  /duckduckbot/i,
  /yandexbot/i,
  /baiduspider/i,
  /applebot/i,
  /gptbot/i,
  /oai-searchbot/i,
  /chatgpt-user/i,
  /claudebot/i,
  /anthropic-ai/i,
  /perplexitybot/i,
  /ccbot/i,
  /ahrefsbot/i,
  /semrushbot/i,
  /mj12bot/i,
  /dotbot/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /slackbot/i,
  /linkedinbot/i,
  /discordbot/i,
  /telegrambot/i,
  // Anchored to the start of the UA on purpose. WhatsApp's link-preview
  // fetcher sends "whatsapp/" as the very first token (e.g.
  // "WhatsApp/2.23.20.0 A"), but WhatsApp's in-app browser embeds that same
  // "WhatsApp/2.x" token at the END of an otherwise ordinary Mozilla-shaped
  // UA when a real person taps a link inside a chat. An unanchored
  // /whatsapp/i matches both and would label that human click-through
  // traffic known_bot — the one class Phase 2 stops billing — costing a
  // publisher real revenue for a real visitor. Do not drop the ^ anchor "to
  // simplify" this; that is the exact regression it prevents.
  /^whatsapp\//i,
  /pingdom/i,
  /uptimerobot/i,
  /\bbot\b/i,
  /crawler/i,
  /spider/i,
];

/** Automation frameworks and headless runtimes that do NOT self-declare as
 * crawlers. Suggestive only — this class never affects money (2026-08-09
 * design), because a misclassified person costs a publisher a real credit.
 *
 * Deliberately excludes /electron/i: Electron is the shell for ordinary
 * desktop apps (Slack, Discord, Notion), not an automation signal — a
 * person reading an ad-bearing page inside one of those is a person. This
 * class is money-inert today, but the whole point of this phase is to
 * produce a number the owner will make a billing decision from, so it must
 * not be inflated with humans. Do not re-add "electron" here.
 *
 * KNOWN BLIND SPOT, stated plainly because this number feeds a real billing
 * decision: these patterns only catch old-style headless runtimes that
 * still announce themselves (a bare "HeadlessChrome" token, or a driver
 * name like puppeteer/playwright/selenium/webdriver in the UA string).
 * Chrome's `--headless=new` mode — Puppeteer's default since v22 — sends a
 * user-agent byte-identical to headed Chrome, with NO `HeadlessChrome`
 * token at all, and is NOT detectable from the user-agent by any pattern
 * here or anywhere else in this file. That traffic falls straight through
 * to 'human'. Do not add Sec-CH-UA sniffing to try to close this gap here —
 * that is speculative and deliberately out of scope for a money input; see
 * the 2026-08-09 phase-1 fix-wave notes. Read `suspected_bot` as a floor,
 * not a ceiling: the true bot share of what's labelled 'human' is unknown
 * and nonzero.
 */
const HEADLESS_PATTERNS: RegExp[] = [
  /headlesschrome/i,
  /phantomjs/i,
  /puppeteer/i,
  /playwright/i,
  /selenium/i,
  /webdriver/i,
];

/** Self-declared non-browser HTTP clients: scripts, SDKs, and CLI tools that
 * announce themselves in their default UA rather than mimicking a browser.
 * These are not crawlers (no entry in KNOWN_BOT_PATTERNS declares intent to
 * index content) and not automation frameworks driving a real browser
 * engine (HEADLESS_PATTERNS) — they're plain HTTP clients a script or
 * server-side job used to fetch a URL. Classified 'suspected_bot', same as
 * headless: suggestive only, never billing-affecting. Checked after
 * KNOWN_BOT_PATTERNS on purpose — a client whose UA happens to also match a
 * declared-crawler pattern should keep the stronger, more specific
 * known_bot signal.
 */
const NON_BROWSER_CLIENT_PATTERNS: RegExp[] = [
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /python-urllib/i,
  /go-http-client/i,
  /okhttp/i,
  /java\//i,
  /libwww-perl/i,
  /apache-httpclient/i,
  /axios\//i,
  /node-fetch/i,
  /postmanruntime/i,
];

/** A user-agent shaped like a real browser. Used only to decide whether a
 * missing Accept-Language is suspicious: real browsers always send one. */
const BROWSER_SHAPED = /mozilla\/|applewebkit|gecko\/|chrome\/|safari\/|firefox\//i;

/** Header-only classification. Pure, total, never throws: an unrecognised or
 * malformed client falls through to 'human' on purpose — an unknown visitor is
 * a person until proven otherwise, because a false 'bot' costs a publisher a
 * real credit (2026-08-09 design). */
export function classifyRequest(h: {
  userAgent?: string | null;
  acceptLanguage?: string | null;
}): BotClass {
  // Bounded before any regex runs: a hostile 50k-char UA must not become a
  // hot-path cost. Real user agents are well under 512 chars.
  const ua = (h.userAgent ?? '').slice(0, 512);

  if (ua.length === 0) return 'suspected_bot';
  if (KNOWN_BOT_PATTERNS.some((re) => re.test(ua))) return 'known_bot';
  if (NON_BROWSER_CLIENT_PATTERNS.some((re) => re.test(ua))) return 'suspected_bot';
  if (HEADLESS_PATTERNS.some((re) => re.test(ua))) return 'suspected_bot';

  const lang = (h.acceptLanguage ?? '').trim();
  if (lang.length === 0 && BROWSER_SHAPED.test(ua)) return 'suspected_bot';

  return 'human';
}
