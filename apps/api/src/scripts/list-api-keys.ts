import { db } from '../lib/firebase.js';

async function main() {
  console.log('Querying api_keys for owner email...');
  const snapshot = await db
    .collection('api_keys')
    .where('ownerEmail', '==', 'thorarinnhjalmarsson@gmail.com')
    .get();
  if (snapshot.empty) {
    console.log('No API keys found for owner email');
  } else {
    for (const doc of snapshot.docs) {
      console.log(`Key Found: ID=${doc.id}, Scope=${doc.data().scope}, Key=${doc.data().key}`);
    }
  }
}

main().catch(console.error);
