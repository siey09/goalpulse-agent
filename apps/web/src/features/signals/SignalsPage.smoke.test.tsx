import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { SignalsPage } from "./SignalsPage";

describe("SignalsPage", () => {
  beforeEach(() => {
    // The panels this page composes fetch their own data on mount - mock
    // fetch to a rejected promise so tests exercise the real, already-
    // tested error-handling path instead of making real network calls.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network disabled in tests")));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders without throwing", () => {
    expect(() =>
      render(<SignalsPage outcomeVerificationItems={[]} onSelectSignal={() => {}} />)
    ).not.toThrow();
  });
});
