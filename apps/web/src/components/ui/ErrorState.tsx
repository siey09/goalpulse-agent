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
    <div className="flex flex-col gap-2 rounded-xl border border-danger/25 bg-danger/8 p-4 text-sm text-danger-200">
      <p>{message}</p>
      <div className="flex items-center gap-3 text-xs">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-danger/30 px-3 py-1.5 font-semibold text-danger-200 transition hover:bg-danger/15"
          >
            Retry
          </button>
        )}
        <a
          href={healthHref}
          target="_blank"
          rel="noreferrer"
          className="text-stone-400 underline decoration-dotted underline-offset-2 hover:text-stone-200"
        >
          Check System Health
        </a>
      </div>
    </div>
  );
}
