export interface CouncilVoteEntry {
  agent: string;
  vote: "approve" | "reject" | "watch";
  reason: string;
}

export interface DissentInfo {
  unanimous: boolean;
  dissentingAgents: string[];
}

/**
 * Only Agent A can literally vote "reject"; Agent B and C only ever vote
 * "approve" or "watch" - a true 3-way unanimous "no" is impossible in this
 * schema, so the only symmetric consensus state is all three approving.
 * Dissent is therefore defined as any vote that isn't "approve".
 */
export function computeDissent(votes: CouncilVoteEntry[]): DissentInfo {
  const dissentingAgents = votes
    .filter((vote) => vote.vote !== "approve")
    .map((vote) => vote.agent);

  return { unanimous: dissentingAgents.length === 0, dissentingAgents };
}

export interface DissentSummary {
  unanimousSignals: number;
  dissentingSignals: number;
  dissentRatePct: number;
  dissentByAgent: Record<string, number>;
}

/**
 * dissentByAgent is seeded with every agent name that appears anywhere in
 * the run at 0 first, so an agent who never dissents still appears in the
 * map rather than being silently omitted.
 */
export function summarizeDissent(perSignalVotes: CouncilVoteEntry[][]): DissentSummary {
  const dissentByAgent: Record<string, number> = {};

  for (const votes of perSignalVotes) {
    for (const vote of votes) {
      dissentByAgent[vote.agent] = dissentByAgent[vote.agent] ?? 0;
    }
  }

  let unanimousSignals = 0;

  for (const votes of perSignalVotes) {
    const { unanimous, dissentingAgents } = computeDissent(votes);
    if (unanimous) unanimousSignals += 1;
    for (const agent of dissentingAgents) {
      dissentByAgent[agent] += 1;
    }
  }

  const dissentingSignals = perSignalVotes.length - unanimousSignals;
  const dissentRatePct =
    perSignalVotes.length > 0
      ? Math.round((dissentingSignals / perSignalVotes.length) * 100)
      : 0;

  return { unanimousSignals, dissentingSignals, dissentRatePct, dissentByAgent };
}
