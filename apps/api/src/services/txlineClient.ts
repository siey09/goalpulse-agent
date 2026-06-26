import { config } from "../config";
import { Match, OddsSnapshot } from "../types";

export interface TxLineFeedResult {
  matches: Match[];
  snapshots: OddsSnapshot[];
}

export async function fetchTxLineFeed(): Promise<TxLineFeedResult> {
  if (!config.txlineApiKey) {
    throw new Error(
      "TXLINE_API_KEY is missing. Set USE_SIMULATED_FEED=true for demo mode or add a valid TxLINE API token."
    );
  }

  const response = await fetch(`${config.txlineApiBaseUrl}/api/matches/live`, {
    headers: {
      Authorization: `Bearer ${config.txlineApiKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`TxLINE request failed with status ${response.status}`);
  }

  const rawData = await response.json();

  /*
    TODO: Replace this mapper with the exact TxLINE World Cup endpoint schema
    after validating the available API response with a real hackathon token.

    The rest of the GoalPulse system already expects normalized Match and
    OddsSnapshot arrays, so only this adapter needs to change for real TxLINE.
  */

  console.log("TxLINE raw response received:", rawData);

  return {
    matches: [],
    snapshots: [],
  };
}
