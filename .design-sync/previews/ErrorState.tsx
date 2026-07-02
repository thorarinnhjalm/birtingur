import { ErrorState } from '@ada/dashboard';

// Ported from advertiser CampaignDetail — load failure with retry.
export const WithRetry = () => (
  <ErrorState
    message="Ekki tókst að hlaða herferð. Hún gæti hafa verið fjarlægð eða þú hefur ekki aðgang að henni."
    onRetry={() => {}}
  />
);

export const MessageOnly = () => (
  <ErrorState message="Ekki tókst að sækja tölfræði fyrir auglýsingaplássið. Reyndu aftur síðar." />
);
