import type { GeneratedCopyVariant } from '@ada/shared';
import type { CreativeGenerator } from './gemini.js';
import type { SiteContext } from './index.js';
import { ruleBasedCopyVariants } from './index.js';

/**
 * Deterministic test double — never touches the network, unlike
 * GeminiCreativeGenerator (which, keyless, already degrades to the same
 * rule-based copy + null background, but still lives next to real fetch
 * calls). Mirrors the StubAutoScanner / StubTeyaClient pattern so unit tests
 * that want to exercise the pipeline without depending on env state (e.g.
 * accidentally having GEMINI_API_KEY set locally) can inject this instead.
 */
export class StubCreativeGenerator implements CreativeGenerator {
  async generateCopy(ctx: SiteContext, n: number): Promise<GeneratedCopyVariant[]> {
    return ruleBasedCopyVariants(ctx, n);
  }

  async generateBackground(_ctx: SiteContext, _variantIndex: number): Promise<Buffer | null> {
    return null;
  }
}
