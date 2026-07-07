import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import type { AgentSignal } from "../types";

const ARCHIVE_TABLE = "signal_archive";

export type ArchiveEvent = "created" | "settled";

function getClient(): SupabaseClient | null {
  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    return null;
  }

  return createClient(config.supabaseUrl, config.supabaseServiceKey);
}

/**
 * Appends one permanent record of a signal's state at a specific moment in
 * its lifecycle (created or settled) to an insert-only archive table -
 * separate from and never touching the existing single-row store_snapshots
 * table. Fail-open: no-ops if Supabase is not configured, and a delivery
 * failure is logged but never thrown - archiving must never break the agent
 * cycle that calls it.
 */
export async function archiveSignal(
  signal: AgentSignal,
  event: ArchiveEvent
): Promise<void> {
  const client = getClient();

  if (!client) {
    return;
  }

  try {
    await client.from(ARCHIVE_TABLE).insert({
      signal_id: signal.id,
      event,
      match_id: signal.matchId,
      side: signal.side,
      signal_type: signal.signalType,
      severity: signal.severity,
      result_status: signal.resultStatus,
      momentum_score: signal.momentumScore,
      odds_change_pct: signal.oddsChangePct,
      signal_data: { ...signal },
    });
  } catch (error) {
    console.error("[archive] Failed to archive signal to Supabase:", error);
  }
}
