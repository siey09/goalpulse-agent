-- Run this once in the Supabase SQL editor for your project, before setting
-- SUPABASE_URL/SUPABASE_SERVICE_KEY. Single-row table (always id = 1),
-- upserted on every snapshot write - never grows, no cleanup needed.
create table if not exists store_snapshots (
  id smallint primary key default 1,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Insert-only permanent archive: one row per signal per lifecycle event
-- (created, settled). Never upserted, updated, or deleted - grows for the
-- rest of the tournament, independent of any in-memory cap.
create table if not exists signal_archive (
  id bigserial primary key,
  signal_id text not null,
  event text not null check (event in ('created', 'settled')),
  match_id text not null,
  side text not null,
  signal_type text not null,
  severity text not null,
  result_status text not null,
  momentum_score numeric not null,
  odds_change_pct numeric not null,
  signal_data jsonb not null,
  archived_at timestamptz not null default now()
);

-- Insert-only permanent archive: one row per match the first time it's
-- observed as finished. Never upserted, updated, or deleted. A match can
-- legitimately get a second row if the process restarts and rediscovers
-- it as "finished" via a backfill route without having seen the live
-- transition - this is accepted, not a bug (see match-archive design spec).
create table if not exists match_archive (
  id bigserial primary key,
  match_id text not null,
  competition text not null,
  home_team text not null,
  away_team text not null,
  home_score integer not null,
  away_score integer not null,
  status text not null,
  match_data jsonb not null,
  archived_at timestamptz not null default now()
);
