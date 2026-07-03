import {
  Activity,
  CheckCircle2,
  Database,
  Fingerprint,
  GitBranch,
  Radar,
  ShieldCheck,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
    <section
      id="signal-intelligence"
      className="rounded-[28px] border border-emerald-400/20 bg-gradient-to-br from-[#10140f] via-[#11100d] to-[#070706] p-5 shadow-2xl shadow-emerald-950/20"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">
            <Sparkles className="h-4 w-4" />
            Signal Intelligence Layer
          </div>

          <h2 className="mt-2 text-2xl font-semibold text-white">
            Explainable TxLINE market forensics
          </h2>

          <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-400">
            GoalPulse does not simply list odds. It detects market movement,
            filters noise, explains the decision path, and attaches TxLINE
            evidence fields for judge-verifiable signal review.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-emerald-300">
            Feed Status
          </p>
          <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-emerald-100">
            <CheckCircle2 className="h-4 w-4" />
            {isRealFeed ? "Real TxLINE API" : "Sandbox / Demo Feed"}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard
          icon={<Database className="h-4 w-4" />}
          label="Verified snapshots"
          value={isLoading ? "..." : String(verifiedSnapshots)}
          tone="emerald"
        />
        <MetricCard
          icon={<Radar className="h-4 w-4" />}
          label="Signals detected"
          value={isLoading ? "..." : String(generatedSignals)}
          tone="orange"
        />
        <MetricCard
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Noise filtered"
          value={isLoading ? "..." : String(rejectedNoise)}
          tone="slate"
        />
        <MetricCard
          icon={<Activity className="h-4 w-4" />}
          label="Field-backed"
          value={isLoading ? "..." : String(fieldBackedSignals)}
          tone="rose"
        />
      </div>

      {bestSignal ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-2 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200">
                  {fieldContextLabel}
                </div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500">
                  Best current signal
                </p>
                <h3 className="mt-1 text-xl font-semibold text-white">
                  {bestSignal.match} → {bestSignal.target}
                </h3>
                <p className="mt-1 text-sm text-stone-400">
                  {bestSignal.explanation ??
                    "Market movement detected from TxLINE odds updates."}
                </p>
              </div>

              <div className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-xs font-semibold text-orange-200">
                {bestSignal.signalType?.replaceAll("_", " ")} /{" "}
                {bestSignal.severity}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-[#0b0806] p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-stone-500">
                  <TrendingDown className="h-4 w-4" />
                  Odds move
                </div>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {bestSignal.oddsBefore} → {bestSignal.oddsAfter}
                </p>
              </div>

              <div className="rounded-2xl bg-[#0b0806] p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-stone-500">
                  <Activity className="h-4 w-4" />
                  Compression
                </div>
                <p className="mt-2 text-2xl font-semibold text-emerald-300">
                  {bestSignal.oddsChangePct}%
                </p>
              </div>

              <div className="rounded-2xl bg-[#0b0806] p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-stone-500">
                  <ShieldCheck className="h-4 w-4" />
                  Confidence
                </div>
                <p className="mt-2 text-2xl font-semibold text-sky-300">
                  {confidence}/100
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-emerald-400/10 bg-emerald-400/5 p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">
                <Radar className="h-4 w-4" />
                TXODDS field context
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <EvidenceRow label="Latest Field Action" value={scoresContext?.actionLabel ?? scoresContext?.latestAction} />
                <EvidenceRow label="Pressure Level" value={scoresContext?.pressureLevel} />
                <EvidenceRow label="Pressure Score" value={scoresContext?.fieldPressureScore !== undefined ? `${scoresContext.fieldPressureScore}/45` : undefined} />
                <EvidenceRow label="Reliability" value={scoresContext?.reliability} />
                <EvidenceRow label="Match Phase" value={scoresContext?.statusName} />
                <EvidenceRow label="Scoreline" value={scoresContext?.scoreline} />
              </div>

              <p className="mt-3 text-xs leading-5 text-stone-400">
                GoalPulse now checks whether market movement is supported by on-field context such as goals, shots, VAR, cards, penalties, or danger possession.
              </p>
            </div>

            <div className="mt-4 rounded-2xl border border-sky-400/10 bg-sky-400/5 p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">
                <GitBranch className="h-4 w-4" />
                Agent decision path
              </div>

              <div className="grid gap-2 text-sm text-stone-300 md:grid-cols-2">
                <DecisionStep number="01" text="Pulled TxLINE odds updates" />
                <DecisionStep number="02" text="Selected 1X2 main market" />
                <DecisionStep number="03" text="Compared previous/current snapshots" />
                <DecisionStep number="04" text="Calculated odds compression" />
                <DecisionStep number="05" text="Correlated TXODDS field context" />
                <DecisionStep number="06" text="Applied reliability and pressure scoring" />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
            <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
              <Fingerprint className="h-4 w-4" />
              TxLINE evidence chain
            </div>

            <div className="space-y-3">
              <EvidenceRow label="Fixture ID" value={bestSignal.evidence?.fixtureId} />
              <EvidenceRow label="Endpoint" value={bestSignal.evidence?.endpointUsed} />
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
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-5 text-sm text-stone-400">
          Waiting for live TxLINE signals. Run the agent cycle or wait for the
          backend refresh interval.
        </div>
      )}
    </section>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "emerald" | "orange" | "rose" | "slate";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-200 border-emerald-400/20 bg-emerald-400/10"
      : tone === "orange"
      ? "text-orange-200 border-orange-400/20 bg-orange-400/10"
      : tone === "rose"
      ? "text-rose-200 border-rose-400/20 bg-rose-400/10"
      : "text-stone-200 border-white/10 bg-white/5";

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] opacity-80">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function DecisionStep({ number, text }: { number: string; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-black/25 p-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-400/10 text-[11px] font-bold text-sky-200">
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
    <div className="rounded-2xl bg-[#0b0806] p-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500">
        {label}
      </p>
      <p
        className={`mt-1 break-all text-stone-200 ${
          mono ? "font-mono text-[11px]" : "text-sm font-medium"
        }`}
      >
        {value !== undefined && value !== "" ? String(value) : "—"}
      </p>
    </div>
  );
}





