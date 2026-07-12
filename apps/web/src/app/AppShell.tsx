import { useState, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { TopStatusBar, type TopStatusBarProps } from "./TopStatusBar";
import { PageHeader } from "../components/ui/PageHeader";
import type { DestinationId } from "./navigation";

export interface AppShellProps extends Omit<TopStatusBarProps, "onOpenMobileNav"> {
  active: DestinationId;
  onSelectDestination: (destination: DestinationId) => void;
  children: ReactNode;
}

/**
 * Command Center layout shell: sidebar + sticky status bar + scrollable
 * content area, with a persistent compliance footer (a permanent fixture
 * of the shell, not a navigable destination). Owns the mobile nav
 * sheet's open/closed state - pure UI state, no reason to live any
 * higher up the tree.
 */
export function AppShell({ active, onSelectDestination, children, ...statusBarProps }: AppShellProps) {
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
