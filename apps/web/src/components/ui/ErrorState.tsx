export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  /** Defaults to the backend health check - override for a more specific link when one exists. */
  healthHref?: string;
}

export function ErrorState({
  message,
  onRetry,
  healthHref = "https://goalpulse-agent-api.onrender.com/health",
}: ErrorStateProps) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
      <p>{message}</p>
      <div className="flex items-center gap-3 text-xs">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full border border-danger/30 px-3 py-1 font-semibold text-danger transition hover:bg-danger/10"
          >
            Retry
          </button>
        )}
        <a
          href={healthHref}
          target="_blank"
          rel="noreferrer"
          className="text-stone-400 underline decoration-dotted hover:text-stone-200"
        >
          Check System Health
        </a>
      </div>
    </div>
  );
}
