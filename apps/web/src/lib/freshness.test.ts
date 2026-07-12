import { describe, expect, it } from "vitest";
import { getFreshnessState, getGlobalFreshnessState, isSustainedPollFailure } from "./freshness";

describe("getFreshnessState (per-match)", () => {
  it("is waiting when there's no data yet", () => {
    expect(getFreshnessState(false, false, false)).toBe("waiting");
  });

  it("is replay when replay mode is active, even with data", () => {
    expect(getFreshnessState(true, true, false)).toBe("replay");
  });

  it("is live when the odds stream is live", () => {
    expect(getFreshnessState(true, false, true)).toBe("live");
  });

  it("is stale when not live but a last-update timestamp exists", () => {
    expect(getFreshnessState(true, false, false, "11:12 PM")).toBe("stale");
  });

  it("is reconnecting when not live and there's no last-update timestamp", () => {
    expect(getFreshnessState(true, false, false)).toBe("reconnecting");
  });
});

describe("getGlobalFreshnessState (app-wide)", () => {
  const base = {
    hasLoadedDashboardOnce: true,
    isReplayStreamMode: false,
    isSustainedDashboardPollFailure: false,
    isLiveStreamConnected: true,
    feedHealthStatus: "healthy" as const,
  };

  it("is waiting before the first successful dashboard load, regardless of other inputs", () => {
    expect(
      getGlobalFreshnessState({
        ...base,
        hasLoadedDashboardOnce: false,
        isReplayStreamMode: true,
        isSustainedDashboardPollFailure: true,
      })
    ).toBe("waiting");
  });

  it("is replay when replay mode is active", () => {
    expect(getGlobalFreshnessState({ ...base, isReplayStreamMode: true })).toBe("replay");
  });

  it("replay takes precedence over a sustained poll failure", () => {
    expect(
      getGlobalFreshnessState({ ...base, isReplayStreamMode: true, isSustainedDashboardPollFailure: true })
    ).toBe("replay");
  });

  it("is reconnecting on a sustained dashboard-poll failure", () => {
    expect(getGlobalFreshnessState({ ...base, isSustainedDashboardPollFailure: true })).toBe("reconnecting");
  });

  it("is reconnecting when feed health reports down", () => {
    expect(getGlobalFreshnessState({ ...base, feedHealthStatus: "down" })).toBe("reconnecting");
  });

  it("is reconnecting when the verified live stream is disconnected", () => {
    expect(getGlobalFreshnessState({ ...base, isLiveStreamConnected: false })).toBe("reconnecting");
  });

  it("is stale when feed health reports degraded", () => {
    expect(getGlobalFreshnessState({ ...base, feedHealthStatus: "degraded" })).toBe("stale");
  });

  it("reconnecting wins over stale when both a sustained poll failure and a degraded feed health are present", () => {
    expect(
      getGlobalFreshnessState({
        ...base,
        isSustainedDashboardPollFailure: true,
        feedHealthStatus: "degraded",
      })
    ).toBe("reconnecting");
  });

  it("reconnecting (feed-health down) wins over stale (feed-health degraded can't both be true, but down still outranks a merely-disconnected stream check)", () => {
    expect(getGlobalFreshnessState({ ...base, feedHealthStatus: "down", isLiveStreamConnected: false })).toBe(
      "reconnecting"
    );
  });

  it("is live when dashboard data is current, the stream is connected, and feed health is healthy", () => {
    expect(getGlobalFreshnessState(base)).toBe("live");
  });

  it("is live when feedHealthStatus hasn't loaded yet but every other signal is healthy", () => {
    expect(getGlobalFreshnessState({ ...base, feedHealthStatus: undefined })).toBe("live");
  });
});

describe("isSustainedPollFailure", () => {
  it("is false for a single transient failure", () => {
    expect(isSustainedPollFailure(1, 5000)).toBe(false);
  });

  it("is false at exactly 2 consecutive failures with a short elapsed time", () => {
    expect(isSustainedPollFailure(2, 5000)).toBe(false);
  });

  it("is true at exactly 3 consecutive failures", () => {
    expect(isSustainedPollFailure(3, null)).toBe(true);
  });

  it("is true above 3 consecutive failures", () => {
    expect(isSustainedPollFailure(5, null)).toBe(true);
  });

  it("is false at 14999ms since the last success with few failures", () => {
    expect(isSustainedPollFailure(1, 14999)).toBe(false);
  });

  it("is true at exactly 15000ms since the last success", () => {
    expect(isSustainedPollFailure(1, 15000)).toBe(true);
  });

  it("is false when there has never been a successful load and the failure count is low", () => {
    expect(isSustainedPollFailure(0, null)).toBe(false);
  });
});
