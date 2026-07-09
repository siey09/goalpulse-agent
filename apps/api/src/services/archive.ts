import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import type { AgentSignal, ArchiveEntry, ArchiveFilters, ArchivePagination, ArchiveQueryResult, Match } from "../types";

const ARCHIVE_TABLE = "signal_archive";
const MATCH_ARCHIVE_TABLE = "match_archive";

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

/**
 * Appends one permanent record of a match's state the first time it's
 * observed as finished - separate from signal_archive, since a match with
 * zero signals otherwise leaves no permanent trace once it ages out of the
 * in-memory recentFinishedMatches cap. Fail-open, same contract as
 * archiveSignal: no-ops if Supabase is not configured, logs but never
 * throws on a delivery failure.
 */
export async function archiveMatch(match: Match): Promise<void> {
  const client = getClient();

  if (!client) {
    return;
  }

  try {
    await client.from(MATCH_ARCHIVE_TABLE).insert({
      match_id: match.id,
      competition: match.competition,
      home_team: match.homeTeam,
      away_team: match.awayTeam,
      home_score: match.homeScore,
      away_score: match.awayScore,
      status: match.status,
      match_data: { ...match },
    });
  } catch (error) {
    console.error("[archive] Failed to archive match to Supabase:", error);
  }
}

/**
 * Totals signals use a matchId of the form <fixtureId>-totals-<line> (see
 * agent.ts/arena.ts's existing multi-market convention) - there is no
 * dedicated market column on signal_archive, so market filtering is done by
 * checking for this substring rather than requiring a schema migration.
 */
export function isTotalsMatchId(matchId: string): boolean {
  return matchId.includes("-totals-");
}

interface ArchiveRow {
  signal_id: string;
  event: "created" | "settled";
  match_id: string;
  side: ArchiveEntry["side"];
  signal_type: ArchiveEntry["signalType"];
  severity: ArchiveEntry["severity"];
  result_status: ArchiveEntry["resultStatus"];
  momentum_score: number;
  odds_change_pct: number;
  signal_data: AgentSignal;
  archived_at: string;
}

function mapArchiveRow(row: ArchiveRow): ArchiveEntry {
  return {
    signalId: row.signal_id,
    event: row.event,
    matchId: row.match_id,
    side: row.side,
    signalType: row.signal_type,
    severity: row.severity,
    resultStatus: row.result_status,
    momentumScore: row.momentum_score,
    oddsChangePct: row.odds_change_pct,
    archivedAt: row.archived_at,
    signalData: row.signal_data,
  };
}

function emptyResult(pagination: ArchivePagination): ArchiveQueryResult {
  return {
    data: [],
    pagination: { ...pagination, totalCount: 0, totalPages: 0 },
  };
}

/**
 * Reads back rows from the insert-only signal_archive table: raw event-log
 * rows (a signal usually appears twice, once per "created"/"settled" event),
 * never collapsed - the caller filters by event if they only want one state.
 * Fail-open: returns an empty page (never throws/errors) if Supabase is
 * unconfigured or the query itself fails, matching archiveSignal's existing
 * fail-open convention.
 */
export async function getArchivedSignals(
  filters: ArchiveFilters,
  pagination: ArchivePagination
): Promise<ArchiveQueryResult> {
  const client = getClient();

  if (!client) {
    return emptyResult(pagination);
  }

  const from = (pagination.page - 1) * pagination.pageSize;
  const to = from + pagination.pageSize - 1;

  let query = client
    .from(ARCHIVE_TABLE)
    .select("*", { count: "exact" })
    .order("archived_at", { ascending: false })
    .range(from, to);

  if (filters.matchId) query = query.eq("match_id", filters.matchId);
  if (filters.status) query = query.eq("result_status", filters.status);
  if (filters.event) query = query.eq("event", filters.event);
  if (filters.market === "totals") query = query.like("match_id", "%-totals-%");
  if (filters.market === "1x2") query = query.not("match_id", "like", "%-totals-%");

  try {
    const { data, count, error } = await query;

    if (error || !data) {
      console.error("[archive] Failed to read signal_archive from Supabase:", error);
      return emptyResult(pagination);
    }

    return {
      data: (data as ArchiveRow[]).map(mapArchiveRow),
      pagination: {
        ...pagination,
        totalCount: count ?? 0,
        totalPages: count ? Math.ceil(count / pagination.pageSize) : 0,
      },
    };
  } catch (error) {
    console.error("[archive] Failed to read signal_archive from Supabase:", error);
    return emptyResult(pagination);
  }
}
