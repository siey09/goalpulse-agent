import { describe, expect, it } from "vitest";
import { GUIDE_STEPS } from "./guideSteps";

describe("Live Markets guide steps", () => {
  it("keeps the cockpit targets and judge-facing copy aligned", () => {
    const marketSteps = GUIDE_STEPS.filter((step) => step.destination === "live-markets");

    expect(marketSteps.map((step) => step.targetId)).toEqual(
      expect.arrayContaining(["guide-market-board", "guide-selected-match", "guide-odds-chart"])
    );
    expect(marketSteps.map((step) => step.title)).toEqual(
      expect.arrayContaining(["Choose a market", "Read the selected match", "Trace real price movement"])
    );
  });

  it("keeps the judge tour concise and gives every step a stable target", () => {
    expect(GUIDE_STEPS).toHaveLength(12);
    expect(GUIDE_STEPS.every((step) => Boolean(step.targetId))).toBe(true);
    expect(GUIDE_STEPS.every((step) => !step.targetText)).toBe(true);
  });
});
