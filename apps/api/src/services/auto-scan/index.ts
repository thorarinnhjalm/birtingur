import type { AutoScanResult } from '@ada/shared';

export interface ScanInput {
  imageUrl: string;
  clickUrl: string;
  ocrTextHint?: string;
}

export type ScanOutcome = 'auto_approved' | 'flagged_for_manual' | 'auto_rejected';

export interface ScanReturn {
  outcome: ScanOutcome;
  scanResult: AutoScanResult;
}

export interface AutoScanner {
  scan(input: ScanInput): Promise<ScanReturn>;
}

export { StubAutoScanner } from './stub';
