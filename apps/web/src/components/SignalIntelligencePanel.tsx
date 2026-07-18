import {
  Activity,
  CheckCircle2,
  Database,
  Fingerprint,
  GitBranch,
  Radar,
  ShieldCheck,
  TrendingDown,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card } from "./ui/Card";
import { EmptyState } from "./ui/EmptyState";
import { SectionHeader } from "./ui/SectionHeader";
import { StatusBadge, type StatusTone } from "./ui/StatusBadge";
import { StatusCapsule } from "./ui/widgets/StatusCapsule";
import { EvidenceStamp } from "./ui/EvidenceStamp";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";

type TxLineScoresContext = {
  fixtureId?: string;
  endpointUsed?: string;
  latestAction?: string;
  actionLabel?: string;
  actionTeam?: "home" | "away" | "neutral" | "unknown";
  statusId?: number;
  statusName?: string;
  clockSeconds?: number;
  minute?: number;
  homeScore?: number;
  awayScore?: number;
  scoreline?: string;
  possessionType?: string;
  pressureLevel?: "NONE" | "SAFE" | "ATTACK" | "DANGER" | "HIGH_DANGER";
  fieldPressureScore?: number;
  reliability?: "RELIABLE" | "UNRELIABLE" | "SUSPENDED" | "UNKNOWN";
  reliabilityReason?: string;
  confirmed?: boolean;
  sequence?: number;
  timestamp?: string;
  proofLabel?: string;
};

type SignalEvidence = {
  source?: string;
  fixtureId?: string;
  endpointUsed?: string;
  bookmaker?: string;
  messageId?: string;
  marketType?: string;
  previousSnapshotId?: string;
  currentSnapshotId?: string;
  previousTimestamp?: string;
  currentTimestamp?: string;
  scoresContext?: TxLineScoresContext;
  proofLabel?: string;
};

type AgentSignal = {
  id: string;
  match: string;
  target: string;
  signalType: string;
  severity: string;
  oddsBefore: number;
  oddsAfter: number;
  oddsChangePct: number;
  momentumScore?: number;
  resultStatus: string;
  createdAt: string;
  explanation?: string;
  evidence?: SignalEvidence;
};

type Health = {
  ok?: boolean;
  useSimulatedFeed?: boolean;
  txlineBaseUrl?: string;
};

type Stats = {
  txlineUpdates?: number;
  signalsGenerated?: number;
  highSeverity?: number;
  pendingSignals?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function calculateConfidence(signal?: AgentSignal) {
  if (!signal) return 0;

  const movementScore = clamp(signal.oddsChangePct * 3.2, 0, 55);
  const severityScore =
    signal.severity === "HIGH" ? 25 : signal.severity === "MEDIUM" ? 16 : 8;
  const evidenceScore = signal.evidence?.messageId ? 15 : 5;
  const sourceScore = signal.evidence?.source === "txline" ? 5 : 0;
  const fieldPressureScore = clamp(
    (signal.evidence?.scoresContext?.fieldPressureScore ?? 0) * 0.35,
    0,
    16
  );
  const reliabilityPenalty =
    signal.evidence?.scoresContext?.reliability === "SUSPENDED"
      ? 14
      : signal.evidence?.scoresContext?.reliability === "UNRELIABLE"
        ? 8
        : 0;

  return Math.round(
    clamp(
      movementScore +
        severityScore +
        evidenceScore +
        sourceScore +
        fieldPressureScore -
        reliabilityPenalty,
      0,
      100
    )
  );
}

function compact(value?: string, max = 48) {
  if (!value) return "—";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function severityTone(severity?: string): StatusTone {
  if (severity === "HIGH") return "danger";
  if (severity === "MEDIUM") return "warning";
  return "info";
}

function thresholdRule(severity?: string) {
  if (severity === "HIGH") return "SHARP MOVE ≥ 15%";
  if (severity === "MEDIUM") return "MOMENTUM SHIFT ≥ 8%";
  return "WATCH ≥ 4%";
}

function thresholdValue(severity?: string) {
  if (severity === "HIGH") return 15;
  if (severity === "MEDIUM") return 8;
  return 4;
}

export function SignalIntelligencePanel() {
  const [health, setHealth] = useState<Health | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [signals, setSignals] = useState<AgentSignal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadIntelligence() {
      try {
        const [healthResponse, statsResponse, signalsResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/health`),
          fetch(`${API_BASE_URL}/api/stats`),
          fetch(`${API_BASE_URL}/api/signals`),
        ]);

        const healthData = (await healthResponse.json()) as Health;
        const statsEnvelope = (await statsResponse.json()) as Stats | { data?: Stats };
        const signalsEnvelope = (await signalsResponse.json()) as
          | AgentSignal[]
          | { data?: AgentSignal[] };

        const statsData: Stats =
          "data" in statsEnvelope && statsEnvelope.data
            ? statsEnvelope.data
            : (statsEnvelope as Stats);

        const signalsData = Array.isArray(signalsEnvelope)
          ? signalsEnvelope
          : Array.isArray(signalsEnvelope.data)
            ? signalsEnvelope.data
            : [];

        if (!mounted) return;

        setHealth(healthData);
        setStats(statsData);
        setSignals(signalsData);
      } catch (error) {
        console.error("Unable to load signal intelligence panel", error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadIntelligence();

    const timer = window.setInterval(loadIntelligence, 30000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const bestSignal = useMemo(() => {
    return (
      signals.find(
        (signal) =>
          signal.evidence?.source === "txline" && signal.severity === "HIGH"
      ) ??
      signals.find((signal) => signal.evidence?.source === "txline") ??
      signals[0]
    );
  }, [signals]);

  const confidence = calculateConfidence(bestSignal);
  const scoresContext = bestSignal?.evidence?.scoresContext;
  const selectedFieldPressure = scoresContext?.fieldPressureScore ?? 0;
  const fieldContextLabel =
    selectedFieldPressure >= 22
      ? "FIELD-BACKED MOVE"
      : scoresContext
        ? "MARKET-ONLY MOVE"
        : "NO FIELD CONTEXT";
  const fieldBackedSignals = signals.filter(
    (signal) => (signal.evidence?.scoresContext?.fieldPressureScore ?? 0) >= 22
  ).length;
  const isRealFeed = health?.useSimulatedFeed === false;
  const verifiedSnapshots = stats?.txlineUpdates ?? 0;
  const generatedSignals = stats?.signalsGenerated ?? signals.length;
  const rejectedNoise = Math.max(verifiedSnapshots - generatedSignals, 0);

  return (
    <Card id="signal-intelligence" className="p-5">
      <SectionHeader
        eyebrow="Signal Intelligence Layer"
        title="Explainable TxLINE market forensics"
        action={
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-3 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-positive" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Feed status</p>
              <p className="text-xs font-semibold text-stone-200">
                {isRealFeed ? "Real TxLINE API" : "Sandbox / Demo Feed"}
              </p>
            </div>
          </div>
        }
      />
      <p className="-mt-3 mb-5 max-w-3xl text-sm leading-6 text-stone-400">
        GoalPulse does not simply list odds. It detects market movement, filters noise, explains the decision
        path, and attaches TxLINE evidence fields for judge-verifiable signal review.
      </p>

      <div className="grid gap-4 md:grid-cols-4">
        <StatusCapsule
          icon={<Database className="h-4 w-4" />}
          label="Verified snapshots"
          value={isLoading ? "..." : verifiedSnapshots}
          tone="positive"
        />
        <StatusCapsule
          icon={<Radar className="h-4 w-4" />}
          label="Signals detected"
          value={isLoading ? "..." : generatedSignals}
          tone="info"
        />
        <StatusCapsule
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Noise filtered"
          value={isLoading ? "..." : rejectedNoise}
          tone="neutral"
        />
        <StatusCapsule
          icon={<Activity className="h-4 w-4" />}
          label="Field-backed"
          value={isLoading ? "..." : fieldBackedSignals}
          tone="neutral"
        />
      </div>

      {bestSignal ? (
        <div className="mt-5 grid gap-4 2xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-xl border border-border bg-surface-1 p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-2">
                  <StatusBadge
                    label={fieldContextLabel}
                    tone={selectedFieldPressure >= 22 ? "positive" : "neutral"}
                  />
                </div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500">Best current signal</p>
                <h3 className="mt-1 font-display text-xl font-bold tracking-tight text-white">
                  {bestSignal.match} → {bestSignal.target}
                </h3>
                <p className="mt-1 text-sm text-stone-400">
                  {bestSignal.explanation ?? "Market movement detected from TxLINE odds updates."}
                </p>
              </div>

              <StatusBadge label={`${bestSignal.signalType?.replaceAll("_", " ")} / ${bestSignal.severity}`} tone={severityTone(bestSignal.severity)} withDot />
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-xl border border-border bg-surface-3 p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-stone-500">
                  <TrendingDown className="h-4 w-4" />
                  Odds move
                </div>
                <p className="mt-2 font-mono text-2xl font-semibold text-white">
                  {bestSignal.oddsBefore} → {bestSignal.oddsAfter}
                </p>
              </div>

              <div className="rounded-xl border border-border bg-surface-3 p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-stone-500">
                  <Activity className="h-4 w-4" />
                  Compression
                </div>
                <p className="mt-2 font-mono text-2xl font-semibold text-accent-soft">
                  {bestSignal.oddsChangePct}%
                </p>
              </div>

              <div className="rounded-xl border border-border bg-surface-3 p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-stone-500">
                  <ShieldCheck className="h-4 w-4" />
                  Confidence
                </div>
                <p className="mt-2 font-mono text-2xl font-semibold text-info">{confidence}/100</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-border bg-surface-3 p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
                <Radar className="h-4 w-4" />
                TXODDS field context
              </div>

              {scoresContext ? (
                <>
                  <div className="grid gap-3">
                    <EvidenceRow label="Latest Field Action" value={scoresContext.actionLabel ?? scoresContext.latestAction} />
                    <EvidenceRow label="Pressure Level" value={scoresContext.pressureLevel} />
                    <EvidenceRow label="Pressure Score" value={scoresContext.fieldPressureScore !== undefined ? `${scoresContext.fieldPressureScore}/45` : undefined} />
                    <EvidenceRow label="Reliability" value={scoresContext.reliability} />
                    <EvidenceRow label="Match Phase" value={scoresContext.statusName} />
                    <EvidenceRow label="Scoreline" value={scoresContext.scoreline} />
                  </div>

                  <p className="mt-3 text-xs leading-5 text-stone-400">
                    GoalPulse now checks whether market movement is supported by on-field context such as goals, shots, VAR, cards, penalties, or danger possession.
                  </p>
                </>
              ) : (
                <EmptyState reason="No live match in progress for this signal yet - on-field context (goals, shots, cards, pressure) becomes available once kickoff starts." />
              )}
            </div>

            <div className="mt-4 rounded-xl border border-border bg-surface-3 p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
                <GitBranch className="h-4 w-4" />
                Agent decision path
              </div>

              <div className="grid gap-2 text-sm text-stone-300">
                <DecisionStep number="01" text="Pulled TxLINE odds updates" />
                <DecisionStep number="02" text="Selected 1X2 main market" />
                <DecisionStep number="03" text="Compared previous/current snapshots" />
                <DecisionStep number="04" text="Calculated odds compression" />
                <DecisionStep number="05" text="Correlated TXODDS field context" />
                <DecisionStep number="06" text="Applied reliability and pressure scoring" />
              </div>
            </div>

            <EvidenceStamp
              rule={thresholdRule(bestSignal.severity)}
              delta={`Δ ${bestSignal.oddsChangePct}%`}
              reference={bestSignal.evidence?.fixtureId ? `#${bestSignal.evidence.fixtureId}` : undefined}
              tone={severityTone(bestSignal.severity) === "danger" ? "accent" : "neutral"}
              gauge={{
                threshold: thresholdValue(bestSignal.severity),
                value: Math.abs(bestSignal.oddsChangePct),
                max: 30,
              }}
            />
          </div>

          <div className="rounded-xl border border-border bg-surface-1 p-5">
            <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
              <Fingerprint className="h-4 w-4" />
              TxLINE evidence chain
            </div>

            <div className="space-y-3">
              <EvidenceRow label="Fixture ID" value={bestSignal.evidence?.fixtureId} mono />
              <EvidenceRow label="Endpoint" value={bestSignal.evidence?.endpointUsed} mono />
              <EvidenceRow label="Bookmaker" value={bestSignal.evidence?.bookmaker} />
              <EvidenceRow label="Market Type" value={bestSignal.evidence?.marketType} />
              <EvidenceRow label="Message ID" value={bestSignal.evidence?.messageId} mono />
              <EvidenceRow
                label="Previous Snapshot"
                value={compact(bestSignal.evidence?.previousSnapshotId, 72)}
                mono
              />
              <EvidenceRow
                label="Current Snapshot"
                value={compact(bestSignal.evidence?.currentSnapshotId, 72)}
                mono
              />
              <EvidenceRow
                label="Scores Endpoint"
                value={bestSignal.evidence?.scoresContext?.endpointUsed}
                mono
              />
              <EvidenceRow
                label="Latest Scores Action"
                value={bestSignal.evidence?.scoresContext?.actionLabel ?? bestSignal.evidence?.scoresContext?.latestAction}
              />
              <EvidenceRow
                label="Scores Proof"
                value={bestSignal.evidence?.scoresContext?.proofLabel}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-border bg-surface-3 p-5 text-sm text-stone-400">
          Waiting for live TxLINE signals. Run the agent cycle or wait for the backend refresh interval.
        </div>
      )}
    </Card>
  );
}

function DecisionStep({ number, text }: { number: string; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-black/25 p-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-info/10 font-mono text-[11px] font-bold text-info">
        {number}
      </span>
      <span>{text}</span>
    </div>
  );
}

function EvidenceRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value?: string | number;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl bg-black/25 p-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500">
        {label}
      </p>
      <p
        className={`mt-1 break-words text-stone-200 ${
          mono ? "font-mono text-[10px] leading-4" : "text-sm font-medium leading-5"
        }`}
      >
        {value !== undefined && value !== "" ? String(value) : "—"}
      </p>
    </div>
  );
}
