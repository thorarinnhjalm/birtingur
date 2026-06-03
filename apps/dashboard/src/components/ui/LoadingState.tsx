export function LoadingState() {
  return (
    <div className="space-y-4 py-8 animate-pulse w-full">
      <div className="h-6 bg-slate-200 rounded-md w-1/4" />
      <div className="space-y-3">
        <div className="h-4 bg-slate-200 rounded-md w-full" />
        <div className="h-4 bg-slate-200 rounded-md w-11/12" />
        <div className="h-4 bg-slate-200 rounded-md w-4/5" />
      </div>
    </div>
  );
}
