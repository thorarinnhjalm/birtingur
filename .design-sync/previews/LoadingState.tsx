import { LoadingState } from '@ada/dashboard';

// Skeleton shown while dashboard data loads (used across advertiser/publisher pages).
// The component is w-full, so it needs a sized wrapper to be visible in a card.
export const Skeleton = () => (
  <div
    style={{
      width: 520,
      padding: '8px 24px',
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: 12,
    }}
  >
    <LoadingState />
  </div>
);
