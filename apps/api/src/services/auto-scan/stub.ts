import type { AutoScanner, ScanInput, ScanReturn } from './index.js';

const GAMBLING_TERMS = ['casino', 'gambling', 'fjárhættuspil', 'bet365'];

const BLOCKED_TERMS = [
  'casino',
  'gambling',
  'fjárhættuspil',
  'bet365',
  'porn',
  'free money',
  'click here to win',
];
const SUSPICIOUS_URL_PATTERNS = [/bit\.ly/i, /tinyurl/i, /\.tk(\/|$)/i, /click\.tracker/i];

export class StubAutoScanner implements AutoScanner {
  async scan(input: ScanInput): Promise<ScanReturn> {
    const text = (input.ocrTextHint ?? '').toLowerCase();
    const found = BLOCKED_TERMS.filter((t) => text.includes(t));
    const urlSuspicious = SUSPICIOUS_URL_PATTERNS.some((re) => re.test(input.clickUrl));

    if (found.length > 0) {
      return {
        outcome: 'auto_rejected',
        scanResult: {
          nsfwScore: 0,
          blockedTerms: found,
          category: 'unknown',
          confidence: 0.9,
          sensitiveCategories: found.some((t) => GAMBLING_TERMS.includes(t)) ? ['vedmal'] : [],
        },
      };
    }
    if (urlSuspicious) {
      return {
        outcome: 'flagged_for_manual',
        scanResult: {
          nsfwScore: 0.1,
          blockedTerms: [],
          category: 'unknown',
          confidence: 0.5,
          sensitiveCategories: [],
        },
      };
    }
    return {
      outcome: 'auto_approved',
      scanResult: {
        nsfwScore: 0.02,
        blockedTerms: [],
        category: 'retail',
        confidence: 0.95,
        sensitiveCategories: [],
      },
    };
  }
}
