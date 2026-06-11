import type { AutoScanner, ScanInput, ScanReturn } from './index.js';
import { StubAutoScanner } from './stub.js';
import { SENSITIVE_AD_CATEGORY_SLUGS } from '@ada/shared';

/**
 * Gemini Vision–powered creative scanner.
 * Falls back to StubAutoScanner if GEMINI_API_KEY is not set.
 */
export class GeminiAutoScanner implements AutoScanner {
  private readonly fallback = new StubAutoScanner();

  async scan(input: ScanInput): Promise<ScanReturn> {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return this.fallback.scan(input);
    }

    try {
      // Fetch the image and convert to base64
      const imageResponse = await fetch(input.imageUrl, {
        signal: globalThis.AbortSignal.timeout(8000),
      });
      if (!imageResponse.ok) {
        console.warn('GeminiAutoScanner: Failed to fetch image, using fallback');
        return this.fallback.scan(input);
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const base64Image = Buffer.from(imageBuffer).toString('base64');
      const contentType = imageResponse.headers.get('content-type') || 'image/png';

      const prompt = `You are a content moderator for an Icelandic ad platform called Birtingur.
Analyze this advertisement image and its click destination URL.

Click URL: ${input.clickUrl}
${input.ocrTextHint ? `OCR text found on image: ${input.ocrTextHint}` : ''}

Evaluate for:
1. NSFW content (nudity, violence, gore)
2. Prohibited content (gambling, drugs, weapons, hate speech)
3. Misleading/deceptive claims
4. Appropriate category classification
5. Sensitive-category flags. Return every flag that applies from exactly this list
   (return [] if none apply):
   afengi (alcohol), vedmal (gambling/betting/lotteries), stefnumot (dating services),
   rafmyntir (crypto/high-risk investments), megrun_utlit (weight loss/cosmetic procedures),
   politik (politics), trumal (religion), tobak_veip (tobacco/vaping),
   kynlifstengt (sexually suggestive content)

Respond with a JSON object.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: contentType,
                      data: base64Image,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  nsfwScore: {
                    type: 'NUMBER',
                    description: 'NSFW probability score between 0.0 and 1.0',
                  },
                  blockedTerms: {
                    type: 'ARRAY',
                    items: { type: 'STRING' },
                    description: 'List of prohibited terms or content types found',
                  },
                  category: {
                    type: 'STRING',
                    description:
                      'Ad category: retail, food, tech, finance, travel, health, entertainment, other',
                  },
                  confidence: {
                    type: 'NUMBER',
                    description: 'Classification confidence between 0.0 and 1.0',
                  },
                  sensitiveCategories: {
                    type: 'ARRAY',
                    items: { type: 'STRING' },
                    description:
                      'Sensitive flags that apply, from: afengi, vedmal, stefnumot, rafmyntir, megrun_utlit, politik, trumal, tobak_veip, kynlifstengt. Empty array if none.',
                  },
                },
                required: [
                  'nsfwScore',
                  'blockedTerms',
                  'category',
                  'confidence',
                  'sensitiveCategories',
                ],
              },
            },
          }),
        },
      );

      if (!response.ok) {
        console.warn('GeminiAutoScanner: Gemini API error, using fallback');
        return this.fallback.scan(input);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        console.warn('GeminiAutoScanner: Empty Gemini response, using fallback');
        return this.fallback.scan(input);
      }

      const parsed = JSON.parse(text);
      const nsfwScore = Number(parsed.nsfwScore) || 0;
      const blockedTerms: string[] = Array.isArray(parsed.blockedTerms) ? parsed.blockedTerms : [];
      const category = String(parsed.category || 'unknown');
      const confidence = Number(parsed.confidence) || 0.5;
      const sensitiveCategories: string[] = Array.isArray(parsed.sensitiveCategories)
        ? parsed.sensitiveCategories.filter((s: unknown) =>
            SENSITIVE_AD_CATEGORY_SLUGS.includes(String(s)),
          )
        : [];

      let outcome: 'auto_approved' | 'flagged_for_manual' | 'auto_rejected';
      if (nsfwScore > 0.7 || blockedTerms.length > 0) {
        outcome = 'auto_rejected';
      } else if (nsfwScore > 0.3) {
        outcome = 'flagged_for_manual';
      } else {
        outcome = 'auto_approved';
      }

      return {
        outcome,
        scanResult: { nsfwScore, blockedTerms, category, confidence, sensitiveCategories },
      };
    } catch (error) {
      console.warn('GeminiAutoScanner: Scan failed, using fallback:', error);
      return this.fallback.scan(input);
    }
  }
}
