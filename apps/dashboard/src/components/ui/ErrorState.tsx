import { Button } from './Button';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center max-w-lg mx-auto shadow-sm">
      <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-xl font-bold mb-3">!</div>
      <h3 className="text-red-800 font-semibold text-lg">Villa kom upp</h3>
      <p className="text-red-700 text-sm mt-1">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-4 border-red-600 text-red-600 hover:bg-red-50" onClick={onRetry}>
          Reyna aftur
        </Button>
      )}
    </div>
  );
}
