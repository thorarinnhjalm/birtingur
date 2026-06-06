import { getRedis } from './lib/redis.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read and parse .env.local manually
const envPath = path.resolve(__dirname, '../../../.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.substring(0, idx).trim();
    let val = trimmed.substring(idx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.substring(1, val.length - 1);
    }
    val = val.replace(/\\n/g, '\n');
    process.env[key] = val;
  }
}

async function run() {
  const redis = getRedis();
  const campaignId = 'cmp_45c42e271a3c618685db8dda';
  const budget = await redis.get(`budget:${campaignId}`);
  const paceLimit = await redis.get(`pace_limit:${campaignId}`);
  const currentPace = await redis.get(`pace:${campaignId}`);

  console.log(`Campaign ${campaignId} state:`);
  console.log('  Budget remaining:', budget);
  console.log('  Pace Limit:', paceLimit);
  console.log('  Current Pace (spent today):', currentPace);
}

run().catch(console.error);
