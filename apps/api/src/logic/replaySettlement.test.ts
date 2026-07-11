import { describe, expect, it } from "vitest";
import {
  baseMatchId,
  checkScoreReality,
  isFinishedMatchId,
  settleReplaySignal,
} from "./replaySettlement";
import type { AgentSignal, Match } from "../types";

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "match-1",
    competition: "Test Cup",
    homeTeam: "Team A",
    awayTeam: "Team B",
    homeScore: 0,
    awayScore: 0,
    minute: 90,
    status: "finished",
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

function makeSignal(overrides: Partial<AgentSignal> = {}): AgentSignal {
  return {
    id: "signal-1",
    matchId: "match-1",
    match: "Team A vs Team B",
    target: "Team A",
    side: "home",
    signalType: "SHARP_MOVE",
    severity: "HIGH",
    oddsBefore: 2.0,
    oddsAfter: 1.5,
    oddsChangePct: 25,
    momentumScore: 50,
    explanation: "test",
    createdAt: new Date().toISOString(),
    resultStatus: "pending",
    ...overrides,
  };
}

describe("baseMatchId", () => {
  it("returns the matchId unchanged for a plain 1X2 matchId", () => {
    expect(baseMatchId("18213979")).toBe("18213979");
  });

  it("strips the -totals-<line> suffix", () => {
    expect(baseMatchId("18213979-totals-3.5")).toBe("18213979");
  });
});

describe("isFinishedMatchId", () => {
  it("returns true for a plain matchId that is in the finished set", () => {
    expect(isFinishedMatchId("18213979", new Set(["18213979"]))).toBe(true);
  });

  it("returns true for a totals matchId whose base fixture is finished", () => {
    expect(isFinishedMatchId("18213979-totals-3.5", new Set(["18213979"]))).toBe(true);
  });

  it("returns false when the base fixture is not in the finished set", () => {
    expect(isFinishedMatchId("18213979-totals-3.5", new Set(["99999999"]))).toBe(false);
  });
});

describe("settleReplaySignal", () => {
  it("returns pending when no matching match is found", () => {
    const signal = makeSignal({ matchId: "unknown-match" });

    expect(settleReplaySignal(signal, [makeMatch()])).toBe("pending");
  });

  it("returns pending when the match is not finished", () => {
    const signal = makeSignal({ side: "home" });
    const match = makeMatch({ status: "live" });

    expect(settleReplaySignal(signal, [match])).toBe("pending");
  });

  it("marks a home-side signal correct when the home team wins", () => {
    const signal = makeSignal({ side: "home" });
    const match = makeMatch({ homeScore: 2, awayScore: 0 });

    expect(settleReplaySignal(signal, [match])).toBe("correct");
  });

  it("marks a draw-side signal correct when the match ends level", () => {
    const signal = makeSignal({ side: "draw", target: "Draw" });
    const match = makeMatch({ homeScore: 1, awayScore: 1 });

    expect(settleReplaySignal(signal, [match])).toBe("correct");
  });

  it("marks a draw-side signal incorrect when the match has a winner", () => {
    const signal = makeSignal({ side: "draw", target: "Draw" });
    const match = makeMatch({ homeScore: 2, awayScore: 1 });

    expect(settleReplaySignal(signal, [match])).toBe("incorrect");
  });

  it("resolves a totals signal's matchId to its base fixture to find the match", () => {
    const signal = makeSignal({
      matchId: "18213979-totals-3.5",
      side: "home",
      target: "Over 3.5",
    });
    const match = makeMatch({ id: "18213979", homeScore: 2, awayScore: 0 });

    expect(settleReplaySignal(signal, [match])).toBe("correct");
  });
});

describe("checkScoreReality", () => {
  it("reports WAITING_FOR_FINAL_SCORE when the match has not finished", () => {
    const signal = makeSignal();
    const match = makeMatch({ status: "live" });

    const result = checkScoreReality(signal, "pending", [match]);

    expect(result.scoreRealityStatus).toBe("WAITING_FOR_FINAL_SCORE");
  });

  it("reports CONFIRMED_BY_SCORE for a draw signal on a real draw", () => {
    const signal = makeSignal({ side: "draw", target: "Draw" });
    const match = makeMatch({ homeScore: 1, awayScore: 1 });

    const result = checkScoreReality(signal, "correct", [match]);

    expect(result.scoreRealityStatus).toBe("CONFIRMED_BY_SCORE");
  });

  it("reports REJECTED_BY_SCORE for a draw signal when the match has a winner", () => {
    const signal = makeSignal({ side: "draw", target: "Draw" });
    const match = makeMatch({ homeScore: 2, awayScore: 1 });

    const result = checkScoreReality(signal, "incorrect", [match]);

    expect(result.scoreRealityStatus).toBe("REJECTED_BY_SCORE");
  });

  it("resolves a totals signal's matchId to its base fixture to find the match", () => {
    const signal = makeSignal({
      matchId: "18213979-totals-3.5",
      side: "home",
      target: "Over 3.5",
    });
    const match = makeMatch({ id: "18213979", homeScore: 2, awayScore: 0 });

    const result = checkScoreReality(signal, "correct", [match]);

    expect(result.scoreRealityStatus).toBe("CONFIRMED_BY_SCORE");
  });
});
