import { Button } from './Button';

export function ErrorState({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry?: () => void;
  /**
   * Show the retry button as busy. A refetch leaves the query's `status` at
   * 'error' and only moves `fetchStatus` to 'fetching', so without this the
   * screen does not change at all when the button is pressed and a caller
   * cannot tell whether their click registered.
   */
  retrying?: boolean;
}) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center max-w-lg mx-auto shadow-sm">
      <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-xl font-bold mb-3">
        !
      </div>
      <h3 className="text-red-800 font-semibold text-lg">Villa kom upp</h3>
      <p className="text-red-700 text-sm mt-1">{message}</p>
      {onRetry && (
        <Button
          variant="secondary"
          className="mt-4 border-red-600 text-red-600 hover:bg-red-50"
          onClick={onRetry}
          loading={retrying}
        >
          Reyna aftur
        </Button>
      )}
    </div>
  );
}
