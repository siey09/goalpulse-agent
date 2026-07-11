import { useState, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { TopStatusBar, type TopStatusBarProps } from "./TopStatusBar";
import type { DestinationId } from "./navigation";

export interface AppShellProps extends Omit<TopStatusBarProps, "onOpenMobileNav"> {
  active: DestinationId;
  onSelectDestination: (destination: DestinationId) => void;
  children: ReactNode;
}

/**
 * Command Center layout shell: sidebar + sticky status bar + scrollable
 * content area, with a persistent compliance footer (matches the
 * blueprint's "keep as footer, not a destination" guidance). Owns the
 * mobile nav sheet's open/closed state - pure UI state, no reason to
 * live any higher up the tree.
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
          {children}
          <div id="app-shell-compliance" className="mt-6 flex items-center gap-2 rounded-2xl border border-border bg-surface-2 p-4">
            <div className="rounded-xl bg-positive/10 p-2 text-positive">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-stone-500">Compliance</p>
              <p className="text-sm font-semibold text-white">Analytics only</p>
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
