import { useState, type ReactNode } from "react";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { TopStatusBar, type TopStatusBarProps } from "./TopStatusBar";
import { PageHeader } from "../components/ui/PageHeader";
import type { DestinationId } from "./navigation";

export interface AppShellProps extends Omit<TopStatusBarProps, "onOpenMobileNav"> {
  active: DestinationId;
  onSelectDestination: (destination: DestinationId) => void;
  children: ReactNode;
  /** True only once the dashboard poll has failed for a sustained period (see App.tsx's isSustainedPollFailure) - never for one transient miss. */
  showStalePollWarning?: boolean;
  /** Re-invokes the dashboard poll immediately, without waiting for the next 5s tick. */
  onRetryDashboard?: () => void;
}

/**
 * Command Center layout shell: sidebar + sticky status bar + scrollable
 * content area, with a persistent compliance footer (a permanent fixture
 * of the shell, not a navigable destination). Owns the mobile nav
 * sheet's open/closed state - pure UI state, no reason to live any
 * higher up the tree.
 */
export function AppShell({
  active,
  onSelectDestination,
  children,
  showStalePollWarning,
  onRetryDashboard,
  ...statusBarProps
}: AppShellProps) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen bg-canvas text-white">
      <AppSidebar
        active={active}
        onSelect={onSelectDestination}
        isMobileNavOpen={isMobileNavOpen}
        onCloseMobileNav={() => setIsMobileNavOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopStatusBar {...statusBarProps} onOpenMobileNav={() => setIsMobileNavOpen(true)} />
        {showStalePollWarning && (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/20 bg-warning/10 px-6 py-2 text-xs text-warning-200"
          >
            <span className="flex items-center gap-2">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Showing the last data we could load — reconnecting to refresh it.
            </span>
            {onRetryDashboard && (
              <button
                type="button"
                onClick={onRetryDashboard}
                className="shrink-0 rounded-md border border-warning/30 px-2.5 py-1 font-semibold text-warning-100 transition hover:bg-warning/15"
              >
                Retry now
              </button>
            )}
          </div>
        )}
        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
          <PageHeader destinationId={active} />
          {children}
          <div id="app-shell-compliance" className="mt-6 flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-positive/10 text-positive">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">Compliance</p>
              <p className="font-display text-sm font-bold text-white">Analytics only</p>
              <p className="mt-1 text-[11px] leading-5 text-stone-400">
                GoalPulse does not place wagers, custody funds, execute trades, or facilitate illegal betting. It
                is a market monitoring layer with a TxLINE-ready adapter boundary.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
