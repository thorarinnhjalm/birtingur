export async function clearFirestoreEmulator() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) {
    // If not running in emulator mode or host not set, do not run clear
    return;
  }

  const projectId = process.env.GCLOUD_PROJECT ?? 'ada-test';
  const url = `http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`;

  try {
    const response = await fetch(url, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(
        `Failed to clear Firestore emulator: ${response.status} ${response.statusText}`,
      );
    }
  } catch (error: any) {
    console.error('Error clearing Firestore emulator:', error.message);
    throw error;
  }
}
