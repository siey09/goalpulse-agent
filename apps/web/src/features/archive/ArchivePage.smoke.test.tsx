import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ArchivePage } from "./ArchivePage";

describe("ArchivePage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network disabled in tests")));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders without throwing", () => {
    expect(() => render(<ArchivePage />)).not.toThrow();
  });
});
