import { COLLECTIONS } from '@ada/shared/firestore';
import { DEFAULT_PLATFORM_FEE_PERCENT } from '@ada/shared';
import { db } from '../lib/firebase.js';
import { appendLedger, sumByParty } from './ledger.js';
import { AppError } from '../lib/errors.js';
import { getAdvertiserById } from './advertisers.js';
import { createNotification } from './notifications.js';

export interface Wallet {
  advertiserId: string;
  balanceIsk: number;
}

export async function getWallet(advertiserId: string): Promise<Wallet> {
  const balanceIsk = await sumByParty({ type: 'advertiser', id: advertiserId });
  return { advertiserId, balanceIsk };
}

async function syncMirror(advertiserId: string): Promise<void> {
  const balance = await sumByParty({ type: 'advertiser', id: advertiserId });
  await db
    .collection(COLLECTIONS.advertisers)
    .doc(advertiserId)
    .update({ walletBalanceIsk: balance });
}

export async function topUp(
  advertiserId: string,
  amountIsk: number,
  teyaTxnId: string,
): Promise<void> {
  if (amountIsk <= 0) {
    throw new AppError(400, 'amountIsk must be positive', 'BAD_REQUEST');
  }

  // Idempotency: if a ledger entry with this relatedId exists, skip
  const existing = await db
    .collection(COLLECTIONS.ledger)
    .where('relatedId', '==', teyaTxnId)
    .where('type', '==', 'topup')
    .limit(1)
    .get();

  if (!existing.empty) return;

  await appendLedger({
    party: { type: 'advertiser', id: advertiserId },
    type: 'topup',
    amountIsk,
    relatedId: teyaTxnId,
  });

  await syncMirror(advertiserId);

  try {
    const advertiser = await getAdvertiserById(advertiserId);
    if (advertiser) {
      await createNotification({
        userEmail: advertiser.ownerEmail,
        role: 'advertiser',
        type: 'success',
        title: 'Innborgun staðfest',
        message: `Greiðsla upp á ${amountIsk.toLocaleString('is-IS')} kr. var móttekin og bætt við reikninginn þinn.`,
        link: '/advertiser/topup',
      });
    }
  } catch (err) {
    console.error('Error creating topup notification:', err);
  }
}

export async function chargeCampaign(
  advertiserId: string,
  campaignId: string,
  amountIsk: number,
): Promise<void> {
  if (amountIsk <= 0) {
    throw new AppError(400, 'must be positive', 'BAD_REQUEST');
  }

  const wallet = await getWallet(advertiserId);
  if (wallet.balanceIsk < amountIsk) {
    throw new AppError(
      400,
      `insufficient balance: Wallet has ${wallet.balanceIsk}, needed ${amountIsk}`,
      'INSUFFICIENT_BALANCE',
    );
  }

  await appendLedger({
    party: { type: 'advertiser', id: advertiserId },
    type: 'campaign_charge',
    amountIsk: -amountIsk,
    relatedId: campaignId,
  });

  await syncMirror(advertiserId);
}

export async function refundCampaign(
  advertiserId: string,
  campaignId: string,
  amountIsk: number,
): Promise<void> {
  if (amountIsk <= 0) {
    throw new AppError(400, 'must be positive', 'BAD_REQUEST');
  }

  await appendLedger({
    party: { type: 'advertiser', id: advertiserId },
    type: 'refund',
    amountIsk,
    relatedId: campaignId,
  });

  await syncMirror(advertiserId);
}

export async function creditPublisher(
  publisherId: string,
  campaignId: string,
  grossIsk: number,
): Promise<void> {
  if (grossIsk <= 0) {
    throw new AppError(400, 'must be positive', 'BAD_REQUEST');
  }

  const feeIsk = Math.round((grossIsk * DEFAULT_PLATFORM_FEE_PERCENT) / 100);
  const netIsk = grossIsk - feeIsk;

  await appendLedger({
    party: { type: 'publisher', id: publisherId },
    type: 'publisher_credit',
    amountIsk: netIsk,
    relatedId: campaignId,
  });

  await appendLedger({
    party: { type: 'platform', id: 'platform' },
    type: 'platform_fee',
    amountIsk: feeIsk,
    relatedId: campaignId,
  });
}
