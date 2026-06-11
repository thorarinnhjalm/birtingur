import { AD_CATEGORY_SLUGS, SENSITIVE_AD_CATEGORIES } from '@ada/shared';

export interface ClassificationResult {
  categories: string[];
  category?: string; // Backward compatibility fallback (categories[0])
  confidence: number;
  title: string;
  description: string;
  keywords: string;
}

/** Blockable creative content categories shown to publishers (brand safety). */
export async function getAllowedCategories(): Promise<Array<{ slug: string; label: string }>> {
  return SENSITIVE_AD_CATEGORIES.map((c) => ({ slug: c.slug, label: c.label }));
}

interface LocalRule {
  slug: string;
  keywords: string[];
}

const LOCAL_RULES: LocalRule[] = [
  {
    slug: 'matur',
    keywords: [
      'matur',
      'uppskriftir',
      'uppskrift',
      'elda',
      'bakstur',
      'eldamennska',
      'recipe',
      'food',
      'cooking',
      'recipes',
      'baking',
      'veitingastaðir',
      'veitingastadur',
      'kaffihús',
      'kaffihus',
      'matseðill',
    ],
  },
  {
    slug: 'ferdalog',
    keywords: [
      'ferðalög',
      'ferdalog',
      'ferðast',
      'flug',
      'hótel',
      'travel',
      'hotel',
      'flight',
      'tourism',
      'ferðaþjónusta',
      'tjaldsvæði',
      'camping',
      'vacation',
    ],
  },
  {
    slug: 'tiska_fegurd',
    keywords: [
      'tíska',
      'tiska',
      'snyrtivörur',
      'makeup',
      'fashion',
      'snyrting',
      'hár',
      'har',
      'föt',
      'fot',
      'klæðnaður',
      'fegurð',
      'beauty',
      'cosmetics',
    ],
  },
  {
    slug: 'taekni',
    keywords: [
      'tækni',
      'taekni',
      'tölvur',
      'tolvur',
      'símar',
      'simar',
      'hugbúnaður',
      'hugbunadur',
      'vefhönnun',
      'vefhonnun',
      'forritun',
      'tech',
      'technology',
      'computers',
      'software',
      'coding',
      'forrit',
      'vefur',
      'app',
    ],
  },
  {
    slug: 'heilsa_likamsraekt',
    keywords: [
      'heilsa',
      'líkamsrækt',
      'likamsraekt',
      'fitness',
      'heilsurækt',
      'líkamsræktarstöð',
      'ræktin',
      'raktin',
      'heilbrigði',
      'health',
      'workout',
      'gym',
    ],
  },
  {
    slug: 'fjarmal_vidskipti',
    keywords: [
      'fjármál',
      'fjarmal',
      'viðskipti',
      'vidskipti',
      'hlutabréf',
      'hlutabref',
      'banki',
      'krónan',
      'kronan',
      'vísitala',
      'visitala',
      'aurar',
      'peningar',
      'finance',
      'business',
      'economy',
      'stocks',
      'verðbréf',
      'afkoma',
    ],
  },
  {
    slug: 'ithrottir',
    keywords: [
      'íþróttir',
      'fótbolti',
      'fotbolti',
      'handbolti',
      'körfubolti',
      'korfubolti',
      'skák',
      'skak',
      'golf',
      'knattspyrna',
      'mót',
      'sports',
      'football',
      'soccer',
      'basketball',
      'deildin',
    ],
  },
  {
    slug: 'born_foreldrar',
    keywords: [
      'börn',
      'foreldrar',
      'krakkar',
      'leikskóli',
      'skóli',
      'barn',
      'kids',
      'children',
      'parenting',
      'uppeldi',
      'fjölskylda',
      'barnavörur',
    ],
  },
  {
    slug: 'bilar',
    keywords: [
      'bílar',
      'bíll',
      'bill',
      'bifreið',
      'bifreiðar',
      'tæki',
      'mótor',
      'cars',
      'car',
      'auto',
      'ökutæki',
      'dekk',
      'verkstæði',
    ],
  },
  {
    slug: 'heimili_honnun',
    keywords: [
      'heimili',
      'hönnun',
      'honnun',
      'innbú',
      'húsgögn',
      'husgogn',
      'home',
      'design',
      'arkitektúr',
      'garður',
      'gardur',
      'skreytingar',
      'fasteignir',
      'fasteign',
    ],
  },
  {
    slug: 'afthreying_menning',
    keywords: [
      'afþreying',
      'afpreying',
      'leikir',
      'tölvuleikir',
      'tolvuleikir',
      'bíó',
      'bio',
      'kvikmyndir',
      'tónlist',
      'tonlist',
      'skemmtun',
      'entertainment',
      'gaming',
      'movies',
      'music',
      'menning',
      'listir',
      'bækur',
      'baekur',
      'leikhús',
      'leikhus',
      'fréttir',
      'frettir',
      'blað',
      'blad',
      'tíðindi',
      'tidindi',
      'dagblað',
      'dagblad',
      'news',
      'daily',
      'journal',
      'stundin',
      'heimildin',
    ],
  },
  {
    slug: 'dyr_gaeludyr',
    keywords: [
      'dýr',
      'gæludyr',
      'hundur',
      'hundar',
      'köttur',
      'kettir',
      'hestur',
      'hestar',
      'dýralæknir',
      'dyralaeknir',
      'pets',
      'dogs',
      'cats',
      'animals',
    ],
  },
];

/**
 * Simple local keyword matcher for Icelandic and English terms to classify a website.
 */
function classifyLocal(text: string): { categories: string[]; confidence: number } {
  const normalized = text.toLowerCase();
  const hits: Array<{ slug: string; count: number }> = [];

  for (const rule of LOCAL_RULES) {
    const matchCount = rule.keywords.filter((kw) => normalized.includes(kw)).length;
    if (matchCount > 0) {
      hits.push({ slug: rule.slug, count: matchCount });
    }
  }

  hits.sort((a, b) => b.count - a.count);

  if (hits.length === 0) {
    return {
      categories: ['afthreying_menning'],
      confidence: 0.4,
    };
  }

  const topHits = hits.slice(0, 3);
  const categories = topHits.map((h) => h.slug);
  const maxCount = topHits[0]?.count ?? 0;
  const confidence = Math.min(0.5 + maxCount * 0.1, 0.9);

  return { categories, confidence };
}

/**
 * Scrapes a domain's homepage and classifies its category using Gemini or a rule-based fallback.
 */
export async function scrapeAndClassifyDomain(domain: string): Promise<ClassificationResult> {
  const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/i, '').toLowerCase();
  let html = '';

  const urls = [`https://${cleanDomain}`, `http://${cleanDomain}`];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 ADA-AdPlatform-Scraper/1.0',
        },
        signal: globalThis.AbortSignal.timeout(6000),
      });
      if (res.ok) {
        html = await res.text();
        break;
      }
    } catch {
      // Continue
    }
  }

  let title = '';
  let description = '';
  let keywords = '';

  if (html) {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    title = titleMatch?.[1] ? titleMatch[1].trim() : '';

    const descMatch =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) ||
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    description = descMatch?.[1] ? descMatch[1].trim() : '';

    const kwMatch =
      html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']keywords["']/i);
    keywords = kwMatch?.[1] ? kwMatch[1].trim() : '';
  }

  const searchString = `${cleanDomain} ${title} ${description} ${keywords}`;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (geminiKey && html) {
    try {
      const prompt = `Analyze this website metadata and categorize it into 1 to 3 of these allowed categories: ${AD_CATEGORY_SLUGS.join(
        ', ',
      )}. Choose only categories that are highly relevant to the website's main content. Do not list irrelevant categories.

Website Details:
Domain: ${cleanDomain}
Title: ${title}
Description: ${description}
Keywords: ${keywords}

Respond with a JSON object containing 'categories' (an array of 1 to 3 selected category slug strings) and 'confidence' (a float between 0.0 and 1.0 representing your confidence).`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  categories: {
                    type: 'ARRAY',
                    items: {
                      type: 'STRING',
                    },
                    description:
                      'List of 1 to 3 best matching categories from the allowed categories list.',
                  },
                  confidence: {
                    type: 'NUMBER',
                    description: 'Confidence score between 0.0 and 1.0.',
                  },
                },
                required: ['categories', 'confidence'],
              },
            },
          }),
        },
      );

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          const rawCategories = Array.isArray(parsed.categories) ? parsed.categories : [];
          const matchedCategories = rawCategories
            .map((c: any) => String(c).toLowerCase().trim())
            .filter((c: string) => AD_CATEGORY_SLUGS.includes(c));

          if (matchedCategories.length > 0) {
            return {
              categories: matchedCategories,
              category: matchedCategories[0],
              confidence: Number(parsed.confidence) || 0.8,
              title,
              description,
              keywords,
            };
          }
        }
      }
    } catch (error) {
      console.warn('Gemini classification failed, falling back to keyword matcher:', error);
    }
  }

  const classification = classifyLocal(searchString);
  return {
    categories: classification.categories,
    category: classification.categories[0],
    confidence: classification.confidence,
    title,
    description,
    keywords,
  };
}
