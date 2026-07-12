import {
  Archive as ArchiveIcon,
  BadgeCheck,
  HeartPulse,
  LayoutDashboard,
  LineChart,
  Radio,
  RotateCcw,
  Scale,
  Swords,
  X,
} from "lucide-react";
import { NAV_GROUPS, type DestinationId } from "./navigation";

export interface AppSidebarProps {
  active: DestinationId;
  onSelect: (destination: DestinationId) => void;
  /** Mobile-only slide-in sheet open state. Ignored at tablet/desktop widths. */
  isMobileNavOpen?: boolean;
  onCloseMobileNav?: () => void;
}

const DESTINATION_ICONS: Record<DestinationId, typeof LayoutDashboard> = {
  "command-center": LayoutDashboard,
  "live-markets": LineChart,
  signals: Radio,
  "agent-arena": Swords,
  "market-maker": Scale,
  "replay-lab": RotateCcw,
  verification: BadgeCheck,
  archive: ArchiveIcon,
  "system-health": HeartPulse,
};

function NavButton({
  destinationId,
  label,
  isActive,
  onSelect,
  responsiveLabel,
}: {
  destinationId: DestinationId;
  label: string;
  isActive: boolean;
  onSelect: (destination: DestinationId) => void;
  /**
   * true: label hides at tablet width (md-lg, icon-only rail) and
   * reappears at xl+ (full desktop rail). false: label always shows -
   * used by the mobile sheet, which only ever renders below md, so it
   * would never hit the xl breakpoint that brings the label back.
   */
  responsiveLabel: boolean;
}) {
  const Icon = DESTINATION_ICONS[destinationId];

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(destinationId)}
        aria-current={isActive ? "page" : undefined}
        aria-label={label}
        title={label}
        className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition-colors ${
          responsiveLabel ? "justify-center xl:justify-start" : ""
        } ${
          isActive
            ? "border-accent bg-accent/12 text-accent-soft"
            : "border-transparent text-stone-400 hover:bg-white/5 hover:text-stone-200"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className={responsiveLabel ? "hidden xl:inline" : "inline"}>{label}</span>
      </button>
    </li>
  );
}

/**
 * Responsive per the redesign blueprint: full labeled rail >=1280px
 * (unchanged desktop look), icon-only rail 768-1279px (tablet -
 * collapsible navigation per spec), and a hamburger-triggered
 * full-screen menu sheet below 768px (mobile - blueprint offers bottom
 * nav or menu sheet; a sheet was chosen since 9 destinations across 3
 * groups don't fit a bottom bar at a real 44px touch target without
 * cramming or flattening the groups).
 *
 * The 1px amber rail along the outer edge and the active-item tick mark
 * are the console's "power strip" cue - a fixed reference line the rest
 * of the rail's state reads against, echoing the calibration-bar
 * signature used throughout the panels.
 */
export function AppSidebar({ active, onSelect, isMobileNavOpen = false, onCloseMobileNav }: AppSidebarProps) {
  function handleSelect(destinationId: DestinationId) {
    onSelect(destinationId);
    onCloseMobileNav?.();
  }

  return (
    <>
      <nav
        aria-label="Primary"
        className="relative hidden h-full shrink-0 flex-col gap-6 border-r border-border bg-surface-1 p-4 md:flex md:w-[72px] xl:w-[248px]"
      >
        <span className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-accent/60 via-accent/10 to-transparent" aria-hidden="true" />

        <div className="hidden xl:block">
          <p className="font-display text-lg font-bold tracking-tight text-white">GOALPULSE</p>
          <p className="font-mono text-[11px] font-semibold tracking-[0.08em] text-accent">COMMAND CENTER</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent font-display text-sm font-black text-canvas xl:hidden">
          GP
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-2 hidden px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-600 xl:block">
                {group.label}
              </p>
              <ul className="space-y-1">
                {group.destinations.map((destination) => (
                  <NavButton
                    key={destination.id}
                    destinationId={destination.id}
                    label={destination.label}
                    isActive={destination.id === active}
                    onSelect={handleSelect}
                    responsiveLabel
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {isMobileNavOpen && (
        <div className="fixed inset-0 z-[90] md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCloseMobileNav} />
          <nav
            aria-label="Primary"
            className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col gap-6 overflow-y-auto border-r border-border bg-surface-1 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display text-lg font-bold tracking-tight text-white">GOALPULSE</p>
                <p className="font-mono text-[11px] font-semibold tracking-[0.08em] text-accent">COMMAND CENTER</p>
              </div>
              <button
                type="button"
                onClick={onCloseMobileNav}
                aria-label="Close menu"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/8 text-stone-300 transition hover:bg-white/12 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="mb-2 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-600">
                  {group.label}
                </p>
                <ul className="space-y-1">
                  {group.destinations.map((destination) => (
                    <NavButton
                      key={destination.id}
                      destinationId={destination.id}
                      label={destination.label}
                      isActive={destination.id === active}
                      onSelect={handleSelect}
                      responsiveLabel={false}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
