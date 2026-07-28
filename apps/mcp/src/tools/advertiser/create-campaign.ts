import { createHash } from 'crypto';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AD_CATEGORY_SLUGS, GEO_REGIONS } from '@ada/shared';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({
  categories: z
    .array(z.enum(AD_CATEGORY_SLUGS as [string, ...string[]]))
    .min(1)
    .describe(
      'Content categories to target, e.g. ["matur"]. Use list_categories first to check inventory per category.',
    ),
  total_isk: z
    .number()
    .int()
    .positive()
    .describe(
      'Total campaign budget in integer ISK (no decimals — ISK has none). This amount is committed from the wallet immediately, even if the campaign ends up pending owner approval.',
    ),
  creative_ids: z
    .array(z.string())
    .min(1)
    .describe(
      'IDs of already-approved creatives to run (see list_creatives). Creative generation/upload is not available over MCP.',
    ),
  starts_at: z.string().describe('ISO 8601 start date/time, e.g. "2026-08-01T00:00:00Z".'),
  ends_at: z.string().describe('ISO 8601 end date/time, must be after starts_at.'),
  name: z.string().max(120).optional().describe('Optional human-readable campaign name.'),
  geo_regions: z
    .array(z.enum(GEO_REGIONS))
    .optional()
    .describe('Optional geographic narrowing on top of category targeting.'),
  idempotency_key: z
    .string()
    .optional()
    .describe(
      "Optional caller-supplied idempotency key so a retried call is safe — replaying the same key returns the original campaign instead of buying twice. If omitted, one is derived deterministically from every other input (name, categories, budget, creatives, schedule, geo_regions) plus this API key's id. Identical repeat purchases collapse by design: calling this tool twice with the exact same inputs returns the SAME campaign both times, not two purchases. If you actually want a distinct second purchase with otherwise-identical inputs, pass an explicit idempotency_key (e.g. a random UUID) here to force it.",
    ),
});

interface CreateCampaignResponse {
  id: string;
  status: string;
  pendingReason?: string;
  idempotent?: boolean;
  budget: { totalIsk: number; remainingIsk: number };
}

/**
 * Extracts the key id portion (`ak_` + 16 hex chars) from a full API key
 * (`${id}_${secret}`, see issueApiKey in apps/api/src/services/api-keys.ts).
 * Falls back to the whole string if it doesn't match, which just means the
 * derived idempotency key is scoped to that literal string instead — still
 * safe, just not as tidy.
 */
export function extractApiKeyId(apiKey: string): string {
  return apiKey.match(/^ak_[a-f0-9]{16}/)?.[0] ?? apiKey;
}

/**
 * Derives a stable idempotency key from every purchase-relevant input,
 * INCLUDING `name` and (sorted, for order-independence) `geo_regions`, plus
 * the calling API key's id — omitting any of these previously meant two
 * genuinely different purchases (e.g. same categories/budget/creatives/
 * schedule but a different name, or narrowed to a different region) could
 * collapse into "the same" request and only one would ever be created. This
 * is deliberate collapsing-by-design for an EXACT repeat, not a bug: an
 * agent that calls create_campaign twice with identical inputs gets the same
 * campaign back both times (see the tool description below) — to force two
 * distinct purchases with otherwise-identical inputs, pass an explicit
 * `idempotency_key`. Scoping by key id also keeps two different keys under
 * the same advertiser from ever colliding on the same derived key (see the
 * matching server-side scoping in services/campaigns.ts createCampaign).
 */
export function deriveIdempotencyKey(input: z.infer<typeof Input>, apiKeyId: string): string {
  const basis = JSON.stringify({
    name: input.name ?? null,
    categories: input.categories,
    total_isk: input.total_isk,
    creative_ids: input.creative_ids,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    geo_regions: input.geo_regions ? [...input.geo_regions].sort() : null,
    api_key_id: apiKeyId,
  });
  return createHash('sha256').update(basis).digest('hex').slice(0, 32);
}

export function registerCreateCampaign(server: McpServer, apiKey: string) {
  server.registerTool(
    'create_campaign',
    {
      title: 'Buy a category campaign',
      description:
        "Creates a category-targeted campaign, spending from the advertiser's wallet. Guardrails: (1) this API key must have purchase capability enabled by its owner, or the call is rejected with PURCHASE_NOT_ENABLED; (2) this budget plus the key's month-to-date agent spend must not exceed its monthly cap, or the call is rejected with MONTHLY_CAP_EXCEEDED (see get_wallet to check headroom first); (3) a campaign whose budget exceeds the key's auto-approve limit is created in pending_approval and needs the owner's approval in the dashboard before it serves — funds are committed immediately either way, but nothing is spent until it actually goes live. There is no tool to top up the wallet, increase a budget, or refund a campaign over MCP — those stay dashboard-only. The response states plainly whether the campaign is live or awaiting approval, and why.",
      inputSchema: Input.shape,
    },
    async (input) => {
      const idempotencyKey =
        input.idempotency_key ?? deriveIdempotencyKey(input, extractApiKeyId(apiKey));
      const r = await apiCall<CreateCampaignResponse>('/v1/campaigns', {
        method: 'POST',
        apiKey,
        idempotencyKey,
        body: {
          name: input.name,
          categories: input.categories,
          geoRegions: input.geo_regions,
          creativeIds: input.creative_ids,
          schedule: { startsAt: input.starts_at, endsAt: input.ends_at },
          budget: { mode: 'cpm_capped', totalIsk: input.total_isk },
        },
      });

      let summary: string;
      if (r.idempotent) {
        summary = `Replay detected (same idempotency key as a previous call) — returning the existing campaign ${r.id}. No new purchase was made.`;
      } else if (r.status === 'pending_approval' && r.pendingReason === 'agent_purchase') {
        summary = `Campaign ${r.id} was created but is AWAITING OWNER APPROVAL: its budget (${r.budget.totalIsk} ISK) exceeds this key's auto-approve limit. Funds are committed but it will not serve until the owner approves it in the dashboard.`;
      } else if (r.status === 'pending_approval') {
        summary = `Campaign ${r.id} was created but is pending creative review (not the agent-purchase limit) — it will go live automatically once its creatives are approved.`;
      } else if (r.status === 'active') {
        summary = `Campaign ${r.id} is LIVE and serving now.`;
      } else {
        summary = `Campaign ${r.id} was created with status "${r.status}".`;
      }

      return {
        content: [
          { type: 'text' as const, text: summary },
          { type: 'text' as const, text: JSON.stringify(r) },
        ],
      };
    },
  );
}
