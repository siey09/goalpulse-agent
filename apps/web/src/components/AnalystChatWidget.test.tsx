import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnalystChatWidget, type AnalystChatMessage } from "./AnalystChatWidget";

const baseProps = {
  isOpen: true,
  onToggleOpen: vi.fn(),
  onClose: vi.fn(),
  question: "",
  onQuestionChange: vi.fn(),
  onSend: vi.fn(),
  onCommand: vi.fn(),
  isReplying: false,
};

function renderMessages(messages: AnalystChatMessage[]) {
  return render(<AnalystChatWidget {...baseProps} messages={messages} />);
}

describe("AnalystChatWidget feature guide", () => {
  it("renders the grouped feature index and sends a selected feature command", () => {
    const onCommand = vi.fn();
    const messages: AnalystChatMessage[] = [
      {
        role: "assistant",
        reply: {
          kind: "feature-index",
          content: "Explore how GoalPulse works.",
          featureIds: ["confidence-score", "kelly-criterion", "solana-verification", "system-health"],
        },
      },
    ];

    render(<AnalystChatWidget {...baseProps} messages={messages} onCommand={onCommand} />);

    expect(screen.getByText("Live intelligence")).toBeInTheDocument();
    expect(screen.getByText("Strategy")).toBeInTheDocument();
    expect(screen.getByText("Trust & verification")).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Composite Confidence Score/i }));
    expect(onCommand).toHaveBeenCalledWith("/features confidence");
  });

  it("renders a feature's workflow, formulas, evidence, and honest limitation", () => {
    renderMessages([
      {
        role: "assistant",
        reply: {
          kind: "feature-detail",
          content: "Confidence detail",
          featureId: "confidence-score",
        },
      },
    ]);

    expect(screen.getByRole("heading", { name: "Composite Confidence Score" })).toBeInTheDocument();
    expect(screen.getByText("How it works")).toBeInTheDocument();
    expect(screen.getByText("Formula & rules")).toBeInTheDocument();
    expect(screen.getByText(/Base score = weighted mean/i)).toBeInTheDocument();
    expect(screen.getByText(/Weights and the 3.0 longshot boundary/i)).toBeInTheDocument();
    expect(screen.getByText(/not a literal probability of winning/i)).toBeInTheDocument();
  });

  it("renders help and exposes starter commands", () => {
    renderMessages([
      {
        role: "assistant",
        reply: {
          kind: "help",
          content: "Use /features to browse, then /features <name> for detail.",
        },
      },
    ]);

    expect(screen.getAllByText(/\/features <name>/i)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Explore all features" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show command help" })).toBeInTheDocument();
  });

  it("continues to render ordinary analyst text replies", () => {
    renderMessages([
      {
        role: "assistant",
        reply: { kind: "text", content: "Latest live signal: Colombia vs Ghana." },
      },
    ]);

    expect(screen.getByText("Latest live signal: Colombia vs Ghana.")).toBeInTheDocument();
  });

  it("scrolls a newly appended reply into view", () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLDivElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    const initialMessages: AnalystChatMessage[] = [
      { role: "user", reply: { kind: "text", content: "/features" } },
    ];
    const { rerender } = render(<AnalystChatWidget {...baseProps} messages={initialMessages} />);
    scrollTo.mockClear();

    rerender(
      <AnalystChatWidget
        {...baseProps}
        messages={[
          ...initialMessages,
          {
            role: "assistant",
            reply: {
              kind: "feature-detail",
              content: "Confidence detail",
              featureId: "confidence-score",
            },
          },
        ]}
      />
    );

    expect(scrollTo).toHaveBeenCalledWith({ behavior: "smooth", top: 0 });
  });
});
