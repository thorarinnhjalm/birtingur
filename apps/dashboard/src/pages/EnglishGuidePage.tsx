import { useEffect, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import EnglishHeader from '@/components/layout/EnglishHeader';
import EnglishFooter from '@/components/layout/EnglishFooter';
import { updateSEO } from '@/lib/seo';
import { Clock, ArrowLeft, ArrowRight, Share2 } from 'lucide-react';

export interface ArticleFaq {
  q: string;
  a: string;
}

export interface ArticleMeta {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  date: string;
  /** ISO date for JSON-LD */
  datePublished: string;
  dateModified?: string;
  category: 'AI & MCP' | 'Creator Monetization' | 'Privacy & Compliance' | 'Category Playbooks';
  /** Section bodies support blank-line paragraph breaks and [text](/en/...) internal links. */
  sections: { h2: string; p: string }[];
  faqs?: ArticleFaq[];
}

/** Strip [text](url) markdown links down to their text (for JSON-LD and word counts). */
function plainText(s: string): string {
  return s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

export function articleWordCount(article: ArticleMeta): number {
  const parts = [
    article.title,
    article.subtitle,
    ...article.sections.flatMap((s) => [s.h2, plainText(s.p)]),
    ...(article.faqs ?? []).flatMap((f) => [f.q, plainText(f.a)]),
  ];
  return parts.join(' ').split(/\s+/).filter(Boolean).length;
}

/** Honest read time derived from the actual word count (~220 wpm). */
export function articleReadTime(article: ArticleMeta): string {
  return `${Math.max(2, Math.ceil(articleWordCount(article) / 220))} min read`;
}

/** Render a body string: blank-line paragraph breaks, [text](url) links. */
function renderRichText(text: string, keyPrefix: string, className: string): ReactNode[] {
  return text.split(/\n\n+/).map((para, pi) => {
    const parts: ReactNode[] = [];
    const re = /\[([^\]]+)\]\(([^)]+)\)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(para))) {
      const [full, label = '', href = ''] = m;
      if (m.index > last) parts.push(para.slice(last, m.index));
      parts.push(
        <Link
          key={`${keyPrefix}-${pi}-${i++}`}
          to={href}
          className="text-primary font-semibold hover:underline"
        >
          {label}
        </Link>,
      );
      last = m.index + full.length;
    }
    if (last < para.length) parts.push(para.slice(last));
    return (
      <p key={`${keyPrefix}-${pi}`} className={className}>
        {parts}
      </p>
    );
  });
}

export const ARTICLES: Record<string, ArticleMeta> = {
  'cookieless-advertising-2026': {
    slug: 'cookieless-advertising-2026',
    category: 'Privacy & Compliance',
    title: 'Cookieless Advertising in 2026: How Category Networks Replace Tracking Cookies',
    subtitle:
      'As third-party tracking cookies vanish and privacy regulations tighten, contextual category display networks are proving to be both more sustainable for creators and more respectful of readers.',
    description:
      'Learn why cookieless contextual category advertising is replacing invasive third-party tracking cookies for creators and brands in 2026.',
    date: 'August 2026',
    datePublished: '2026-08-01',
    sections: [
      {
        h2: 'The End of Third-Party Cookie Tracking',
        p: 'For over two decades, digital advertising relied on dropping third-party tracking cookies across reader browsers. An ad on one site could recognize you on a thousand others, stitch together a behavioral profile, and follow you around the web. That model powered enormous ad businesses — and it also created intrusive surveillance, heavy page-load penalties, and the wall of cookie consent banners that now greets almost every European reader.\n\nThe model has been dying in slow motion for years. Safari and Firefox block third-party cookies by default, regulators keep tightening enforcement of ePrivacy and GDPR rules around tracking, and readers increasingly install blockers or simply decline consent. Whatever the fate of any single browser initiative, the direction of travel is unambiguous: advertising that depends on following individuals across sites is losing its infrastructure.',
      },
      {
        h2: 'What Actually Replaces the Cookie',
        p: 'Several successors compete to fill the gap. First-party data strategies ask publishers to build their own logged-in relationships. Cohort and interest-group proposals try to move targeting into the browser itself. And contextual advertising — the oldest idea in the business — matches ads to the content being read rather than to the person reading it.\n\nContextual has aged remarkably well. It needs no personal data, no cross-site identifiers, and no consent machinery of its own, because it never asks who the reader is. Modern contextual systems group inventory into interest categories — food, travel, technology — and let advertisers buy the category rather than the individual. That is the model category display networks are built on.',
      },
      {
        h2: 'Why Contextual Category Buying Wins',
        p: 'Instead of following a user across the web with retargeting banners, category buying matches ads strictly to content context. A visitor reading a food recipe is in an active culinary mindset — placing a food brand ad on that page delivers relevance without sacrificing reader privacy. The same logic holds for [travel](/en/categories/travel), [technology](/en/categories/tech), and every other interest vertical.\n\nFor brands, the appeal is simplicity and brand safety: your ad appears next to the topic you chose, not wherever a bidding algorithm found the cheapest impression. For creators, contextual demand is demand their audience actually matches — a food blog earns from food brands, which keeps the reading experience coherent instead of jarring.',
      },
      {
        h2: 'How Birtingur Builds Cookie-Free Display',
        p: 'Birtingur is a category display network designed cookie-free from the first line of code, not retrofitted. The ad-serving layer sets zero cookies of any kind — first-party or third-party — and drops no cross-site beacons. The only visitor identifier in the system is a first-party value used for frequency capping, stored by the publisher’s own embed and only with consent; without it, the request simply carries no identifier at all.\n\nThe embed itself is a single script weighing under 5KB, so it does not drag page performance down the way legacy ad wrappers do. Impressions are counted only after the industry-standard IAB viewability delay, campaign pricing is a flat 550 kr. CPM across every category, and dashboard statistics update hourly. Creators keep 80% of net revenue. You can read more about the monetization side in our [guide to monetizing niche blogs](/en/guides/adsense-alternatives-niche-blogs).',
      },
      {
        h2: 'What This Means for Creators and Brands',
        p: 'For creators, cookieless category advertising removes the two classic objections to display ads: it does not slow your site down, and it does not make you complicit in tracking your own readers. Revenue is shared 80/20 in the creator’s favor and paid out monthly once earnings pass 5.000 kr.\n\nFor brands, it replaces auction volatility and opaque fees with a predictable flat price and placements whose context you chose yourself — a model we compare to auction-based buying in detail in [Flat CPM vs. Programmatic Auctions](/en/guides/flat-cpm-vs-programmatic-rtb). The network is currently being built with an early-access waitlist for both sides.',
      },
    ],
    faqs: [
      {
        q: 'Does Birtingur set any cookies at all?',
        a: 'No. The ad-serving layer sets zero cookies, first-party or third-party. The only identifier in the system is a consent-gated, first-party frequency-capping value stored by the publisher’s own embed — and when consent is absent, requests carry no identifier at all.',
      },
      {
        q: 'Is cookieless advertising less effective than tracking-based advertising?',
        a: 'It is different rather than universally worse. Tracking-based ads can follow an individual, but contextual ads reach readers at the moment their attention is already on the relevant topic. For category-aligned products — food brands on recipe sites, gear brands on travel blogs — context is itself a strong targeting signal.',
      },
      {
        q: 'How can frequency capping work without cookies?',
        a: 'Through a first-party identifier the publisher’s embed stores in the reader’s own browser, only with consent. It never crosses sites. Without consent there is simply no identifier, and no frequency data is recorded for that visit.',
      },
      {
        q: 'What does the pricing look like?',
        a: 'A flat 550 kr. CPM — the same price for every category, set by the platform rather than by auction. Creators keep 80% of net revenue, paid out monthly with a 5.000 kr. minimum.',
      },
    ],
  },
  'adsense-alternatives-niche-blogs': {
    slug: 'adsense-alternatives-niche-blogs',
    category: 'Creator Monetization',
    title: 'The Creator Guide to Monetizing Niche Blogs Without Cookie Banners',
    subtitle:
      'How independent bloggers and content creators can earn predictable ad revenue without annoying readers with intrusive tracking scripts or complex consent-management banners.',
    description:
      'A complete creator guide to blog monetization alternatives without Google AdSense or cookie tracking.',
    date: 'August 2026',
    datePublished: '2026-08-01',
    sections: [
      {
        h2: 'Why Niche Bloggers Look Beyond the Default Networks',
        p: 'Most independent creators start with whatever ad network is easiest to sign up for, and most end up frustrated for the same reasons: unpredictable earnings that swing with auction dynamics they cannot see, page-speed penalties from heavy ad scripts, and the uncomfortable knowledge that the ads are tracking their readers across the web.\n\nFor a niche blog — a food site, a travel journal, a hobbyist tech blog — the mismatch is structural. Generic networks monetize scale and behavioral data. A niche blog’s real asset is the opposite: a focused audience reading focused content. That asset is exactly what contextual category advertising pays for.',
      },
      {
        h2: 'The Problem With Traditional Ad Networks',
        p: 'Legacy ad platforms often burden small-to-medium bloggers with fluctuating CPM rates, heavy tracking scripts that degrade site performance, and — at the managed-network end of the market — minimum traffic requirements that exclude smaller independent sites entirely.\n\nThe hidden costs compound. Slow pages hurt search rankings, which cuts traffic, which cuts revenue. Tracking scripts force consent banners, which hurt user experience and lose the revenue from every reader who declines. We walk through this dynamic in more depth in our [comparison of ad management networks](/en/guides/mediavine-ezoic-alternatives-cookieless).',
      },
      {
        h2: 'Transparent Revenue Sharing',
        p: 'Creators deserve to know exactly what they earn and why. Birtingur operates on an 80% net payout model: creators keep 80% of the ad revenue their pages generate, with the platform taking a flat 20% — no hidden data fees, no unexplained deductions, no auction spread.\n\nPricing is equally legible on the advertiser side: a flat 550 kr. CPM in every category, so the money flowing to a creator is a straightforward function of viewable impressions served. Dashboard analytics update hourly, and payouts run monthly once earnings pass the 5.000 kr. minimum, by ordinary bank transfer.',
      },
      {
        h2: 'Lightweight & Privacy-First Integration',
        p: 'Embedding Birtingur is a single copy-paste: one script snippet, under 5KB, added to your site. It reserves its space before the ad loads so it does not shift your layout, and it fires its impression pixel only after the IAB viewability delay — advertisers pay for ads that were actually seen, and creators earn from the same honest count.\n\nNo third-party cookies are dropped on your readers, ever. The only identifier is a consent-gated first-party value used for frequency capping, which means the ad layer adds no tracking of its own to your site. For React and Next.js sites there is also a typed component route via the Birtingur MCP server, described in our [developer guide to MCP-native advertising](/en/guides/mcp-ai-agent-advertising).',
      },
      {
        h2: 'Built for the Long Tail, Not Just the Giants',
        p: 'Birtingur is being built specifically for long-tail niche creators — the food bloggers, travel writers, and specialist sites that traditional managed networks turn away. There are no arbitrary traffic-volume gates for quality content sites: publishers register a site, declare its content categories, and embed a slot.\n\nAdvertisers buy the category, and the platform spreads impressions across all sites in it — so a smaller blog earns from the same campaigns, at the same flat CPM, as the biggest site in its vertical. The network is pre-launch with an early-access waitlist; if that model fits your site, this is the right time to [join the waitlist](/en#waitlist-section).',
      },
    ],
    faqs: [
      {
        q: 'How much does Birtingur pay creators?',
        a: 'Creators keep 80% of net ad revenue. Advertisers pay a flat 550 kr. CPM in every category, so earnings scale directly with viewable impressions on your pages.',
      },
      {
        q: 'When and how do I get paid?',
        a: 'Monthly, by bank transfer, once your balance passes the 5.000 kr. minimum. Balances below the minimum roll into the next month.',
      },
      {
        q: 'Is there a traffic minimum to join?',
        a: 'There are no arbitrary traffic-volume gates for quality content sites. The network is built for long-tail niche creators, and category-wide campaigns mean smaller sites serve the same campaigns as larger ones.',
      },
      {
        q: 'Will the ads slow my site down?',
        a: 'The embed is a single script under 5KB that loads asynchronously and reserves its space before the ad renders, so it avoids the layout shifts and load penalties associated with heavy ad wrappers.',
      },
      {
        q: 'Do the ads force a cookie banner on my site?',
        a: 'The ad layer itself sets no cookies and its only identifier is consent-gated, so it adds no tracking of its own. Your overall consent obligations still depend on everything else your site does — this is education, not legal advice; see our [GDPR and display ads guide](/en/guides/privacy-first-display-ads-gdpr).',
      },
    ],
  },
  'mcp-ai-agent-advertising': {
    slug: 'mcp-ai-agent-advertising',
    category: 'AI & MCP',
    title: 'The Developer & Agent Guide to MCP-Native Display Advertising',
    subtitle:
      'Model Context Protocol (MCP) lets autonomous AI agents buy campaigns and lets app developers provision ad placements programmatically — with hard money guardrails designed in.',
    description:
      'Discover how AI agents and developers use Birtingur MCP tools (create_campaign, register_publisher, get_react_component) to manage ads natively.',
    date: 'August 2026',
    datePublished: '2026-08-01',
    sections: [
      {
        h2: 'Why Model Context Protocol (MCP) Changes Display Ads',
        p: 'Traditional ad platforms assume a human clicking through a dashboard, or an engineering team maintaining fragile REST integrations. Model Context Protocol changes the interface: an LLM-based agent connects to an MCP server and discovers typed, documented tools it can call directly — no scraping, no brittle API glue.\n\nBirtingur runs a native MCP server at mcp.birtingur.app. Through it, AI agents (Claude, custom agentic pipelines, or anything else that speaks MCP) can inspect ad categories, check budgets, launch campaigns, and provision publisher ad slots. Advertising becomes infrastructure that agents can operate — under guardrails a human configured first.',
      },
      {
        h2: 'What the Birtingur MCP Server Exposes',
        p: 'Every MCP session is scoped by its API key. Publisher-scoped keys see publisher tools: register_publisher, create_slot, update_slot, list_slots, get_snippet, get_react_component, get_stats, set_content_policy, and get_changelog. Advertiser-scoped keys see buying tools: list_categories, create_campaign, get_campaign, list_campaigns, list_creatives, and get_wallet.\n\nThe prerequisite is deliberate and non-negotiable: every MCP call requires an API key that a human created in the Birtingur dashboard. There is no self-serve agent onboarding and no zero-touch path from “agent exists” to “agent spends money” — a design choice, not a missing feature.',
      },
      {
        h2: 'For Advertisers: Programmatic AI Agent Purchasing',
        p: 'Using tools like list_categories and create_campaign, an agent can evaluate campaign objectives, pick relevant content verticals such as [Tech & Innovation](/en/categories/tech), set a budget, and submit the buy — all at the same flat 550 kr. CPM a human buyer pays.\n\nSpending is fenced in three ways. Purchasing must be explicitly enabled per API key by its owner. Each key’s spending counts against a monthly cap. And any single purchase above the key’s auto-approve limit is created in a pending state and waits for the owner to approve or reject it in the dashboard — the agent cannot approve its own purchase. Campaign creation also supports idempotency keys, so an agent retrying a request cannot accidentally buy twice.',
      },
      {
        h2: 'For Developers: Ad Infrastructure Provisioning',
        p: 'With a publisher API key created in the dashboard, developers building web apps or AI tools can call register_publisher, create_slot, and get_react_component via MCP. The result is a fully typed React component — a BirtingurAdSlot — that reserves its dimensions to avoid layout shift, handles loading and fallback states, and fires viewability-correct impression tracking.\n\nFor non-React sites, get_snippet returns the standard embed instead: a single script under 5KB. Either way the integration serves privacy-first contextual ads with zero cookies, and revenue is shared 80/20 with monthly payouts. Our [AI app monetization guide](/en/guides/ai-app-monetization-sdk-widgets) covers the developer path end to end.',
      },
      {
        h2: 'Guardrails Are the Feature',
        p: 'Agentic buying only works commercially if money cannot leak. That is why the boundaries sit server-side, keyed to the API key’s identity rather than to anything the agent claims about itself: wallet top-ups, budget increases, and refunds are dashboard-only operations with no MCP path at all, and high-value purchases always pause for a human.\n\nFor teams building agents, this is the pitch: your agent gets real buying power inside limits you set, and the failure mode of a confused agent is a pending approval in your dashboard — not a drained wallet. That trade is what makes it reasonable to hand advertising to software in the first place.',
      },
    ],
    faqs: [
      {
        q: 'Can an AI agent spend money without human oversight?',
        a: 'No. Purchasing must be enabled per API key by its human owner, spending counts against a monthly cap per key, and purchases above the key’s auto-approve limit wait for human approval in the dashboard. Top-ups and refunds have no MCP path at all.',
      },
      {
        q: 'Where is the MCP server and how do I authenticate?',
        a: 'The server runs at mcp.birtingur.app. Authentication is a bearer API key created by a human in the Birtingur dashboard; the key’s scope (publisher, advertiser, or both) decides which tools the session sees.',
      },
      {
        q: 'What React support exists?',
        a: 'The get_react_component tool returns a typed BirtingurAdSlot component that reserves its dimensions (no layout shift), handles loading and fallbacks, and implements viewability-correct impression tracking. Non-React sites use get_snippet for the standard sub-5KB embed.',
      },
      {
        q: 'Can an agent register a publisher account from scratch?',
        a: 'An agent can call register_publisher — but only with an API key a human already created in the dashboard. There is deliberately no zero-touch onboarding path for agents.',
      },
      {
        q: 'What happens if my agent retries a purchase request?',
        a: 'Campaign creation supports idempotency keys, so a retried request with the same key resolves to the same campaign instead of creating a duplicate purchase.',
      },
    ],
  },
  'geo-generative-engine-optimization-display-ads': {
    slug: 'geo-generative-engine-optimization-display-ads',
    category: 'AI & MCP',
    title: 'Generative Engine Optimization (GEO): How AI Search Engines Recommend Brands in 2026',
    subtitle:
      'As readers shift from traditional search to AI answer engines like Perplexity, ChatGPT Search, and Claude, brands are rethinking visibility — here is what category display ads can and cannot do for GEO.',
    description:
      'An honest look at Generative Engine Optimization (GEO) and where contextual category display placements may fit into AI search visibility.',
    date: 'August 2026',
    datePublished: '2026-08-01',
    sections: [
      {
        h2: 'From SEO to GEO: The Shift to AI Answer Engines',
        p: 'As millions of users replace traditional Google search bars with AI answer engines like Perplexity, ChatGPT Search, and Gemini, the discovery question changes shape. A classic search result is a ranked list you scan; an AI answer is a synthesis you receive. If the engine answers first, being “ranked third” stops meaning what it used to.\n\nGenerative Engine Optimization — GEO — is the emerging discipline of being present in those synthesized answers. It is young, poorly standardized, and full of confident claims that outrun the evidence. This guide tries to do the opposite: separate what is known about how AI engines discover content from what is still speculation.',
      },
      {
        h2: 'How AI Engines Actually Discover Content',
        p: 'AI answer engines learn about the web in a few concrete ways: their training corpora, live retrieval crawls at question time, and structured feeds and files that publishers expose — sitemaps, structured data, and increasingly llms.txt files that describe a site to language models in plain text.\n\nTwo properties of that pipeline matter for advertisers. First, AI crawlers overwhelmingly read served HTML and mostly do not execute JavaScript the way a browser does. Second, engines weight content that exists as stable, linkable, citable text. Content rendered dynamically into a page — which is how display ads work — is largely invisible to that machinery.',
      },
      {
        h2: 'What Category Visibility May — and May Not — Do for GEO',
        p: 'Could consistent brand presence across top food, tech, or lifestyle blogs influence how AI engines discover and describe your brand? Nobody can honestly promise that today: display ads render in the reader’s browser, and AI crawlers mostly do not see them. Anyone selling “buy ads, get recommended by AI” is selling ahead of the evidence.\n\nWhat category coverage verifiably builds is brand recall among the human readers those engines cite. Bloggers who know your brand mention it in posts, reviews, and roundups — and that editorial text is exactly what AI crawlers do read. Any GEO effect of display advertising is therefore indirect and unproven, running through humans rather than through the ad pixels themselves.',
      },
      {
        h2: 'What Verifiably Works: Humans First',
        p: 'The reliable case for category display remains the human one. A reader browsing recipes in the [Food & Culinary category](/en/categories/food) is in a buying mindset that no answer engine mediates; a developer reading a niche tech blog is reachable in context at a flat 550 kr. CPM, with impressions counted only after the IAB viewability delay.\n\nBuy category placements for the readers planning purchases today — and treat any generative-engine upside as a possible bonus, not the business case. If the bonus materializes as GEO research matures, early contextual presence costs nothing extra; if it never does, the placements still did their primary job.',
      },
      {
        h2: 'A Practical, Honest GEO Checklist for Brands',
        p: 'If AI visibility matters to you, work on the things engines demonstrably read: publish substantive, citable content on your own domain; expose clean structured data and accurate metadata; consider an llms.txt describing what your company does; and earn genuine editorial mentions on sites AI engines crawl and cite.\n\nThen let advertising do what advertising does — build recognition among humans. That division of labor is honest about the mechanism, holds up whichever way the GEO evidence develops, and keeps your budget attached to outcomes you can actually measure, like the viewable impressions and hourly campaign statistics a category buy reports.',
      },
    ],
    faqs: [
      {
        q: 'Will buying display ads get my brand recommended by AI engines?',
        a: 'Nobody can honestly promise that today. Display ads render client-side and AI crawlers mostly do not execute JavaScript, so the ads themselves are largely invisible to those engines. Any effect runs indirectly through human readers — and remains unproven.',
      },
      {
        q: 'Do AI crawlers see display ads at all?',
        a: 'Mostly not. AI crawlers predominantly read served HTML and skip JavaScript execution, while display ads are injected into pages by scripts at view time. What crawlers do read is the editorial text around the ads.',
      },
      {
        q: 'What is llms.txt?',
        a: 'A plain-text file a site can publish (like robots.txt or a sitemap) describing its content to language models — one of the concrete, low-cost GEO steps a brand controls directly on its own domain.',
      },
      {
        q: 'How should a brand measure GEO efforts?',
        a: 'Cautiously. Track whether AI engines cite or describe your brand accurately over time, but anchor budget decisions in measurable outcomes — for display, that means viewability-counted impressions and campaign statistics, which Birtingur updates hourly.',
      },
    ],
  },
  'ai-app-monetization-sdk-widgets': {
    slug: 'ai-app-monetization-sdk-widgets',
    category: 'AI & MCP',
    title: 'Monetizing AI Web Apps & Chat Interfaces with Privacy-First Display Widgets',
    subtitle:
      'How Next.js developers and AI wrapper builders can integrate lightweight, non-intrusive display ad widgets to monetize AI tools without tracking their users.',
    description:
      'A practical guide for AI app developers to monetize chatbots, SaaS tools, and web applications using privacy-first ad widgets.',
    date: 'August 2026',
    datePublished: '2026-08-01',
    sections: [
      {
        h2: 'The Challenge of Monetizing Modern AI Web Apps',
        p: 'Building AI applications on top of LLM APIs means every active user costs real money in tokens. Subscriptions monetize the committed minority; the long tail of free users is pure cost unless something else pays for them. Advertising is the obvious candidate — and the obviously dangerous one, because AI products live or die on user trust.\n\nAn AI app that injects trackers into a chat interface is burning exactly the trust it depends on. Users tell these tools things they would never type into a search box. The bar for advertising inside them is correspondingly higher: no surveillance, no data leakage, no degraded experience.',
      },
      {
        h2: 'Why Traditional Programmatic Breaks SPAs',
        p: 'Legacy programmatic ad stacks were built for document-based websites, not for React and Next.js single-page applications. Their tag wrappers assume full page loads, inject synchronously, fight client-side routers, and drop tracking scripts that both violate the privacy expectations of an AI product and wreck its Core Web Vitals.\n\nThe result is familiar to anyone who has tried: layout shifts in a streaming chat UI, hydration mismatches, and a consent-management burden the app never needed before. The fix is not a cleverer wrapper — it is an ad layer designed for component-based apps from the start.',
      },
      {
        h2: 'Lightweight & Privacy-First Widget Architecture',
        p: 'Birtingur provides two integration paths sized for modern apps: a single script embed under 5KB, and a typed React component (BirtingurAdSlot) obtained through the [Birtingur MCP server](/en/guides/mcp-ai-agent-advertising). Both load asynchronously, reserve their dimensions up front to avoid layout shift, and support the standard IAB sizes from mobile banners to half-page units.\n\nCritically for AI products: the ad layer sets zero cookies and never sees, stores, or tracks user prompts. Targeting is purely contextual — the app declares its interest categories, and campaigns bought in those categories fill the slots. Impressions count only after the IAB viewability delay, so reported numbers reflect ads users actually saw.',
      },
      {
        h2: 'From API Key to Rendered Slot',
        p: 'The integration flow is short and explicit. A human creates a publisher API key in the Birtingur dashboard. With that key, you (or your coding agent, over MCP) call register_publisher for the app, create_slot for each placement, and get_react_component to receive the typed component — then drop a BirtingurAdSlot into your layout.\n\nWhen no campaign fills a slot, the component renders its configured fallback — a house ad or a transparent placeholder — so the space never breaks your design. Slot statistics are available from the same tooling via get_stats, and update hourly like everything else in the network.',
      },
      {
        h2: 'Getting Paid',
        p: 'Revenue accrues automatically as viewable impressions serve against category campaigns, all priced at the flat 550 kr. CPM. Developers keep 80% of net revenue; payouts run monthly by bank transfer once earnings pass the 5.000 kr. minimum.\n\nThe economics are deliberately legible: one flat price on the demand side, one fixed split on the supply side, hourly statistics in between. For an AI app, that means the free tier stops being a pure cost line without your users paying with their privacy instead. The network is pre-launch — developers can [join the early-access waitlist](/en#waitlist-section) now.',
      },
    ],
    faqs: [
      {
        q: 'Does the widget track my users or their prompts?',
        a: 'No. The ad layer sets zero cookies, performs no cross-site tracking, and never sees or stores user prompts. Targeting is contextual: campaigns match the interest categories your app declares, not your users’ behavior.',
      },
      {
        q: 'Which ad sizes are supported?',
        a: 'The standard IAB sizes: 728×90 leaderboard, 300×250 medium rectangle, 300×600 half page, 320×100 mobile banner, and a 980×120 billboard format.',
      },
      {
        q: 'What happens when no ad fills the slot?',
        a: 'The slot renders its configured fallback — a house ad or a fully transparent placeholder — so your layout never breaks. Fallbacks are configured per slot.',
      },
      {
        q: 'How do payouts work for developers?',
        a: 'You keep 80% of net revenue, paid out monthly by bank transfer once your balance passes 5.000 kr. Statistics update hourly so you can follow earnings as they accrue.',
      },
      {
        q: 'Does it work with React 19 and Next.js?',
        a: 'Yes — the get_react_component MCP tool returns a typed React component designed for component-based apps: async loading, reserved dimensions (no layout shift), and correct viewability tracking. Non-React apps use the sub-5KB script embed instead.',
      },
    ],
  },
  'mediavine-ezoic-alternatives-cookieless': {
    slug: 'mediavine-ezoic-alternatives-cookieless',
    category: 'Creator Monetization',
    title:
      'Mediavine & Ezoic Alternatives: How Cookieless Category Networks Compare for Independent Creators',
    subtitle:
      'A side-by-side analysis of traditional ad management networks versus modern, lightweight category display networks.',
    description:
      'Compare Mediavine, Ezoic, and Birtingur: an 80% revenue share model with zero tracking cookies and a single lightweight embed.',
    date: 'August 2026',
    datePublished: '2026-08-01',
    sections: [
      {
        h2: 'The Hidden Cost of Traditional Ad Management Networks',
        p: 'Traditional ad management networks typically ask bloggers to install heavy ad wrappers loaded with third-party tracking scripts — a common cause of layout shifts and slow mobile page loads. The wrapper runs the whole page’s ad experience, which is the point: maximum yield extraction from every scroll.\n\nNetworks like Mediavine and Ezoic also publicly document minimum traffic requirements for their main programs, which leave many independent blogs out entirely. For creators below those thresholds — or creators unwilling to hand their page experience to a yield wrapper — the practical question is what a lighter-weight alternative actually trades away.',
      },
      {
        h2: 'What a Category Network Does Differently',
        p: 'A category display network inverts the model. Instead of managing your page and auctioning your readers, it sells your context: advertisers buy an interest category — [food](/en/categories/food), [travel](/en/categories/travel), [technology](/en/categories/tech) — and the network spreads those campaigns across every registered site in the category.\n\nThe practical differences follow from that inversion. There is no yield wrapper because there is no auction to run in your page. There is no behavioral tracking because nothing targets the individual reader. And there is no traffic-volume gate, because a category buy needs relevant context, not scale from any single site — the campaign aggregates reach across the whole category.',
      },
      {
        h2: 'Fast Page Speeds & High Viewability',
        p: 'Birtingur’s implementation is a single script under 5KB — no wrapper, no cascade of vendor tags. It loads asynchronously, reserves the slot’s dimensions before the ad renders, and therefore preserves the Core Web Vitals that took you months to earn.\n\nImpressions are counted only after the IAB viewability threshold is met, which aligns everyone’s incentives around ads that readers actually see. Campaign statistics update hourly for both the creator and the advertiser, from the same data.',
      },
      {
        h2: 'Fair 80% Payouts Without Arbitrary Traffic Gates',
        p: 'Birtingur’s split is a flat 80/20 in the creator’s favor, computed on net revenue from a flat 550 kr. CPM that is identical in every category. There is no per-session bonus math, no tiered loyalty program, and no spread between what the advertiser paid and what you can verify — the pricing is public and the statistics are shared.\n\nPayouts run monthly by bank transfer with a 5.000 kr. minimum, and quality content sites are not turned away for being small. For the fuller economic argument — flat pricing versus auction volatility — see [Flat CPM vs. Programmatic Auctions](/en/guides/flat-cpm-vs-programmatic-rtb).',
      },
      {
        h2: 'An Honest Comparison Checklist',
        p: 'Managed yield networks and category networks optimize for different creators, and pretending otherwise helps no one. If your site has large, broad traffic and you want a team maximizing auction yield on every impression, a managed network is built for exactly that.\n\nWhatever you choose, ask every network the same questions: What is the revenue split, on what base? What scripts will run on my readers’ devices, and what do they track? What happens to my page speed? When is an impression counted? When and how do I get paid? Birtingur’s answers are: 80/20 on net, one sub-5KB script, zero cookies, IAB-viewability counting, and monthly payouts from 5.000 kr.',
      },
    ],
    faqs: [
      {
        q: 'Do I need a minimum amount of traffic to join Birtingur?',
        a: 'No arbitrary traffic-volume gates apply to quality content sites. Category-wide campaigns aggregate reach across all sites in a category, so smaller blogs serve the same campaigns at the same flat CPM as larger ones.',
      },
      {
        q: 'How does the 80/20 split compare to managed networks?',
        a: 'Managed networks publish their own splits and structures, which vary by program and tier — check their current terms directly. Birtingur’s split is flat: 80% of net revenue to the creator, with public flat-CPM pricing on the advertiser side, so the whole chain is verifiable from your dashboard.',
      },
      {
        q: 'What does the embed do to my page speed?',
        a: 'The embed is a single script under 5KB that loads asynchronously and reserves its dimensions before rendering — designed to leave Core Web Vitals intact rather than trading them for yield.',
      },
      {
        q: 'When is an impression actually counted?',
        a: 'Only after the IAB viewability delay — an ad that renders off-screen or is scrolled past immediately does not count. Advertisers pay for viewed impressions and creators earn from the same count.',
      },
    ],
  },
  'flat-cpm-vs-programmatic-rtb': {
    slug: 'flat-cpm-vs-programmatic-rtb',
    category: 'Creator Monetization',
    title:
      'Flat CPM vs. Programmatic Auctions: How Category Network Pricing Differs from Auction Bidding',
    subtitle:
      'Understand how flat CPM category buying eliminates programmatic ad tax, auction volatility, and opaque middleman fees.',
    description:
      'Learn why flat CPM category ad pricing provides predictable revenues for creators and transparent ROI for brands compared to bidding auctions.',
    date: 'August 2026',
    datePublished: '2026-08-01',
    sections: [
      {
        h2: 'The Opaque World of Programmatic Auctions',
        p: 'In auction-based (RTB) programmatic advertising, every impression is auctioned in the milliseconds before a page renders, and a chain of intermediaries — DSPs, SSPs, exchanges, data brokers, verification vendors — each takes a cut along the way. Industry supply-chain studies, most famously ISBA and PwC’s 2020 programmatic transparency report, found that roughly half of advertiser spend can be absorbed before reaching the publisher, with a portion untraceable even to auditors.\n\nCreators experience the same chain as volatility: CPMs that swing by the hour with auction dynamics nobody on the publisher side can see, and a persistent gap between what advertisers apparently paid and what arrived.',
      },
      {
        h2: 'The Power of Predictable Flat CPM Pricing',
        p: 'Birtingur removes the auction entirely. Every impression in every category costs a flat 550 kr. CPM — the price is set by the platform, published openly, and locked server-side, so it cannot drift per placement or per buyer. Advertisers know exactly what every thousand viewable impressions costs before they spend a single króna.\n\nCreators receive the mirror image of that predictability: a fixed 80% share of net revenue from a known price, instead of a fluctuating share of an unknowable one. Budgeting works in both directions — a brand can compute reach from budget, and a creator can estimate earnings from traffic, with no auction weather in between.',
      },
      {
        h2: 'Direct Category Efficiency',
        p: 'The structural saving comes from what is not in the chain. A category buy goes from advertiser to platform to creator — no DSP fees, no SSP take, no data-broker margin, no verification vendor reselling trust. The platform’s entire cut is the published 20% of net on the supply side.\n\nEfficiency also shows up in what you buy: placements in the category you chose — [food](/en/categories/food), [tech](/en/categories/tech), [finance](/en/categories/finance) — with impressions counted only after the IAB viewability delay, and campaign statistics updating hourly. The comparison with traditional managed networks is covered in our [Mediavine & Ezoic alternatives guide](/en/guides/mediavine-ezoic-alternatives-cookieless).',
      },
      {
        h2: 'Where Auctions Still Make Sense',
        p: 'Honesty requires the caveat: auctions exist for a reason. If a brand needs to retarget specific users across the open web, or to arbitrage remnant inventory at massive scale, RTB auctions are the machinery built for that — with its complexity and its costs as the price of that flexibility.\n\nFlat-CPM category buying wins in a different regime: brands that want contextual reach in defined verticals at a knowable price, and creators who want predictable, transparent earnings without hosting an auction in their pages. For the long-tail niche web, that regime is most of what matters.',
      },
    ],
    faqs: [
      {
        q: 'What exactly does 550 kr. CPM mean?',
        a: 'CPM is the price per thousand impressions — so 550 kr. buys one thousand viewable impressions, in any category. On Birtingur an impression only counts after the IAB viewability delay, so the thousand you pay for were actually seen.',
      },
      {
        q: 'Who sets the price, and can it vary by category?',
        a: 'The platform sets one flat price — 550 kr. CPM — identical in every category, and it is locked server-side. There are no premium verticals, no per-site pricing, and no auction that could move it.',
      },
      {
        q: 'How much of my ad budget reaches creators?',
        a: 'The chain is advertiser → platform → creator, with the creator keeping 80% of net revenue. There are no DSP, SSP, or data-broker intermediaries taking additional cuts along the way.',
      },
      {
        q: 'Is flat CPM always better than an auction?',
        a: 'No — auctions remain the right machinery for cross-web retargeting and massive-scale remnant buying. Flat CPM wins when you want contextual reach in defined categories at a predictable price, which is the long-tail niche use case Birtingur is built for.',
      },
    ],
  },
  'privacy-first-display-ads-gdpr': {
    slug: 'privacy-first-display-ads-gdpr',
    category: 'Privacy & Compliance',
    title: 'GDPR, ePrivacy and Display Ads: How Cookieless Category Serving Simplifies Compliance',
    subtitle:
      'An educational guide to how cookieless, category-based ad serving interacts with GDPR and ePrivacy rules for European creators.',
    description:
      'An educational legal and technical guide to GDPR & ePrivacy compliance in display advertising through cookieless contextual targeting.',
    date: 'August 2026',
    datePublished: '2026-08-01',
    sections: [
      {
        h2: 'What GDPR and ePrivacy Actually Require for Ads',
        p: 'Two European legal regimes shape display advertising. The ePrivacy rules require consent before storing or accessing information on a reader’s device — the rule that makes tracking cookies consent-gated. GDPR governs any processing of personal data: profiles, identifiers, behavioral histories, and anything else that relates to an identifiable person.\n\nThe key insight for publishers is that both regimes attach to what your ad stack does, not to what it is called. An ad system that stores identifiers and builds profiles triggers both regimes regardless of branding; an ad system that stores nothing on the device and processes no personal data gives the regimes much less to attach to. This guide is educational — it is not legal advice for your specific site.',
      },
      {
        h2: 'The Frustration of CMP Cookie Consent Banners',
        p: 'Consent Management Platforms exist because tracking-based advertising needs consent to be lawful in Europe. The resulting banners degrade user experience, drive bounce rates up, and cost publishers real money: every reader who clicks “decline” is a reader whose attention the tracking stack cannot monetize.\n\nThe deeper problem is the incentive structure. A publisher whose revenue depends on consent rates is a publisher under pressure to make declining harder than accepting — which is exactly the dark-pattern territory European regulators have been penalizing. Removing the tracking removes the pressure.',
      },
      {
        h2: 'Privacy-by-Design Display Architecture',
        p: 'Birtingur serves ads entirely in-context based on interest category matching — the [cookieless model](/en/guides/cookieless-advertising-2026) applied end to end. The ad serving mechanism sets zero cookies of any kind, drops no cross-site beacons, and performs no reader profiling. There is no bidstream broadcasting reader data to hundreds of vendors, because there is no bidstream at all.\n\nThe one identifier in the system is deliberately narrow: a first-party frequency-capping value that the publisher’s own embed stores, and only with consent. When consent is absent, the request carries no identifier, nothing is stored on the device, and no per-visitor record is created — the system degrades to fully anonymous serving rather than seeking a workaround.',
      },
      {
        h2: 'What Publishers Remain Responsible For',
        p: 'A privacy-clean ad layer does not make a site compliant by itself, and honest vendors say so. Your analytics, your embedded videos, your newsletter pixels, and your social widgets all carry their own ePrivacy and GDPR consequences; each publisher remains responsible for their own site-wide compliance, consent management, and privacy policy.\n\nWhat the ad layer determines is its own contribution to that picture. Because Birtingur’s serving adds no tracking, it adds far less consent overhead than cookie-based networks — the ad stack stops being the reason your consent banner exists, even if other parts of your site still need one.',
      },
      {
        h2: 'Retaining Reader Trust & Regulatory Direction',
        p: 'Privacy by design keeps the ad stack from adding tracking risk to your site while providing a clean, respectful experience for every reader — including the growing share who decline consent or browse with blockers, whom tracking-based stacks simply fail to monetize.\n\nThe regulatory direction across Europe has pointed the same way for years: tighter enforcement, higher penalties, less tolerance for consent theater. Building on an ad model that does not depend on tracking is not just an ethical position; it is the position that requires no migration when the next enforcement wave lands. Again: educational guidance, not legal advice for your specific situation.',
      },
    ],
    faqs: [
      {
        q: 'Does using Birtingur mean my site needs no cookie banner?',
        a: 'Not necessarily — that depends on everything else your site does (analytics, embeds, pixels). What the ad layer contributes is: zero cookies, no cross-site beacons, no profiling, and a consent-gated first-party identifier. The ad stack stops being a reason for the banner; your other tools may still be. This is education, not legal advice.',
      },
      {
        q: 'What data does Birtingur’s ad serving process about my readers?',
        a: 'Serving is contextual: campaigns match the page’s declared categories, not the reader. No profile is built, no cookies are set, and no cross-site identifier exists. With consent, a first-party frequency-capping value is stored by your own embed; without consent, requests carry no identifier at all.',
      },
      {
        q: 'What is the consent-gated visitor identifier for?',
        a: 'Only frequency capping — limiting how often one visitor sees the same campaign. It is stored first-party by the publisher’s embed, never crosses sites, and simply does not exist for visitors who have not consented.',
      },
      {
        q: 'Is this guide legal advice?',
        a: 'No. It explains the technical architecture and how it interacts with the general shape of GDPR and ePrivacy rules. For your specific site and jurisdiction, consult a qualified professional.',
      },
    ],
  },
  'food-culinary-blog-advertising-guide': {
    slug: 'food-culinary-blog-advertising-guide',
    category: 'Category Playbooks',
    title: 'Food & Culinary Display Advertising: Reaching Home Cooks in High-Intent Mindsets',
    subtitle:
      'How kitchen brands, food delivery services, and culinary sites capture high-converting recipe audiences.',
    description:
      'A deep dive into food and culinary category ad buying: how brands connect with home cooks during meal planning.',
    date: 'August 2026',
    datePublished: '2026-08-01',
    sections: [
      {
        h2: 'The Power of Culinary Mindset Targeting',
        p: 'Food and recipe content drives some of the strongest purchase intent on the open web. A reader browsing dinner recipes, ingredient substitutions, or kitchen appliance reviews is actively preparing to spend money on food and kitchen products — often the same day. No behavioral profile can improve on that signal, because the page itself is the signal.\n\nThis is the core logic of contextual category buying: instead of reconstructing intent from surveillance, you meet the reader inside the moment of intent. The recipe page is the supermarket aisle.',
      },
      {
        h2: 'Contextual Category vs. Generic Retargeting',
        p: 'Showing a footwear ad on a baking blog confuses the reader and wastes the impression; a retargeting banner for something the reader already bought last week does worse. Placed within Birtingur’s [Food & Culinary category](/en/categories/food), your ad appears directly alongside trusted recipe creators, borrowing the coherence of the page instead of fighting it.\n\nBecause the buy is contextual, it also reaches the readers tracking-based systems structurally miss: people who decline cookie consent, use blockers, or browse privately. On a cookieless network those readers see exactly the same ads as everyone else — a growing audience most retargeting simply cannot touch.',
      },
      {
        h2: 'How a Food Category Buy Works',
        p: 'A food category campaign is one decision, not a media plan: choose the Food & Culinary category, set a total budget, and the platform spreads your impressions across every registered food site in the network — from established recipe destinations to specialist baking and coffee blogs. There is no site-by-site negotiation and no auction.\n\nPricing is the network-wide flat 550 kr. CPM, and the buy flow shows a daily impression forecast for the category before you commit, so reach is knowable in advance. Impressions count only after the IAB viewability delay, and campaign statistics update hourly from launch.',
      },
      {
        h2: 'Creative That Works on Recipe Pages',
        p: 'Recipe readers are task-focused, so the creative that performs is the creative that respects the task: clean product imagery, one clear offer, and standard IAB formats — the 300×250 rectangle inside content, the 728×90 leaderboard or 980×120 billboard above it, the 320×100 banner on mobile.\n\nBecause slots reserve their dimensions before the ad loads, your creative never causes the layout jumps that infuriate someone halfway through a recipe. The default frequency cap keeps repeat exposure reasonable for consented visitors, which protects both the reader’s patience and your brand.',
      },
      {
        h2: 'Empowering Food Creators',
        p: 'Food bloggers spend hours testing recipes, photographing dishes, and writing detailed guides. Birtingur’s 80% revenue share pays that work fairly: creators keep 80% of net revenue from the flat CPM, with monthly payouts from 5.000 kr. and hourly statistics on what their pages earned.\n\nFor advertisers this matters too — a network that pays creators fairly keeps quality food sites in the network, which is where your campaigns live. If you write about food, [join the creator waitlist](/en#waitlist-section); if you sell to people who cook, the [category page](/en/categories/food) is the place to start.',
      },
    ],
    faqs: [
      {
        q: 'What does a food category campaign cost?',
        a: 'The same flat 550 kr. CPM as every other category — there is no premium pricing for food. You set a total budget, and reach follows directly from it at the flat price.',
      },
      {
        q: 'Can I pick specific food blogs for my ads?',
        a: 'No — and that is the model. You buy the Food & Culinary category, and impressions spread across all registered sites in it. What you control is the category, the budget, and the creative.',
      },
      {
        q: 'How do I know how much reach the category can deliver?',
        a: 'The buy flow shows a per-category daily impression forecast before you commit budget, so expected reach is visible in advance rather than discovered after launch.',
      },
      {
        q: 'Which creative formats should I prepare?',
        a: 'The standard IAB set: 300×250 medium rectangle, 728×90 leaderboard, 300×600 half page, 320×100 mobile banner, and 980×120 billboard. The 300×250 and 320×100 sizes carry most in-content placements on recipe sites.',
      },
    ],
  },
  'tech-finance-blog-monetization-guide': {
    slug: 'tech-finance-blog-monetization-guide',
    category: 'Category Playbooks',
    title: 'Monetization for Tech & Finance Blogs: Direct Category Placements',
    subtitle:
      'Maximizing ad revenue for business, fintech, and developer blogs with high-value category advertisers.',
    description:
      'Discover how tech and business publishers monetize decision-maker audiences with flat-CPM category placements.',
    date: 'August 2026',
    datePublished: '2026-08-01',
    sections: [
      {
        h2: 'Reaching Decision Makers in Tech & Business',
        p: 'Tech, SaaS, and financial blogs attract audiences that are hard to reach anywhere else: software developers evaluating tools, founders comparing services, professionals researching decisions their companies will act on. The content earns trust precisely because it is specialist and independent.\n\nThose readers also demand clean, professional site design — no intrusive popups, no spammy ad clutter, no tracking that a technical audience will notice immediately and resent permanently. Monetizing this audience means monetizing without breaking the very credibility that attracted it.',
      },
      {
        h2: 'Why Clean Ad Experience Matters More Here',
        p: 'A technical audience is the least forgiving audience on the web: they run blockers, they inspect network tabs, and they notice when a page ships a megabyte of ad tech. A finance readership brings a different sensitivity — trust and discretion are the entire brand of a site people consult about money.\n\nFor both, the traditional yield-wrapper approach is a poor fit. A single sub-5KB embed with zero cookies and no cross-site tracking is not just a performance choice; for these verticals it is the difference between advertising that coexists with the site’s credibility and advertising that spends it.',
      },
      {
        h2: 'Flat-CPM Value for B2B Advertisers',
        p: 'B2B SaaS companies and financial services want targeted reach without the programmatic markup chain. Birtingur’s [Tech & Innovation](/en/categories/tech) and [Business & Finance](/en/categories/finance) categories deliver direct placement across verified niche blogs at the network-wide flat 550 kr. CPM — the same public price as every category, with no premium-vertical surcharge.\n\nA category buy is one campaign: pick the category, set the budget, review the daily impression forecast shown in the buy flow, and launch. Impressions count only after IAB viewability, and hourly statistics let you follow delivery from the first hour. Agent-operated buying over MCP is also available, with hard guardrails, described in our [developer and agent guide](/en/guides/mcp-ai-agent-advertising).',
      },
      {
        h2: 'For Publishers: Monetization Without Compromising Performance',
        p: 'With lightweight, size-budgeted script snippets and zero third-party tracking, tech and finance blogs preserve their performance metrics while generating consistent monthly ad revenue. The embed reserves slot dimensions before ads render, so Core Web Vitals stay intact — and for React or Next.js sites, a typed component is available through the MCP tooling instead of the script.\n\nThe deal is the network standard: 80% of net revenue to the creator, monthly bank-transfer payouts from 5.000 kr., statistics updated hourly, and no arbitrary traffic gates for quality sites. A developer-blog audience of two thousand engaged readers is exactly the long-tail inventory category campaigns want.',
      },
      {
        h2: 'Getting Started as a Tech or Finance Publisher',
        p: 'The path is short: register your site, declare its categories — Tech & Innovation, Business & Finance, or both where genuinely relevant — and embed a slot with the script or the React component. Content policy controls let you decide what may appear on your pages, and slot statistics are available from the dashboard or via MCP tooling.\n\nThe network is pre-launch with an early-access waitlist for creators and advertisers alike. If your blog serves developers, founders, or finance professionals, [join the waitlist](/en#waitlist-section) — this is inventory the category model was designed around.',
      },
    ],
    faqs: [
      {
        q: 'Do tech and finance placements cost advertisers more?',
        a: 'No. The flat 550 kr. CPM is identical in every category — there are no premium verticals. What differs is the audience the context delivers, not the price.',
      },
      {
        q: 'Can publishers control which ads appear on their site?',
        a: 'Yes — publishers set a content policy for their sites, and slots render a configured fallback (house ad or transparent placeholder) when nothing eligible fills.',
      },
      {
        q: 'Does the embed affect Core Web Vitals?',
        a: 'It is designed not to: a single script under 5KB, asynchronous loading, and slot dimensions reserved before the ad renders — no layout shift, no render blocking.',
      },
      {
        q: 'Is there special tooling for developer publishers?',
        a: 'Yes. Via the MCP server (mcp.birtingur.app), a publisher API key gives access to register_publisher, create_slot, get_react_component, get_stats, and more — so a coding agent can wire up monetization directly in your codebase.',
      },
    ],
  },
};

function RelatedGuides({ current }: { current: ArticleMeta }) {
  const all = Object.values(ARTICLES).filter((a) => a.slug !== current.slug);
  const sameCategory = all.filter((a) => a.category === current.category);
  const others = all.filter((a) => a.category !== current.category);
  const related = [...sameCategory, ...others].slice(0, 3);

  return (
    <div className="mt-12 mb-16">
      <h2 className="text-xl font-black text-slate-900 mb-6">Related Guides</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {related.map((a) => (
          <Link
            key={a.slug}
            to={`/en/guides/${a.slug}`}
            className="group bg-white rounded-2xl border border-slate-200/80 hover:border-primary/40 hover:shadow-lg transition p-5 flex flex-col"
          >
            <span className="text-[11px] font-bold text-slate-400 mb-2">{a.category}</span>
            <span className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors leading-snug line-clamp-3">
              {a.title}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-primary mt-auto pt-3">
              Read Guide
              <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** JSON-LD rendered inline in the body so it survives prerendering for non-JS crawlers. */
function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

export default function EnglishGuidePage() {
  const { slug } = useParams<{ slug: string }>();
  const article = slug ? ARTICLES[slug] : null;

  useEffect(() => {
    if (article && slug) {
      updateSEO(article.title, article.description, `/en/guides/${slug}`);
      window.scrollTo({ top: 0 });
    }
  }, [article, slug]);

  const handleShare = () => {
    if (navigator.share && article) {
      navigator
        .share({
          title: article.title,
          text: article.description,
          url: window.location.href,
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  };

  if (!article) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Guide Not Found</h1>
          <p className="text-slate-600 mb-6 text-sm">
            The guide article you are looking for does not exist or has been moved.
          </p>
          <Link
            to="/en/guides"
            className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-primary-800 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Browse All Guides
          </Link>
        </div>
      </div>
    );
  }

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    datePublished: article.datePublished,
    dateModified: article.dateModified ?? article.datePublished,
    author: {
      '@type': 'Organization',
      name: 'Birtingur Network',
      url: 'https://www.birtingur.app/en',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Birtingur',
      url: 'https://www.birtingur.app/en',
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://www.birtingur.app/en/guides/${article.slug}`,
    },
  };

  const faqSchema = article.faqs?.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: article.faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: plainText(f.a) },
        })),
      }
    : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased overflow-x-hidden selection:bg-primary selection:text-white">
      <EnglishHeader />
      <JsonLd data={articleSchema} />
      {faqSchema && <JsonLd data={faqSchema} />}

      <main className="grow pt-28 pb-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Back Link */}
          <Link
            to="/en/guides"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition mb-8 group"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            Back to Guides Catalog
          </Link>

          {/* Article Header */}
          <header className="mb-10">
            <div className="flex items-center justify-between gap-4 mb-4 text-xs font-semibold text-slate-400">
              <span className="bg-slate-100 text-slate-650 px-2.5 py-1 rounded-lg">
                {article.category}
              </span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{articleReadTime(article)}</span>
                </div>
                <span>•</span>
                <span>{article.date}</span>
              </div>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight mb-6">
              {article.title}
            </h1>
            <p className="text-lg text-slate-650 font-medium leading-relaxed border-l-4 border-primary pl-4 py-1 mb-8">
              {article.subtitle}
            </p>
          </header>

          {/* Article Sections */}
          <div className="prose prose-slate max-w-none text-slate-700 leading-relaxed space-y-6">
            {article.sections.map((sec) => (
              <div key={sec.h2} className="space-y-3">
                <h2 className="text-2xl font-black text-slate-900 pt-4 pb-1">{sec.h2}</h2>
                {renderRichText(
                  sec.p,
                  sec.h2,
                  'text-base sm:text-[17px] text-slate-650 leading-relaxed',
                )}
              </div>
            ))}
          </div>

          {/* FAQ */}
          {article.faqs && article.faqs.length > 0 && (
            <div className="mt-14">
              <h2 className="text-2xl font-black text-slate-900 mb-6">
                Frequently Asked Questions
              </h2>
              <div className="space-y-4">
                {article.faqs.map((f) => (
                  <div key={f.q} className="bg-white rounded-2xl border border-slate-200/80 p-6">
                    <h3 className="text-base font-bold text-slate-900 mb-2">{f.q}</h3>
                    {renderRichText(f.a, f.q, 'text-sm text-slate-650 leading-relaxed')}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Share Action */}
          <div className="flex items-center justify-between pt-8 border-t border-slate-200 mt-12">
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer bg-transparent border-0 p-0"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share Article
            </button>
          </div>

          {/* Related Guides */}
          <RelatedGuides current={article} />

          {/* Call To Action Box */}
          <div className="bg-primary text-white rounded-2xl p-8 sm:p-10 shadow-xl shadow-primary/10 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none" />
            <h3 className="text-2xl font-black mb-3">Ready for Privacy-First Display Ads?</h3>
            <p className="text-white/80 text-sm max-w-lg mx-auto mb-6 leading-relaxed">
              Join creators and brands testing Birtingur’s cookie-free category display network.
            </p>
            <Link
              to="/en#waitlist-section"
              className="inline-flex items-center gap-2 bg-white text-primary px-6 py-3 rounded-xl text-xs font-black hover:bg-slate-50 transition shadow-sm"
            >
              Join Early Access Waitlist
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </main>

      <EnglishFooter />
    </div>
  );
}
