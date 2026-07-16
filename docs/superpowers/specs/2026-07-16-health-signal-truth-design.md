# Truthful Healthy-State Recovery Design

## Goal

Make every System Health stage capable of returning to Healthy when the live pipeline is genuinely operating normally. Do not relax real outage detection or convert missing evidence into success.

## Confirmed Root Causes

1. **Cycle health measures runtime as scheduler delay.** The agent is configured for a five-second cadence, but a live run can take more than six seconds. Start-to-start comparisons and a fixed interval timer therefore report missed cycles even when work is continuously progressing.
2. **Fixture coverage compares different populations.** `rawFixtureCount` includes every fixture returned by TxLINE, while `matchesProcessed` includes only fixtures with supported 1X2 or totals odds. Intentional exclusions appear as lost fixtures.
3. **Archive failure state never recovers.** The outbox increments a cumulative failure counter but never clears it after a successful flush, so one transient failure keeps the archive stage Down forever.

## Design

### Cycle cadence

- Replace overlapping `setInterval` scheduling with a completion-aware recursive timeout: wait for a cycle to finish, then wait `agentIntervalMs`, then start the next cycle.
- Measure current scheduler gap from the latest run's `finishedAt`, not `startedAt`.
- Measure historical missed cycles as idle time between an older run's `finishedAt` and the next run's `startedAt`.
- Keep the existing three-times-interval tolerance. A long-running but continuously progressing cycle is not a missed cycle; an excessive idle delay still is.

### Fixture eligibility

- Preserve raw discovery count.
- Track the count of fixtures that contain supported odds and the count of odds-enrichment request failures separately.
- Define coverage as processed / odds-eligible fixtures, not processed / all raw fixtures.
- Treat an odds-enrichment request failure or an eligible fixture that fails to normalize as a real coverage issue.
- Treat legacy persisted runs without the new fields as neutral rather than replaying the old false-positive calculation.
- Expose raw, eligible, and processed counts in `/api/feed-health`; update the System Health card and diagnostic stage to display processed/eligible and retain raw discovery as context.

### Archive recovery

- Interpret the existing `failures` health field as consecutive unresolved flush failures.
- Reset `failures` and `lastFailureAt` after the next successful non-empty flush.
- Keep pending snapshots as Degraded and active consecutive failures as Down.

## Data Contracts

Add optional fields to `AgentRun` for backward compatibility:

- `eligibleFixtureCount?: number`
- `oddsEnrichmentFailures?: number`

Extend fixture health output with:

- `lastRunEligibleFixtureCount: number | null`
- `lastRunOddsEnrichmentFailures: number`

Existing fields and endpoints remain available. No new endpoint, dependency, database migration, or UI polling loop is added.

## Error Semantics

- Zero eligible fixtures is Healthy only when odds enrichment completed without request failures; it means no supported market was available.
- Missing new fields on legacy runs are Unknown/neutral evidence, not failure.
- A successful archive retry clears the active failure state; historical failure analytics are outside this change.
- A running cycle may be slow, but the scheduler becomes Down only when idle after completion beyond the existing tolerance.

## Testing

Use red-green tests for:

- long cycle runtime not counted as scheduler idle delay;
- excessive post-completion idle delay counted as missed;
- raw fixtures without supported odds not counted as coverage loss;
- odds-enrichment failures counted as real coverage degradation;
- legacy runs remaining neutral;
- archive failure state resetting after a successful retry;
- completion-aware scheduling never overlapping cycles;
- System Health displaying processed/eligible with raw discovery context.

Then run the complete API and web test suites, both builds, lint where configured, and live endpoint/browser verification after deployment.

## Success Criteria

- API, cycle, fixture, odds, archive, and both streams display Healthy when live evidence supports it.
- Genuine scheduler idle gaps, odds-enrichment failures, stale odds, pending archive work, and unresolved archive failures still degrade or down the system.
- No threshold is widened merely to force green.
