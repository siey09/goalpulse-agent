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

  it("does not render the mobile nav sheet by default", () => {
    render(<AppSidebar active={DEFAULT_DESTINATION} onSelect={() => {}} />);
    expect(screen.queryByLabelText("Close menu")).not.toBeInTheDocument();
  });

  it("renders the mobile nav sheet when open, and selecting a destination both navigates and closes it", () => {
    const onSelect = vi.fn();
    const onCloseMobileNav = vi.fn();
    render(
      <AppSidebar
        active={DEFAULT_DESTINATION}
        onSelect={onSelect}
        isMobileNavOpen
        onCloseMobileNav={onCloseMobileNav}
      />
    );

    expect(screen.getByLabelText("Close menu")).toBeInTheDocument();
    // "Market Maker" now appears twice: the always-rendered desktop/tablet rail and the mobile sheet.
    const marketMakerButtons = screen.getAllByRole("button", { name: "Market Maker" });
    expect(marketMakerButtons).toHaveLength(2);

    fireEvent.click(marketMakerButtons[marketMakerButtons.length - 1]);
    expect(onSelect).toHaveBeenCalledWith("market-maker");
    expect(onCloseMobileNav).toHaveBeenCalled();
  });

  it("closes the mobile nav sheet when the backdrop is clicked", () => {
    const onCloseMobileNav = vi.fn();
    const { container } = render(
      <AppSidebar
        active={DEFAULT_DESTINATION}
        onSelect={() => {}}
        isMobileNavOpen
        onCloseMobileNav={onCloseMobileNav}
      />
    );

    const backdrop = container.querySelector(".bg-black\\/60");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onCloseMobileNav).toHaveBeenCalled();
  });
});

describe("TopStatusBar", () => {
  it("renders title and status badges", () => {
    render(<TopStatusBar title="Command Center" agentStatus="RUNNING" feedMode="LIVE TxLINE" />);
    expect(screen.getByText("Command Center")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Command Center" })).not.toBeInTheDocument();
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
    expect(screen.getByText("LIVE TxLINE")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "System status" })).toBeInTheDocument();
  });

  it("does not render a mobile nav toggle when onOpenMobileNav is omitted", () => {
    render(<TopStatusBar title="Command Center" agentStatus="RUNNING" feedMode="LIVE TxLINE" />);
    expect(screen.queryByLabelText("Open navigation menu")).not.toBeInTheDocument();
  });

  it("renders a mobile nav toggle that calls onOpenMobileNav when clicked", () => {
    const onOpenMobileNav = vi.fn();
    render(
      <TopStatusBar
        title="Command Center"
        agentStatus="RUNNING"
        feedMode="LIVE TxLINE"
        onOpenMobileNav={onOpenMobileNav}
      />
    );
    fireEvent.click(screen.getByLabelText("Open navigation menu"));
    expect(onOpenMobileNav).toHaveBeenCalled();
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
    // "Command Center" legitimately appears three times: the sidebar nav label,
    // the status-bar title, and the PageHeader breadcrumb above the page content.
    expect(screen.getAllByText("Command Center")).toHaveLength(3);
  });

  it("leaves the destination page title as the document's only h1", () => {
    render(
      <AppShell
        active="signals"
        onSelectDestination={() => {}}
        title="Signals"
        agentStatus="RUNNING"
        feedMode="LIVE TxLINE"
      >
        <h1>Signal Triage</h1>
      </AppShell>
    );

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Signal Triage" })).toBeInTheDocument();
    expect(screen.getByText("Signals", { selector: "header *" })).toBeInTheDocument();
  });

  it("renders the persistent Compliance footer on every destination", () => {
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

    expect(screen.getByText("Analytics only")).toBeInTheDocument();
    expect(screen.getByText(/does not place wagers, custody funds/)).toBeInTheDocument();
  });

  it("opens the mobile nav sheet via the hamburger and closes it via a destination select", () => {
    const onSelectDestination = vi.fn();
    render(
      <AppShell
        active={DEFAULT_DESTINATION}
        onSelectDestination={onSelectDestination}
        title="Command Center"
        agentStatus="RUNNING"
        feedMode="LIVE TxLINE"
      >
        <p>page content</p>
      </AppShell>
    );

    expect(screen.queryByLabelText("Close menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Open navigation menu"));
    expect(screen.getByLabelText("Close menu")).toBeInTheDocument();

    const signalsButtons = screen.getAllByRole("button", { name: "Signals" });
    fireEvent.click(signalsButtons[signalsButtons.length - 1]);

    expect(onSelectDestination).toHaveBeenCalledWith("signals");
    expect(screen.queryByLabelText("Close menu")).not.toBeInTheDocument();
  });
});
