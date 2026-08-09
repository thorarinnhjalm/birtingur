import { describe, it, expect } from 'vitest';
import { classifyRequest, KNOWN_BOT_PATTERNS, type BotClass } from '../src/lib/bot-class';

// NON_BROWSER_CLIENT_PATTERNS isn't exported (KNOWN_BOT_PATTERNS is, only so
// the "one coverage row per entry" guard below can size itself against it);
// its count is pinned directly in the "full pattern coverage" describe block.

const UA = {
  chromeDesktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  bingbot: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  gptbot:
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot',
  claudebot: 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  perplexity: 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  ahrefs: 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
  facebook: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  slack: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  headlessChrome:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36',
  puppeteer: 'Mozilla/5.0 Puppeteer',
  // IMPORTANT-1 fixture pair: WhatsApp's own link-preview fetcher sends
  // "whatsapp/" as the FIRST token in its UA...
  whatsappFetcher: 'WhatsApp/2.23.20.0 A',
  // ...whereas WhatsApp's in-app browser is a real Chrome-on-Android webview
  // that appends the same "WhatsApp/2.x" token at the END of an otherwise
  // ordinary Mozilla-shaped UA when a human taps a link inside a chat. Same
  // token, opposite meaning depending on position — this is exactly why the
  // pattern must be anchored to the start of the string.
  whatsappInAppBrowser:
    'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 WhatsApp/2.23.20.0',
  // IMPORTANT-2 fixture: a real desktop app (Slack) built on Electron. The
  // Electron token alone must never push a human into suspected_bot.
  electronApp:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Slack/4.36.140 Chrome/114.0.5735.289 Electron/25.9.7 Safari/537.36',
  // IMPORTANT-2(b) fixtures: self-declared non-browser HTTP clients. These
  // announce themselves plainly but don't match any KNOWN_BOT_PATTERNS or
  // HEADLESS_PATTERNS entry, so before NON_BROWSER_CLIENT_PATTERNS existed
  // they fell all the way through to 'human'.
  curl: 'curl/8.4.0',
  wget: 'Wget/1.21',
  pythonRequests: 'python-requests/2.31.0',
  pythonUrllib: 'Python-urllib/3.11',
  goHttpClient: 'Go-http-client/1.1',
  okhttp: 'okhttp/4.12.0',
  javaClient: 'Java/17',
  libwwwPerl: 'libwww-perl/6.67',
  apacheHttpClient: 'Apache-HttpClient/4.5.13 (Java/17)',
  axios: 'axios/1.6.0',
  nodeFetch: 'node-fetch/3.3.2',
  postman: 'PostmanRuntime/7.36',
  // IMPORTANT-2(a) fixture: Chrome's `--headless=new` mode (Puppeteer's
  // default since v22) sends a UA byte-identical to headed desktop Chrome —
  // no "HeadlessChrome" token, nothing else distinguishing it. This is
  // deliberately the SAME string as `chromeDesktop` above: the whole point
  // of the fixture is that the two are indistinguishable from the
  // user-agent alone, which is exactly the blind spot the HEADLESS_PATTERNS
  // comment documents. There is no separate "stealth" string to write.
  stealthHeadlessChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

const CASES: Array<
  [string, { userAgent?: string | null; acceptLanguage?: string | null }, BotClass]
> = [
  ['desktop Chrome', { userAgent: UA.chromeDesktop, acceptLanguage: 'is,en;q=0.9' }, 'human'],
  ['iPhone Safari', { userAgent: UA.safariIphone, acceptLanguage: 'is-IS' }, 'human'],
  ['Firefox', { userAgent: UA.firefox, acceptLanguage: 'en-GB,en;q=0.8' }, 'human'],
  ['Googlebot', { userAgent: UA.googlebot }, 'known_bot'],
  ['bingbot', { userAgent: UA.bingbot }, 'known_bot'],
  ['GPTBot', { userAgent: UA.gptbot }, 'known_bot'],
  ['ClaudeBot', { userAgent: UA.claudebot }, 'known_bot'],
  ['PerplexityBot', { userAgent: UA.perplexity }, 'known_bot'],
  ['AhrefsBot', { userAgent: UA.ahrefs }, 'known_bot'],
  ['facebookexternalhit', { userAgent: UA.facebook }, 'known_bot'],
  ['Slackbot', { userAgent: UA.slack }, 'known_bot'],
  ['HeadlessChrome', { userAgent: UA.headlessChrome, acceptLanguage: 'en-US' }, 'suspected_bot'],
  ['Puppeteer', { userAgent: UA.puppeteer }, 'suspected_bot'],
  ['browser UA with no Accept-Language', { userAgent: UA.chromeDesktop }, 'suspected_bot'],
  ['absent user agent', {}, 'suspected_bot'],
  ['empty user agent', { userAgent: '' }, 'suspected_bot'],
  // IMPORTANT-1: WhatsApp's link-preview fetcher IS the declared crawler...
  ['WhatsApp link-preview fetcher', { userAgent: UA.whatsappFetcher }, 'known_bot'],
  // ...but a human tapping a link inside WhatsApp's in-app browser is not.
  [
    'WhatsApp in-app browser (human click-through)',
    { userAgent: UA.whatsappInAppBrowser, acceptLanguage: 'en-US' },
    'human',
  ],
  // IMPORTANT-2: Electron is just the desktop-app shell; a person using one
  // is a person, not an automation signal.
  [
    'Electron-shelled desktop app (Slack desktop, human)',
    { userAgent: UA.electronApp, acceptLanguage: 'en-US' },
    'human',
  ],
  // IMPORTANT-2(b): self-declared non-browser HTTP clients. Accept-Language
  // is set on each so the assertion isolates the new signal rather than
  // piggybacking on the missing-header signal that already catches some of
  // these by accident.
  ['curl', { userAgent: UA.curl, acceptLanguage: 'en-US' }, 'suspected_bot'],
  ['Wget', { userAgent: UA.wget, acceptLanguage: 'en-US' }, 'suspected_bot'],
  ['python-requests', { userAgent: UA.pythonRequests, acceptLanguage: 'en-US' }, 'suspected_bot'],
  ['Python-urllib', { userAgent: UA.pythonUrllib, acceptLanguage: 'en-US' }, 'suspected_bot'],
  ['Go-http-client', { userAgent: UA.goHttpClient, acceptLanguage: 'en-US' }, 'suspected_bot'],
  ['okhttp', { userAgent: UA.okhttp, acceptLanguage: 'en-US' }, 'suspected_bot'],
  ['bare Java client', { userAgent: UA.javaClient, acceptLanguage: 'en-US' }, 'suspected_bot'],
  ['libwww-perl', { userAgent: UA.libwwwPerl, acceptLanguage: 'en-US' }, 'suspected_bot'],
  [
    'Apache HttpClient',
    { userAgent: UA.apacheHttpClient, acceptLanguage: 'en-US' },
    'suspected_bot',
  ],
  ['axios', { userAgent: UA.axios, acceptLanguage: 'en-US' }, 'suspected_bot'],
  ['node-fetch', { userAgent: UA.nodeFetch, acceptLanguage: 'en-US' }, 'suspected_bot'],
  ['PostmanRuntime', { userAgent: UA.postman, acceptLanguage: 'en-US' }, 'suspected_bot'],
  // IMPORTANT-2(a): documents the known blind spot rather than pretending it
  // doesn't exist. A stock `--headless=new` UA is byte-identical to headed
  // Chrome, so it lands in 'human' — see the HEADLESS_PATTERNS comment in
  // bot-class.ts. This is NOT a bug to fix by adding Sec-CH-UA sniffing; it
  // is the documented floor of what a user-agent-only classifier can see.
  [
    'stock-UA --headless=new Chrome (documented blind spot, not detectable)',
    { userAgent: UA.stealthHeadlessChrome, acceptLanguage: 'en-US' },
    'human',
  ],
];

describe('classifyRequest', () => {
  for (const [name, headers, expected] of CASES) {
    it(`classifies ${name} as ${expected}`, () => {
      expect(classifyRequest(headers)).toBe(expected);
    });
  }

  it('prefers known_bot over the headless signal when both match', () => {
    // A declared crawler that also runs headless is still a declared crawler —
    // only this class may ever affect money in Phase 2, so the precedence matters.
    expect(classifyRequest({ userAgent: 'Mozilla/5.0 HeadlessChrome Googlebot/2.1' })).toBe(
      'known_bot',
    );
  });

  it('never throws on hostile input', () => {
    const nasty: Array<string | null | undefined> = [
      'a'.repeat(50_000),
      null,
      undefined,
      '\u0020',
      '(((((((((((((((((((((((((((((((((((((((((((((((((',
    ];
    for (const ua of nasty) {
      expect(() => classifyRequest({ userAgent: ua })).not.toThrow();
    }
  });
});

/**
 * MINOR-3: the table IS the contract. Before this block, only ~9 of the 30
 * entries in KNOWN_BOT_PATTERNS (and 2 of the 6 HEADLESS_PATTERNS) had a
 * test row that would go red if a typo broke that specific pattern. This
 * block adds one row per remaining pattern so every entry in both lists is
 * pinned by name, not just by aggregate behavior.
 */
describe('classifyRequest — full pattern coverage', () => {
  const KNOWN_BOT_COVERAGE: Array<[string, string]> = [
    ['googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
    [
      'google-inspectiontool',
      'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Mobile Safari/537.36 (compatible; Google-InspectionTool/1.0;)',
    ],
    ['bingbot', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'],
    ['duckduckbot', 'DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)'],
    ['yandexbot', 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)'],
    [
      'baiduspider',
      'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
    ],
    [
      'applebot',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Applebot/0.1',
    ],
    [
      'gptbot',
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot',
    ],
    [
      'oai-searchbot',
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot',
    ],
    [
      'chatgpt-user',
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/chatgpt-user',
    ],
    ['claudebot', 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)'],
    ['anthropic-ai', 'Mozilla/5.0 (compatible; anthropic-ai; +https://www.anthropic.com)'],
    [
      'perplexitybot',
      'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
    ],
    ['ccbot', 'CCBot/2.0 (https://commoncrawl.org/faq/)'],
    ['ahrefsbot', 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)'],
    ['semrushbot', 'Mozilla/5.0 (compatible; SemrushBot/7~bl)'],
    ['mj12bot', 'Mozilla/5.0 (compatible; MJ12bot/v1.4.8; http://mj12bot.com/)'],
    [
      'dotbot',
      'Mozilla/5.0 (compatible; DotBot/1.2; +https://opensiteexplorer.org/dotbot; help@moz.com)',
    ],
    [
      'facebookexternalhit',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    ],
    ['twitterbot', 'Twitterbot/1.0'],
    ['slackbot', 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'],
    ['linkedinbot', 'LinkedInBot/1.0 (compatible; Mozilla/5.0; +http://www.linkedin.com)'],
    ['discordbot', 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'],
    ['telegrambot', 'TelegramBot/1.0'],
    ['whatsapp (fetcher, anchored)', 'WhatsApp/2.23.20.0 A'],
    ['pingdom', 'Mozilla/5.0 (compatible; PingdomBot/1.4; +https://www.pingdom.com)'],
    ['uptimerobot', 'Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)'],
    ['\\bbot\\b (generic standalone "bot" token)', 'Mozilla/5.0 (compatible; ExampleAgent bot)'],
    [
      'crawler (generic)',
      'Mozilla/5.0 (compatible; SomeCrawler/1.0; +https://example.com/crawler)',
    ],
    ['spider (generic)', 'Mozilla/5.0 (compatible; ExampleSpider/1.0; +https://example.com)'],
  ];

  it('has exactly one coverage row per KNOWN_BOT_PATTERNS entry', () => {
    // Guards the guard: if someone adds a pattern to the list without adding
    // a row here, this fails loudly instead of silently under-covering.
    expect(KNOWN_BOT_COVERAGE.length).toBe(KNOWN_BOT_PATTERNS.length);
  });

  for (const [name, ua] of KNOWN_BOT_COVERAGE) {
    it(`classifies known_bot pattern "${name}" as known_bot`, () => {
      expect(classifyRequest({ userAgent: ua })).toBe('known_bot');
    });
  }

  const HEADLESS_COVERAGE: Array<[string, string]> = [
    [
      'headlesschrome',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36',
    ],
    [
      'phantomjs',
      'Mozilla/5.0 (Unknown; Linux x86_64) AppleWebKit/538.1 (KHTML, like Gecko) PhantomJS/2.1.1 Safari/538.1',
    ],
    ['puppeteer', 'Mozilla/5.0 Puppeteer'],
    [
      'playwright',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Playwright/1.40',
    ],
    ['selenium', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) selenium/4.15.0'],
    ['webdriver', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 (webdriver)'],
  ];

  for (const [name, ua] of HEADLESS_COVERAGE) {
    it(`classifies headless pattern "${name}" as suspected_bot`, () => {
      // Accept-Language set so the assertion isolates the headless signal
      // rather than piggybacking on the missing-header signal.
      expect(classifyRequest({ userAgent: ua, acceptLanguage: 'en-US' })).toBe('suspected_bot');
    });
  }

  // IMPORTANT-2(b): one row per NON_BROWSER_CLIENT_PATTERNS entry. That list
  // isn't exported (same treatment as HEADLESS_PATTERNS), so there's no
  // count-guard test here — this block itself is the pin.
  const NON_BROWSER_CLIENT_COVERAGE: Array<[string, string]> = [
    ['curl', 'curl/8.4.0'],
    ['wget', 'Wget/1.21'],
    ['python-requests', 'python-requests/2.31.0'],
    ['python-urllib', 'Python-urllib/3.11'],
    ['go-http-client', 'Go-http-client/1.1'],
    ['okhttp', 'okhttp/4.12.0'],
    ['java/', 'Java/17'],
    ['libwww-perl', 'libwww-perl/6.67'],
    ['apache-httpclient', 'Apache-HttpClient/4.5.13 (Java/17)'],
    ['axios', 'axios/1.6.0'],
    ['node-fetch', 'node-fetch/3.3.2'],
    ['postmanruntime', 'PostmanRuntime/7.36'],
  ];

  for (const [name, ua] of NON_BROWSER_CLIENT_COVERAGE) {
    it(`classifies non-browser-client pattern "${name}" as suspected_bot`, () => {
      // Accept-Language set so the assertion isolates the non-browser-client
      // signal rather than piggybacking on the missing-header signal.
      expect(classifyRequest({ userAgent: ua, acceptLanguage: 'en-US' })).toBe('suspected_bot');
    });
  }
});
