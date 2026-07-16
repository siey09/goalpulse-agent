import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HealthStage } from "./systemHealthModel";
import { HealthDiagnosticSpine } from "./HealthDiagnosticSpine";

const stages: HealthStage[] = [
  { id: "api", label: "API", status: "healthy", value: "Online", detail: "GoalPulse API" },
  { id: "cycle", label: "Agent cycle", status: "degraded", value: "11s", detail: "1 recent miss" },
  { id: "fixtures", label: "Fixture coverage", status: "down", value: "5/7", detail: "Coverage dropped" },
  { id: "odds", label: "Odds freshness", status: "healthy", value: "0 stale live", detail: "5m threshold" },
  { id: "archive", label: "Archive", status: "unknown", value: "Unavailable", detail: "No archive evidence" },
];

describe("HealthDiagnosticSpine", () => {
  it("exposes the ordered pipeline and text statuses", () => {
    render(<HealthDiagnosticSpine stages={stages} />);

    const pipeline = screen.getByRole("list", { name: "System diagnostic pipeline" });
    expect(pipeline).toHaveClass("lg:grid-cols-5", "xl:grid-cols-5");
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("API")).toBeInTheDocument();
    expect(screen.getAllByText("Healthy")).toHaveLength(2);
    expect(screen.getByText("Degraded")).toBeInTheDocument();
    expect(screen.getByText("Down")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("keeps connectors decorative and disables rail motion when requested", () => {
    render(<HealthDiagnosticSpine stages={stages} />);

    const connectors = screen.getAllByTestId("diagnostic-connector");
    expect(connectors[0]).toHaveAttribute("aria-hidden", "true");
    expect(screen.getAllByTestId("diagnostic-rail")[0]).toHaveClass("motion-reduce:transition-none");
  });
});
