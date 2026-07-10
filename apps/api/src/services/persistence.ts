import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import { store } from "../store";
import type { AgentRun, AgentSignal, Match, OddsSnapshot } from "../types";

const SNAPSHOT_TABLE = "store_snapshots";
const SNAPSHOT_ROW_ID = 1;
const LOAD_TIMEOUT_MS = 5000;

type StoreSnapshot = {
  matches: Match[];
  recentFinishedMatches: Match[];
  oddsSnapshots: OddsSnapshot[];
  signals: AgentSignal[];
  agentRuns: AgentRun[];
  duplicatesDropped?: { snapshots: number; signals: number };
};

function getClient(): SupabaseClient | null {
  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    return null;
  }

  return createClient(config.supabaseUrl, config.supabaseServiceKey);
}

/**
 * Upserts the entire in-memory store as one JSONB blob. Fail-open: no-ops if
 * Supabase is not configured, and a delivery failure is logged but never
 * thrown - a Supabase outage must never break the agent cycle that calls
 * this.
 */
export async function saveSnapshot(): Promise<void> {
  const client = getClient();

  if (!client) {
    return;
  }

  try {
    const snapshot: StoreSnapshot = {
      matches: store.matches,
      recentFinishedMatches: store.recentFinishedMatches,
      oddsSnapshots: store.oddsSnapshots,
      signals: store.signals,
      agentRuns: store.agentRuns,
      duplicatesDropped: store.duplicatesDropped,
    };

    await client.from(SNAPSHOT_TABLE).upsert({
      id: SNAPSHOT_ROW_ID,
      data: snapshot,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[persistence] Failed to save snapshot to Supabase:", error);
  }
}

/**
 * Loads the most recent snapshot and assigns its fields onto the existing
 * store object in place (other modules import `store` directly, so the
 * object reference must not be replaced). Fail-open: no-ops if Supabase is
 * not configured, bounded by an internal timeout so a slow/unreachable
 * Supabase can never hang server startup, and never throws.
 */
export async function loadSnapshot(): Promise<void> {
  const client = getClient();

  if (!client) {
    return;
  }

  try {
    const queryPromise = client
      .from(SNAPSHOT_TABLE)
      .select("data")
      .eq("id", SNAPSHOT_ROW_ID)
      .maybeSingle();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("Supabase load timed out")),
        LOAD_TIMEOUT_MS
      );
    });

    const { data: row, error } = await Promise.race([
      queryPromise,
      timeoutPromise,
    ]);

    if (error || !row?.data) {
      return;
    }

    const snapshot = row.data as StoreSnapshot;

    store.matches = snapshot.matches ?? [];
    store.recentFinishedMatches = snapshot.recentFinishedMatches ?? [];
    // Re-sort descending (newest first) on restore: a snapshot saved while
    // the recent-results merge bug was live can have out-of-order createdAt
    // values baked in permanently, which would otherwise corrupt every
    // reader that assumes this order (agent.ts's unshift, and the
    // .slice(0,100).reverse() pattern in the odds-stream/history routes).
    store.oddsSnapshots = (snapshot.oddsSnapshots ?? []).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    store.signals = snapshot.signals ?? [];
    store.agentRuns = snapshot.agentRuns ?? [];
    store.duplicatesDropped = snapshot.duplicatesDropped ?? { snapshots: 0, signals: 0 };

    console.log(
      `[persistence] Restored store from Supabase snapshot (${store.matches.length} matches, ${store.signals.length} signals, ${store.oddsSnapshots.length} odds snapshots, ${store.agentRuns.length} agent runs).`
    );
  } catch (error) {
    console.error("[persistence] Failed to load snapshot from Supabase:", error);
  }
}
