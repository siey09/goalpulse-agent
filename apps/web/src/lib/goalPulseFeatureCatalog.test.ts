import { describe, expect, it } from "vitest";
import {
  GOALPULSE_FEATURES,
  findGoalPulseFeature,
  parseGoalPulseCommand,
} from "./goalPulseFeatureCatalog";

describe("GoalPulse feature catalog", () => {
  it("uses unique ids and carries auditable explanation fields for every feature", () => {
    const ids = GOALPULSE_FEATURES.map((feature) => feature.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(GOALPULSE_FEATURES).toHaveLength(15);

    for (const feature of GOALPULSE_FEATURES) {
      expect(feature.implementation.length).toBeGreaterThan(0);
      expect(feature.formulas.length).toBeGreaterThan(0);
      expect(feature.evidence.length).toBeGreaterThan(0);
      expect(feature.limitation.length).toBeGreaterThan(0);
    }
  });

  it("returns the complete grouped feature index for /features", () => {
    const reply = parseGoalPulseCommand("  /FEATURES  ");

    expect(reply).toEqual({
      kind: "feature-index",
      content: "Explore how GoalPulse works. Select a feature for its workflow, formulas, evidence, and limits.",
      featureIds: GOALPULSE_FEATURES.map((feature) => feature.id),
    });
  });

  it("resolves feature aliases from singular and plural commands", () => {
    expect(parseGoalPulseCommand("/features confidence")).toMatchObject({
      kind: "feature-detail",
      featureId: "confidence-score",
    });
    expect(parseGoalPulseCommand("/feature kelly criterion")).toMatchObject({
      kind: "feature-detail",
      featureId: "kelly-criterion",
    });
    expect(findGoalPulseFeature("solana")?.id).toBe("solana-verification");
  });

  it("returns command guidance for /help", () => {
    expect(parseGoalPulseCommand("/help")).toMatchObject({
      kind: "help",
    });
  });

  it("leaves ordinary live-data questions to the existing analyst", () => {
    expect(parseGoalPulseCommand("what is the latest signal?")).toBeNull();
  });

  it("recovers from an unknown feature without pretending it exists", () => {
    const reply = parseGoalPulseCommand("/features quantum predictor");

    expect(reply).toMatchObject({
      kind: "text",
    });
    expect(reply?.content).toContain("I couldn't find");
    expect(reply?.content).toContain("/features");
  });
});
