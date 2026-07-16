import { BookOpen, ChevronRight, HelpCircle, MessagesSquare, Send, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  FEATURE_CATEGORY_LABELS,
  GOALPULSE_FEATURES,
  type AnalystReply,
  type FeatureCategory,
} from "../lib/goalPulseFeatureCatalog";

export interface AnalystChatMessage {
  role: "user" | "assistant";
  reply: AnalystReply;
}

export interface AnalystChatWidgetProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
  messages: AnalystChatMessage[];
  question: string;
  onQuestionChange: (value: string) => void;
  onSend: () => void;
  onCommand: (command: string) => void;
  isReplying: boolean;
}

const CATEGORY_ORDER: FeatureCategory[] = ["live-intelligence", "strategy", "trust", "operations"];

function FeatureIndexReply({
  reply,
  onCommand,
}: {
  reply: Extract<AnalystReply, { kind: "feature-index" }>;
  onCommand: (command: string) => void;
}) {
  const visibleFeatures = GOALPULSE_FEATURES.filter((feature) => reply.featureIds.includes(feature.id));

  return (
    <div>
      <p className="text-[11px] leading-5 text-stone-300">{reply.content}</p>
      <div className="mt-3 space-y-3">
        {CATEGORY_ORDER.map((category) => {
          const features = visibleFeatures.filter((feature) => feature.category === category);
          if (features.length === 0) return null;

          return (
            <section key={category} aria-labelledby={`feature-category-${category}`}>
              <h3
                id={`feature-category-${category}`}
                className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-stone-500"
              >
                {FEATURE_CATEGORY_LABELS[category]}
              </h3>
              <div className="grid grid-cols-2 gap-1.5">
                {features.map((feature) => (
                  <button
                    key={feature.id}
                    type="button"
                    onClick={() => onCommand(`/features ${feature.aliases[0]}`)}
                    aria-label={`Explain ${feature.name}`}
                    className="group flex min-h-12 items-center justify-between gap-2 rounded-lg border border-white/8 bg-black/20 px-2.5 py-2 text-left text-[10px] font-semibold leading-4 text-stone-200 transition hover:border-info/35 hover:bg-info/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/70"
                  >
                    <span>{feature.shortName}</span>
                    <ChevronRight className="h-3 w-3 shrink-0 text-stone-600 transition group-hover:translate-x-0.5 group-hover:text-info-200" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function FeatureDetailReply({ reply }: { reply: Extract<AnalystReply, { kind: "feature-detail" }> }) {
  const feature = GOALPULSE_FEATURES.find((entry) => entry.id === reply.featureId);
  if (!feature) return <p>{reply.content}</p>;

  return (
    <article>
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-info/20 bg-info/10 text-info-200">
          <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-info-200/65">
            {FEATURE_CATEGORY_LABELS[feature.category]}
          </p>
          <h3 className="mt-0.5 font-display text-sm font-bold leading-5 text-white">{feature.name}</h3>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-5 text-stone-300">{feature.summary}</p>

      <section className="mt-3 border-t border-white/8 pt-3">
        <h4 className="font-mono text-[9px] uppercase tracking-[0.2em] text-stone-500">How it works</h4>
        <ol className="mt-2 space-y-2">
          {feature.implementation.map((step, index) => (
            <li key={step} className="flex gap-2 text-[10px] leading-4 text-stone-300">
              <span className="font-mono text-info-200/60">{String(index + 1).padStart(2, "0")}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-3 rounded-lg border border-accent/15 bg-accent/5 p-2.5">
        <h4 className="font-mono text-[9px] uppercase tracking-[0.2em] text-accent-200/70">Formula &amp; rules</h4>
        <ul className="mt-1.5 space-y-1.5">
          {feature.formulas.map((formula) => (
            <li key={formula} className="font-mono text-[9px] leading-4 text-stone-200">{formula}</li>
          ))}
        </ul>
      </section>

      <div className="mt-3 space-y-2 border-t border-white/8 pt-3 text-[10px] leading-4">
        <div className="flex gap-2 text-stone-400">
          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-positive" aria-hidden="true" />
          <p><span className="font-semibold text-stone-300">Evidence:</span> {feature.evidence}</p>
        </div>
        <div className="flex gap-2 text-stone-500">
          <HelpCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <p><span className="font-semibold text-stone-400">Limit:</span> {feature.limitation}</p>
        </div>
      </div>
    </article>
  );
}

function ReplyBody({ reply, onCommand }: { reply: AnalystReply; onCommand: (command: string) => void }) {
  if (reply.kind === "feature-index") return <FeatureIndexReply reply={reply} onCommand={onCommand} />;
  if (reply.kind === "feature-detail") return <FeatureDetailReply reply={reply} />;

  if (reply.kind === "help") {
    return (
      <div>
        <p>{reply.content}</p>
        <div className="mt-3 rounded-lg border border-white/8 bg-black/20 p-2.5 font-mono text-[9px] leading-5 text-stone-300">
          <p><span className="text-info-200">/features</span> — browse the complete catalog</p>
          <p><span className="text-info-200">/features &lt;name&gt;</span> — open one technical explanation</p>
          <p><span className="text-info-200">/help</span> — show command guidance</p>
        </div>
      </div>
    );
  }

  return <p>{reply.content}</p>;
}

/** Shared deterministic analyst chat for every dashboard destination. */
export function AnalystChatWidget({
  isOpen,
  onToggleOpen,
  onClose,
  messages,
  question,
  onQuestionChange,
  onSend,
  onCommand,
  isReplying,
}: AnalystChatWidgetProps) {
  const conversationRef = useRef<HTMLDivElement>(null);
  const latestReplyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const conversation = conversationRef.current;
    const latestReply = latestReplyRef.current;
    if (conversation && latestReply && typeof conversation.scrollTo === "function") {
      conversation.scrollTo({
        behavior: "smooth",
        top: Math.max(latestReply.offsetTop - conversation.offsetTop, 0),
      });
    }
  }, [isOpen, isReplying, messages.length]);

  return (
    <>
      <button
        type="button"
        onClick={onToggleOpen}
        aria-label={isOpen ? "Close analyst chat" : "Ask GoalPulse"}
        className="fixed bottom-4 left-4 z-[80] flex items-center gap-2 rounded-full border border-info/30 bg-info-500 px-4 py-2.5 text-xs font-bold text-white shadow-2xl shadow-info-500/25 transition hover:bg-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info-200"
      >
        <MessagesSquare className="h-4 w-4" aria-hidden="true" />
        Ask GoalPulse
      </button>

      {isOpen && (
        <div className="fixed bottom-20 left-4 z-[80] flex max-h-[min(680px,calc(100vh-6rem))] w-[430px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-info/25 bg-surface-1/95 shadow-2xl shadow-info-500/20 backdrop-blur-xl ring-1 ring-white/10">
          <div className="border-b border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-info-200/70">
                  GoalPulse Analyst Chat
                </p>
                <h2 className="mt-1 font-display text-sm font-bold text-white">Ask the intelligence engine</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close analyst chat"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-white/5 text-stone-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/70"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-stone-400">
              Live answers plus a source-backed guide to every GoalPulse system. No external model call.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                aria-label="Explore all features"
                onClick={() => onCommand("/features")}
                disabled={isReplying}
                className="rounded-full border border-info/25 bg-info/10 px-2.5 py-1 font-mono text-[9px] text-info-100 transition hover:bg-info/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/70 disabled:opacity-50"
              >
                /features
              </button>
              <button
                type="button"
                aria-label="Show command help"
                onClick={() => onCommand("/help")}
                disabled={isReplying}
                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[9px] text-stone-300 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/70 disabled:opacity-50"
              >
                /help
              </button>
            </div>
          </div>

          <div ref={conversationRef} className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite" aria-label="GoalPulse conversation">
            {messages.length === 0 && !isReplying && (
              <p className="text-xs leading-5 text-stone-500">
                Type <span className="font-mono text-info-200">/features</span> to inspect the system, or ask about live signals, reversals, scores, and verification.
              </p>
            )}
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                ref={index === messages.length - 1 && !isReplying ? latestReplyRef : undefined}
                className={`rounded-xl border p-3 text-xs leading-5 ${
                  message.role === "assistant"
                    ? "border-info/15 bg-info/10 text-info-100"
                    : "ml-8 border-border bg-white/5 text-stone-200"
                }`}
              >
                <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-stone-500">
                  {message.role === "assistant" ? "GoalPulse" : "You"}
                </p>
                <ReplyBody reply={message.reply} onCommand={onCommand} />
              </div>
            ))}
            {isReplying && (
              <div ref={latestReplyRef} className="rounded-xl border border-info/15 bg-info/10 p-3 text-xs leading-5 text-info-100">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-stone-400">GoalPulse</p>
                <span className="inline-flex items-center gap-1">
                  GoalPulse is thinking
                  <span className="inline-flex gap-0.5">
                    <span className="h-1 w-1 animate-bounce rounded-full bg-info-200 [animation-delay:-0.2s]" />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-info-200 [animation-delay:-0.1s]" />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-info-200" />
                  </span>
                </span>
              </div>
            )}
          </div>

          <div className="border-t border-border p-3">
            <div className="flex gap-2">
              <input
                value={question}
                onChange={(event) => onQuestionChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSend();
                }}
                placeholder="Ask live data or type /features…"
                aria-label="Ask GoalPulse a question"
                disabled={isReplying}
                className="min-w-0 flex-1 rounded-full border border-border bg-black/30 px-3.5 py-2 text-xs text-white outline-none placeholder:text-stone-500 focus:border-info/40 focus-visible:ring-2 focus-visible:ring-info/40 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={onSend}
                disabled={isReplying}
                aria-label="Send question"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-info/30 bg-info-500 text-white transition hover:bg-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
