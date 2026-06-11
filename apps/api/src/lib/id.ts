import { randomBytes } from 'crypto';

export type IdPrefix = 'pub' | 'slot' | 'adv' | 'crt' | 'cmp' | 'ldg' | 'pay' | 'sup' | 'not';

export function generateId(prefix: IdPrefix): string {
  const randomStr = randomBytes(12).toString('hex');
  return `${prefix}_${randomStr}`;
}
