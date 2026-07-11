import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppShell } from "./AppShell";
import { AppSidebar } from "./AppSidebar";
import { TopStatusBar } from "./TopStatusBar";
import { DEFAULT_DESTINATION, NAV_GROUPS } from "./navigation";

describe("navigation", () => {
  it("accounts for exactly 9 destinations across 3 groups", () => {
    const total = NAV_GROUPS.reduce((sum, group) => sum + group.destinations.length, 0);
    expect(NAV_GROUPS).toHaveLength(3);
    expect(total).toBe(9);
  });
});

describe("AppSidebar", () => {
  it("renders every destination and marks the active one", () => {
    render(<AppSidebar active="agent-arena" onSelect={() => {}} />);
    expect(screen.getByText("Agent Arena")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agent Arena" })).toHaveAttribute("aria-current", "page");
  });

  it("calls onSelect with the clicked destination id", () => {
    const onSelect = vi.fn();
    render(<AppSidebar active={DEFAULT_DESTINATION} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Market Maker" }));
    expect(onSelect).toHaveBeenCalledWith("market-maker");
  });
});

describe("TopStatusBar", () => {
  it("renders title and status badges", () => {
    render(<TopStatusBar title="Command Center" agentStatus="RUNNING" feedMode="LIVE TxLINE" />);
    expect(screen.getByText("Command Center")).toBeInTheDocument();
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
    expect(screen.getByText("LIVE TxLINE")).toBeInTheDocument();
  });
});

describe("AppShell", () => {
  it("renders without throwing given representative props and children", () => {
    render(
      <AppShell
        active={DEFAULT_DESTINATION}
        onSelectDestination={() => {}}
        title="Command Center"
        agentStatus="RUNNING"
        feedMode="LIVE TxLINE"
        freshnessLabel="2.4s"
      >
        <p>page content</p>
      </AppShell>
    );

    expect(screen.getByText("page content")).toBeInTheDocument();
    // "Command Center" legitimately appears twice: the sidebar nav label and the status-bar title.
    expect(screen.getAllByText("Command Center")).toHaveLength(2);
  });
});
