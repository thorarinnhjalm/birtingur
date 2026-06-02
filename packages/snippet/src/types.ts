export type ConsentState = 'full' | 'none';

export interface AdResponse {
  empty?: true;
  creativeId?: string;
  imageUrl?: string;
  clickUrl?: string;
  width?: number;
  height?: number;
  impressionPixel?: string;
  ttl?: number;
}
