import { refreshAllActiveSlotCaches } from '../services/cache-refresh.js';

async function main() {
  console.log('Starting force refresh of active slot caches against live production database...');
  const count = await refreshAllActiveSlotCaches();
  console.log(`Successfully refreshed ${count} slot caches in Upstash Redis.`);
}

main().catch((err) => {
  console.error('Failed to refresh caches:', err);
  process.exit(1);
});
