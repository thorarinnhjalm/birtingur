export const COLLECTIONS = {
  publishers: 'publishers',
  slots: 'slots',
  advertisers: 'advertisers',
  creatives: 'creatives',
  campaigns: 'campaigns',
  ledger: 'ledger',
  payouts: 'payouts',
  stats: 'stats',
  notifications: 'notifications',
  generatedPreviews: 'generated_previews',
  waitlist: 'waitlist',
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
