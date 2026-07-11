import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { AgentArenaPage } from "./AgentArenaPage";

describe("AgentArenaPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network disabled in tests")));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders without throwing", () => {
    expect(() => render(<AgentArenaPage />)).not.toThrow();
  });
});
