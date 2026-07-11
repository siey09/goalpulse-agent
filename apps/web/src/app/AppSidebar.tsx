import { NAV_GROUPS, type DestinationId } from "./navigation";

export interface AppSidebarProps {
  active: DestinationId;
  onSelect: (destination: DestinationId) => void;
}

export function AppSidebar({ active, onSelect }: AppSidebarProps) {
  return (
    <nav aria-label="Primary" className="flex h-full w-[248px] shrink-0 flex-col gap-6 border-r border-border bg-surface-1 p-4">
      <div>
        <p className="text-lg font-bold tracking-tight text-white">GOALPULSE</p>
        <p className="text-xs font-semibold text-accent">COMMAND CENTER</p>
      </div>

      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
            {group.label}
          </p>
          <ul className="space-y-1">
            {group.destinations.map((destination) => {
              const isActive = destination.id === active;
              return (
                <li key={destination.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(destination.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                      isActive
                        ? "bg-accent/15 text-accent-soft"
                        : "text-stone-400 hover:bg-white/5 hover:text-stone-200"
                    }`}
                  >
                    {destination.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
