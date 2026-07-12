import { NAV_GROUPS, type DestinationId } from "../../app/navigation";

export interface PageHeaderProps {
  destinationId: DestinationId;
}

/** Section > Page breadcrumb sourced from NAV_GROUPS, the same single source of truth the sidebar renders from - so it can never drift out of sync with the nav labels. */
export function PageHeader({ destinationId }: PageHeaderProps) {
  const group = NAV_GROUPS.find((candidate) => candidate.destinations.some((destination) => destination.id === destinationId));
  const destination = group?.destinations.find((candidate) => candidate.id === destinationId);

  if (!group || !destination) return null;

  return (
    <p className="mb-3 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-stone-500">
      <span>{group.label}</span>
      <span aria-hidden="true">/</span>
      <span className="text-accent">{destination.label}</span>
    </p>
  );
}
