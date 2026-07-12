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
    render(<TopStatusBar title="Command Center" agentStatus="RUNNING" feedMode="live" />);
    expect(screen.getByText("Command Center")).toBeInTheDocument();
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("renders the freshness copy for each app-wide feed state", () => {
    const { rerender } = render(<TopStatusBar title="Command Center" agentStatus="RUNNING" feedMode="waiting" />);
    expect(screen.getByText("Waiting")).toBeInTheDocument();

    rerender(<TopStatusBar title="Command Center" agentStatus="RUNNING" feedMode="replay" />);
    expect(screen.getByText("Replay")).toBeInTheDocument();

    rerender(<TopStatusBar title="Command Center" agentStatus="RUNNING" feedMode="stale" />);
    expect(screen.getByText("Stale")).toBeInTheDocument();

    rerender(<TopStatusBar title="Command Center" agentStatus="RUNNING" feedMode="reconnecting" />);
    expect(screen.getByText("Reconnecting")).toBeInTheDocument();
  });

  it("does not render a mobile nav toggle when onOpenMobileNav is omitted", () => {
    render(<TopStatusBar title="Command Center" agentStatus="RUNNING" feedMode="live" />);
    expect(screen.queryByLabelText("Open navigation menu")).not.toBeInTheDocument();
  });

  it("renders a mobile nav toggle that calls onOpenMobileNav when clicked", () => {
    const onOpenMobileNav = vi.fn();
    render(
      <TopStatusBar
        title="Command Center"
        agentStatus="RUNNING"
        feedMode="live"
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
        feedMode="live"
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

  it("renders the persistent Compliance footer on every destination", () => {
    render(
      <AppShell
        active={DEFAULT_DESTINATION}
        onSelectDestination={() => {}}
        title="Command Center"
        agentStatus="RUNNING"
        feedMode="live"
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
        feedMode="live"
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

  it("does not render the stale-poll warning by default", () => {
    render(
      <AppShell active={DEFAULT_DESTINATION} onSelectDestination={() => {}} title="Command Center" agentStatus="RUNNING" feedMode="live">
        <p>page content</p>
      </AppShell>
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders the stale-poll warning with role=status and aria-live=polite, and Retry invokes the callback", () => {
    const onRetryDashboard = vi.fn();
    render(
      <AppShell
        active={DEFAULT_DESTINATION}
        onSelectDestination={() => {}}
        title="Command Center"
        agentStatus="RUNNING"
        feedMode="reconnecting"
        showStalePollWarning
        onRetryDashboard={onRetryDashboard}
      >
        <p>page content</p>
      </AppShell>
    );

    const banner = screen.getByRole("status");
    expect(banner).toHaveAttribute("aria-live", "polite");

    // Communicates staleness without exposing technical detail - never a URL, status code, or stack trace.
    expect(banner.textContent).toMatch(/last data we could load/i);
    expect(banner.textContent).not.toMatch(/https?:\/\//i);
    expect(banner.textContent).not.toMatch(/\b\d{3}\b/); // no bare HTTP status codes
    expect(banner.textContent?.toLowerCase()).not.toContain("stack");
    expect(banner.textContent?.toLowerCase()).not.toContain("fetch failed");

    fireEvent.click(screen.getByText("Retry now"));
    expect(onRetryDashboard).toHaveBeenCalledOnce();
  });
});
