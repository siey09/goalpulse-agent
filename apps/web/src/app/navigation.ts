export type DestinationId =
  | "command-center"
  | "live-markets"
  | "signals"
  | "agent-arena"
  | "market-maker"
  | "replay-lab"
  | "verification"
  | "archive"
  | "system-health"
  | "about";

export interface NavGroup {
  label: string;
  destinations: { id: DestinationId; label: string }[];
}

/**
 * The Command Center's information architecture - the single source of
 * truth both the sidebar and the destination pages compose from.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operations",
    destinations: [
      { id: "command-center", label: "Command Center" },
      { id: "live-markets", label: "Live Markets" },
      { id: "signals", label: "Signals" },
    ],
  },
  {
    label: "Strategy",
    destinations: [
      { id: "agent-arena", label: "Agent Arena" },
      { id: "market-maker", label: "Market Maker" },
      { id: "replay-lab", label: "Replay Lab" },
    ],
  },
  {
    label: "Trust",
    destinations: [
      { id: "verification", label: "Verification" },
      { id: "archive", label: "Archive" },
      { id: "system-health", label: "System Health" },
      { id: "about", label: "About" },
    ],
  },
];

export const DEFAULT_DESTINATION: DestinationId = "command-center";

const PAGE_HEADING_DESTINATIONS = new Set<DestinationId>(["live-markets", "signals", "archive", "about"]);

/** Destinations with a page-specific h1 ask the shared status bar to render its title as plain text. */
export function destinationOwnsPageHeading(destination: DestinationId) {
  return PAGE_HEADING_DESTINATIONS.has(destination);
}
