import { AgentSignal, ArenaScoreboard } from "../types";
import {
  buildKellyCriterionPosition,
  buildMomentumFollowerPosition,
  summarize,
} from "./arena";

/**
 * Replays Momentum Follower and Kelly Criterion against archived signals
 * (not the live, capped-100 store.signals) - both only need fields
 * already present on the archived AgentSignal itself, so this is a pure
 * remapping of arena.ts's own builder functions, not new agent logic.
 * Contrarian is not backtestable: it needs the real match final score to
 * resolve the opposing side's outcome, which the archive never captures.
 */
export function computeBacktestScoreboards(
  archivedSignals: AgentSignal[]
): { momentumFollower: ArenaScoreboard; kellyCriterion: ArenaScoreboard } {
  const momentumPositions = archivedSignals
    .map(buildMomentumFollowerPosition)
    .filter((position): position is NonNullable<typeof position> => position !== null);

  const kellyPositions = archivedSignals
    .map(buildKellyCriterionPosition)
    .filter((position): position is NonNullable<typeof position> => position !== null);

  return {
    momentumFollower: summarize("momentum_follower", "Momentum Follower", momentumPositions),
    kellyCriterion: summarize("kelly_criterion", "Kelly Criterion", kellyPositions),
  };
}
