/**
 * The Firestore emulator resolves the commit-time write conflict between two
 * concurrent transactions with a coarse ~3s "Transaction lock timeout" that
 * aborts the loser server-side. When the loser's next operation reaches the
 * emulator after that abort, the emulator answers `INVALID_ARGUMENT:
 * Transaction is invalid or closed.` — wording the SDK does NOT recognize as
 * retryable: isRetryableTransactionError in @google-cloud/firestore retries
 * ABORTED and only the real backend's /transaction has expired/ phrasing of
 * INVALID_ARGUMENT. Against production Firestore the same conflict surfaces
 * as one of those retryable errors and runTransaction transparently re-runs
 * the loser. Tests that race two transactions on purpose use
 * retryOnEmulatorContention to reproduce those production retry semantics.
 * This does not weaken what the concurrency tests prove: a genuine
 * serialization regression makes both contenders SUCCEED, which produces no
 * artifact error, never triggers a retry, and still fails the assertions.
 */
export function isEmulatorContentionArtifact(err: unknown): boolean {
  // Emulator-only semantics by definition — against real Firestore the SDK
  // already retries everything retryable, so never mask errors there.
  if (!process.env.FIRESTORE_EMULATOR_HOST) return false;
  const e = err as { code?: unknown; message?: unknown };
  if (e?.code === 3 && /transaction is invalid or closed/i.test(String(e?.message))) return true;
  // ABORTED after the SDK exhausted its 5 in-transaction attempts — the
  // emulator's ~3s lock-timeout pacing makes that reachable under load.
  if (e?.code === 10) return true;
  return false;
}

export async function retryOnEmulatorContention<T>(
  fn: () => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxAttempts || !isEmulatorContentionArtifact(err)) throw err;
      // Loud on purpose: a test that only passes after burning artifact
      // retries should look different from a clean pass in CI logs.
      console.warn(
        `retryOnEmulatorContention: attempt ${attempt}/${maxAttempts} hit emulator contention artifact, retrying:`,
        (err as Error).message,
      );
    }
  }
}

export async function clearFirestoreEmulator() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) {
    // If not running in emulator mode or host not set, do not run clear
    return;
  }

  const projectId = process.env.GCLOUD_PROJECT ?? 'birtingur-8b5a4';
  const url = `http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`;

  // The clear endpoint answers 409 Conflict while a transaction is still open
  // against the emulator (e.g. a fire-and-forget write from the previous test
  // that hasn't settled yet). That resolves itself within the ~3s transaction
  // lock timeout, so retry briefly instead of failing the whole test.
  const maxAttempts = 4;
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'DELETE',
      });

      if (response.ok) return;
      if (response.status === 409 && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw new Error(
        `Failed to clear Firestore emulator: ${response.status} ${response.statusText}`,
      );
    } catch (error: any) {
      console.error('Error clearing Firestore emulator:', error.message);
      throw error;
    }
  }
}
