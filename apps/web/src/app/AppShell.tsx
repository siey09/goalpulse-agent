import type { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { TopStatusBar, type TopStatusBarProps } from "./TopStatusBar";
import type { DestinationId } from "./navigation";

export interface AppShellProps extends TopStatusBarProps {
  active: DestinationId;
  onSelectDestination: (destination: DestinationId) => void;
  children: ReactNode;
}

/**
 * Command Center layout shell: sidebar + sticky status bar + scrollable
 * content area. Not mounted by App.tsx yet - Phase 1 scaffolding only,
 * verified standalone via its smoke test.
 */
export function AppShell({ active, onSelectDestination, children, ...statusBarProps }: AppShellProps) {
  return (
    <div className="flex h-screen bg-canvas text-white">
      <AppSidebar active={active} onSelect={onSelectDestination} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopStatusBar {...statusBarProps} />
        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-5">{children}</main>
      </div>
    </div>
  );
}
