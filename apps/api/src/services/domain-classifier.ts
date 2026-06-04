import { db } from '../lib/firebase.js';

const DEFAULT_CATEGORIES = [
  'news',
  'sports',
  'tech',
  'finance',
  'lifestyle',
  'entertainment',
  'gambling',
  'other',
];

interface ClassificationResult {
  category: string;
  confidence: number;
  title: string;
  description: string;
  keywords: string;
}

/**
 * Fetch the allowed content categories from Firestore configuration metadata.
 */
export async function getAllowedCategories(): Promise<string[]> {
  try {
    const docSnap = await db.doc('config/metadata').get();
    if (docSnap.exists) {
      const data = docSnap.data();
      if (Array.isArray(data?.categories) && data.categories.length > 0) {
        return data.categories.map((c) => String(c).toLowerCase());
      }
    }
  } catch (error) {
    console.warn('Failed to fetch categories from Firestore config, using defaults:', error);
  }
  return DEFAULT_CATEGORIES;
}

/**
 * Simple local keyword matcher for Icelandic and English terms to classify a website.
 */
function classifyLocal(
  text: string,
  allowedCategories: string[],
): { category: string; confidence: number } {
  const normalized = text.toLowerCase();

  const rules: Array<{ category: string; keywords: string[] }> = [
    {
      category: 'sports',
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
      ],
    },
    {
      category: 'finance',
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
      ],
    },
    {
      category: 'tech',
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
      ],
    },
    {
      category: 'lifestyle',
      keywords: [
        'lífstíll',
        'lifstill',
        'matur',
        'uppskriftir',
        'tíska',
        'tiska',
        'ferðalög',
        'ferdalog',
        'heimili',
        'hönnun',
        'honnun',
        'lifestyle',
        'fashion',
        'cooking',
        'recipes',
        'travel',
      ],
    },
    {
      category: 'entertainment',
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
      ],
    },
    {
      category: 'gambling',
      keywords: [
        'veðmál',
        'vedmal',
        'casino',
        'póker',
        'poker',
        'veðja',
        'vedja',
        'fjárhættuspil',
        'fjarhaettuspil',
        'gambling',
        'betting',
      ],
    },
    {
      category: 'news',
      keywords: [
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
  ];

  for (const rule of rules) {
    if (allowedCategories.includes(rule.category)) {
      const matchCount = rule.keywords.filter((kw) => normalized.includes(kw)).length;
      if (matchCount > 0) {
        return {
          category: rule.category,
          confidence: Math.min(0.5 + matchCount * 0.1, 0.9),
        };
      }
    }
  }

  const fallbackCategory = allowedCategories.includes('other')
    ? 'other'
    : allowedCategories[0] || 'other';
  return {
    category: fallbackCategory,
    confidence: 0.4,
  };
}

/**
 * Scrapes a domain's homepage and classifies its category using Gemini or a rule-based fallback.
 */
export async function scrapeAndClassifyDomain(domain: string): Promise<ClassificationResult> {
  const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/i, '').toLowerCase();
  let html = '';

  // Try https first, then http
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
      // Continue to next URL fallback
    }
  }

  // If scraping failed completely, return blank details with local fallback classification of domain string
  let title = '';
  let description = '';
  let keywords = '';

  if (html) {
    // Regex parsing to prevent dependencies
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

  const allowedCategories = await getAllowedCategories();
  const searchString = `${cleanDomain} ${title} ${description} ${keywords}`;

  const geminiKey = process.env.GEMINI_API_KEY;

  if (geminiKey && html) {
    try {
      const prompt = `Analyze this website metadata and categorize it into exactly one of these allowed categories: ${allowedCategories.join(', ')}.

Website Details:
Domain: ${cleanDomain}
Title: ${title}
Description: ${description}
Keywords: ${keywords}

Respond with a JSON object containing 'category' (the selected category) and 'confidence' (a float between 0.0 and 1.0 representing your confidence).`;

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
                  category: {
                    type: 'STRING',
                    description: 'Select the best category from the allowed categories list.',
                  },
                  confidence: {
                    type: 'NUMBER',
                    description: 'Confidence score between 0.0 and 1.0.',
                  },
                },
                required: ['category', 'confidence'],
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
          const category = String(parsed.category).toLowerCase();
          if (allowedCategories.includes(category)) {
            return {
              category,
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

  // Fallback to rules-based classifier
  const classification = classifyLocal(searchString, allowedCategories);
  return {
    category: classification.category,
    confidence: classification.confidence,
    title,
    description,
    keywords,
  };
}
