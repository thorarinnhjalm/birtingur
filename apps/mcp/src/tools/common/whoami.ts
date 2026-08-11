import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, ApiClientError } from '../../lib/api-client.js';

interface ApiKeyMe {
  email: string;
  admin: boolean;
  apiKeyId?: string;
  scope: 'advertiser' | 'publisher' | 'both';
  purchase: unknown | null;
}

interface PublisherMe {
  id: string;
  domain: string;
  displayName: string;
  categories: string[];
  status: string;
}

interface AdvertiserMe {
  id: string;
  name?: string;
  status?: string;
}

/**
 * Returns 404 as `null` instead of throwing — "no publisher profile yet" is a
 * normal state for a fresh key, and the caller needs the rest of the identity
 * regardless. Anything else (401, 500) still propagates.
 */
async function fetchOptional<T>(path: string, apiKey: string): Promise<T | null> {
  try {
    return await apiCall<T>(path, { apiKey });
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Identity/context probe, registered for every scope.
 *
 * Added after integration feedback: agents were creating ad slots before they
 * knew the `pub_…` id they belonged to, so the id had to be pasted in by hand
 * afterwards. Everything an integrator needs to orient — who the key belongs
 * to, what it may do, which publisher/advertiser profile it resolves to — is
 * one call now, and it should be the first call of any session.
 */
export function registerWhoami(server: McpServer, apiKey: string) {
  server.registerTool(
    'whoami',
    {
      title: 'Hver er ég?',
      description:
        'Skilar auðkenni og heimildum API-lykilsins: netfang, scope, kaupheimildir og — eftir því sem við á — útgefanda-prófílinn (publisherId, lén, flokkar) og auglýsanda-prófílinn. Kallaðu á þetta FYRST í hverri lotu: publisherId þaðan er forsenda þess að vita hvaða vef pláss tilheyra, og næstu skref ráðast af því hvort prófíll er þegar til.',
      inputSchema: {},
    },
    async () => {
      const me = await apiCall<ApiKeyMe>('/v1/api-keys/me', { apiKey });

      const isPublisher = me.scope === 'publisher' || me.scope === 'both';
      const isAdvertiser = me.scope === 'advertiser' || me.scope === 'both';

      const [publisher, advertiser] = await Promise.all([
        isPublisher ? fetchOptional<PublisherMe>('/v1/publishers/me', apiKey) : null,
        isAdvertiser ? fetchOptional<AdvertiserMe>('/v1/advertisers/me', apiKey) : null,
      ]);

      const nextSteps: string[] = [];
      if (isPublisher && !publisher) {
        nextSteps.push(
          'Enginn útgefanda-prófíll er skráður á þennan lykil — kallaðu á register_publisher áður en þú býrð til pláss.',
        );
      }
      if (isPublisher && publisher) {
        nextSteps.push(
          `Útgefandi ${publisher.id} (${publisher.domain}) er skráður. Ný pláss (create_slot) lenda sjálfkrafa á honum; list_my_slots sýnir þau sem eru til.`,
        );
      }
      if (isAdvertiser && !advertiser) {
        nextSteps.push(
          'Enginn auglýsanda-prófíll er skráður á þennan lykil — stofnaðu hann í stjórnborðinu áður en herferð er keypt.',
        );
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                email: me.email,
                scope: me.scope,
                admin: me.admin,
                apiKeyId: me.apiKeyId ?? null,
                purchase: me.purchase,
                publisher,
                advertiser,
                nextSteps,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
