export type DestinationId =
  | "command-center"
  | "live-markets"
  | "signals"
  | "agent-arena"
  | "market-maker"
  | "replay-lab"
  | "verification"
  | "archive"
  | "system-health";

export interface NavGroup {
  label: string;
  destinations: { id: DestinationId; label: string }[];
}

/**
 * Target information architecture from the Command Center redesign
 * blueprint (2026-07-11). Not wired into any page yet in Phase 1 - this
 * is the single source of truth Phase 3 will use to compose destination
 * pages and rebuild the guided tour's step -> destination mapping from,
 * instead of the two hand-kept-in-sync arrays that exist today.
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
    ],
  },
];

export const DEFAULT_DESTINATION: DestinationId = "command-center";
