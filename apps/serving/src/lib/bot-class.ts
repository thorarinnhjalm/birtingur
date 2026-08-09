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
  /whatsapp/i,
  /pingdom/i,
  /uptimerobot/i,
  /\bbot\b/i,
  /crawler/i,
  /spider/i,
];

/** Automation frameworks and headless runtimes that do NOT self-declare as
 * crawlers. Suggestive only — this class never affects money (2026-08-09
 * design), because a misclassified person costs a publisher a real credit. */
const HEADLESS_PATTERNS: RegExp[] = [
  /headlesschrome/i,
  /phantomjs/i,
  /puppeteer/i,
  /playwright/i,
  /electron/i,
  /selenium/i,
  /webdriver/i,
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
  if (HEADLESS_PATTERNS.some((re) => re.test(ua))) return 'suspected_bot';

  const lang = (h.acceptLanguage ?? '').trim();
  if (lang.length === 0 && BROWSER_SHAPED.test(ua)) return 'suspected_bot';

  return 'human';
}
