import { describe, expect, it } from "vitest";
import {
  parsePageParam,
  parsePageSizeParam,
  parseArchiveFilters,
  parseSimilarSignalsParams,
} from "./paginationParams";

describe("parsePageParam", () => {
  it("defaults to 1 when raw is undefined", () => {
    expect(parsePageParam(undefined)).toBe(1);
  });

  it("defaults to 1 when raw is not a finite number", () => {
    expect(parsePageParam("not-a-number")).toBe(1);
  });

  it("defaults to 1 when raw is zero or negative", () => {
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-5")).toBe(1);
  });

  it("floors a valid fractional page", () => {
    expect(parsePageParam("3.9")).toBe(3);
  });

  it("passes through a valid integer page as a number", () => {
    expect(parsePageParam("2")).toBe(2);
  });
});

describe("parsePageSizeParam", () => {
  it("defaults to 25 when raw is undefined", () => {
    expect(parsePageSizeParam(undefined)).toBe(25);
  });

  it("defaults to 25 when raw is not a finite number or is less than 1", () => {
    expect(parsePageSizeParam("not-a-number")).toBe(25);
    expect(parsePageSizeParam("0")).toBe(25);
    expect(parsePageSizeParam("-10")).toBe(25);
  });

  it("caps at 100 for a larger requested pageSize", () => {
    expect(parsePageSizeParam("500")).toBe(100);
  });

  it("floors a valid fractional pageSize", () => {
    expect(parsePageSizeParam("10.7")).toBe(10);
  });
});

describe("parseArchiveFilters", () => {
  it("returns an empty object when no recognized query params are present", () => {
    expect(parseArchiveFilters({})).toEqual({});
  });

  it("includes matchId only when it is a non-empty string", () => {
    expect(parseArchiveFilters({ matchId: "match-1" })).toEqual({ matchId: "match-1" });
    expect(parseArchiveFilters({ matchId: "" })).toEqual({});
    expect(parseArchiveFilters({ matchId: undefined })).toEqual({});
  });

  it("includes status only when it is one of the three valid values", () => {
    expect(parseArchiveFilters({ status: "correct" })).toEqual({ status: "correct" });
    expect(parseArchiveFilters({ status: "pending" })).toEqual({ status: "pending" });
    expect(parseArchiveFilters({ status: "incorrect" })).toEqual({ status: "incorrect" });
    expect(parseArchiveFilters({ status: "bogus" })).toEqual({});
  });

  it("includes market only when it is 1x2 or totals", () => {
    expect(parseArchiveFilters({ market: "1x2" })).toEqual({ market: "1x2" });
    expect(parseArchiveFilters({ market: "totals" })).toEqual({ market: "totals" });
    expect(parseArchiveFilters({ market: "bogus" })).toEqual({});
  });

  it("includes event only when it is created or settled", () => {
    expect(parseArchiveFilters({ event: "created" })).toEqual({ event: "created" });
    expect(parseArchiveFilters({ event: "settled" })).toEqual({ event: "settled" });
    expect(parseArchiveFilters({ event: "bogus" })).toEqual({});
  });

  it("combines multiple valid filters together", () => {
    expect(
      parseArchiveFilters({ matchId: "match-1", status: "correct", market: "totals", event: "settled" })
    ).toEqual({ matchId: "match-1", status: "correct", market: "totals", event: "settled" });
  });
});

describe("parseSimilarSignalsParams", () => {
  it("returns an empty object when no recognized query params are present", () => {
    expect(parseSimilarSignalsParams({})).toEqual({});
  });

  it("includes signalType only when it is a non-empty string", () => {
    expect(parseSimilarSignalsParams({ signalType: "SHARP_MOVE" })).toEqual({
      signalType: "SHARP_MOVE",
    });
    expect(parseSimilarSignalsParams({ signalType: "" })).toEqual({});
    expect(parseSimilarSignalsParams({ signalType: undefined })).toEqual({});
  });

  it("includes oddsChangePct only when it parses to a finite number", () => {
    expect(parseSimilarSignalsParams({ oddsChangePct: "20.5" })).toEqual({ oddsChangePct: 20.5 });
    expect(parseSimilarSignalsParams({ oddsChangePct: "not-a-number" })).toEqual({});
    expect(parseSimilarSignalsParams({ oddsChangePct: undefined })).toEqual({});
  });

  it("includes fieldPressureScore only when it parses to a finite number", () => {
    expect(parseSimilarSignalsParams({ fieldPressureScore: "12" })).toEqual({ fieldPressureScore: 12 });
    expect(parseSimilarSignalsParams({ fieldPressureScore: "bogus" })).toEqual({});
  });

  it("includes excludeMatchId only when it is a non-empty string", () => {
    expect(parseSimilarSignalsParams({ excludeMatchId: "match-1" })).toEqual({
      excludeMatchId: "match-1",
    });
    expect(parseSimilarSignalsParams({ excludeMatchId: "" })).toEqual({});
  });

  it("combines multiple valid params together", () => {
    expect(
      parseSimilarSignalsParams({
        signalType: "SHARP_MOVE",
        oddsChangePct: "20",
        fieldPressureScore: "10",
        excludeMatchId: "match-1",
      })
    ).toEqual({
      signalType: "SHARP_MOVE",
      oddsChangePct: 20,
      fieldPressureScore: 10,
      excludeMatchId: "match-1",
    });
  });
});
