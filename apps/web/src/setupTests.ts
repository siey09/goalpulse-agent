import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Not using vitest's `globals: true`, so @testing-library/react's automatic
// afterEach(cleanup) registration (which relies on detecting a global
// afterEach) never fires - without this, DOM from one test bleeds into the
// next and produces false "multiple elements found" failures.
afterEach(() => {
  cleanup();
});
