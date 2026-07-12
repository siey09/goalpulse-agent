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
    ],
  },
];

export const DEFAULT_DESTINATION: DestinationId = "command-center";
