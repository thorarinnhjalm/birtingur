import { Button, EmptyState } from '@ada/dashboard';
import { Megaphone, Plus } from 'lucide-react';

// Ported from the advertiser CampaignList empty state — the app's canonical use.
export const NoCampaigns = () => (
  <EmptyState
    icon={<Megaphone size={44} />}
    title="Engar herferðir fundust"
    description="Þú hefur ekki stofnað neina auglýsingaherferð ennþá. Stofnaðu nýja herferð til að birta á íslenskum vefjum."
    action={
      <Button>
        <Plus size={16} className="mr-1" />
        Stofna herferð
      </Button>
    }
  />
);

export const TitleOnly = () => <EmptyState title="Engin gögn ennþá" />;
