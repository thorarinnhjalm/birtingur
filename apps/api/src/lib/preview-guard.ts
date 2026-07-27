/**
 * Vercel preview deploys share the production Firestore/Redis (`ada-prod`) unless a
 * preview's env vars are explicitly repointed at a staging project. Money-flow crons
 * (accrue/aggregate/payouts/refresh-cache) must never run against prod data from a
 * preview by accident, so this guard is fail-closed: any `VERCEL_ENV === 'preview'`
 * deploy refuses to run those crons unless `ALLOW_PREVIEW_CRONS=true` is set, which is
 * only safe once the preview's env vars point at an isolated staging Firestore/Redis.
 */
export function previewCronBlockReason(
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (env.VERCEL_ENV !== 'preview') {
    return null;
  }
  if (env.ALLOW_PREVIEW_CRONS === 'true') {
    return null;
  }
  return (
    'Refusing to run money-flow cron on a Vercel preview deploy: previews share the ' +
    'production Firestore/Redis (ada-prod) by default, and this cron mutates money ' +
    "data (wallets, campaign budgets, payouts). If this preview's env vars have been " +
    'pointed at an isolated staging Firestore project and Redis database, set ' +
    'ALLOW_PREVIEW_CRONS=true to opt in.'
  );
}
