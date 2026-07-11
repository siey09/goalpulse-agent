import { ShieldCheck } from "lucide-react";
import {
  PINNED_CASE_STUDIES,
  PINNED_CASE_STUDIES_PROVENANCE,
  type PinnedCaseStudy,
} from "../data/pinnedCaseStudies";
import { Card } from "./ui/Card";
import { StatusBadge } from "./ui/StatusBadge";
import { EvidenceStamp } from "./ui/EvidenceStamp";

function thresholdRule(severity: string) {
  if (severity === "HIGH") return "SHARP MOVE ≥ 15%";
  if (severity === "MEDIUM") return "MOMENTUM SHIFT ≥ 8%";
  return "WATCH ≥ 4%";
}

function EvidenceRow({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-surface-3 p-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-stone-500">{label}</p>
      <p className="mt-1 break-words font-mono text-xs font-semibold text-stone-200">
        {value !== undefined && value !== "" ? String(value) : "—"}
      </p>
    </div>
  );
}

function CaseStudyCard({ caseStudy }: { caseStudy: PinnedCaseStudy }) {
  const scoresContext = caseStudy.evidence.scoresContext;
  const scoreBreakdown = scoresContext.scoreBreakdown;

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            {caseStudy.match} → {caseStudy.target}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            {caseStudy.signalType.replaceAll("_", " ")} · {caseStudy.severity}
          </p>
        </div>
        <StatusBadge
          label={caseStudy.resultStatus === "correct" ? "Correct" : "Incorrect"}
          tone={caseStudy.resultStatus === "correct" ? "positive" : "danger"}
        />
      </div>

      <p className="mb-3 text-xs leading-5 text-stone-400">{caseStudy.explanation}</p>

      <div className="mb-3 grid grid-cols-3 gap-2 text-[11px]">
        <div className="rounded-lg border border-border bg-surface-3 p-2 text-center">
          <p className="text-stone-500">Before</p>
          <p className="mt-1 font-mono font-semibold text-stone-100">{caseStudy.oddsBefore}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface-3 p-2 text-center">
          <p className="text-stone-500">After</p>
          <p className="mt-1 font-mono font-semibold text-stone-100">{caseStudy.oddsAfter}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface-3 p-2 text-center">
          <p className="text-stone-500">Move</p>
          <p className="mt-1 font-mono font-semibold text-accent-soft">{caseStudy.oddsChangePct}%</p>
        </div>
      </div>

      {caseStudy.trapStatus && (
        <div className="mb-3 rounded-xl border border-danger/20 bg-danger/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-danger/70">
              Failed Continuation Detector
            </p>
            <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-mono font-semibold text-danger">
              Reversal score {caseStudy.trapScore ?? 0}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-semibold text-proof">
            {(caseStudy.reversalRisk ?? "REVERSAL_SCAN").replaceAll("_", " ")}
          </p>
        </div>
      )}

      <div className="grid gap-2 text-[11px] md:grid-cols-2">
        <EvidenceRow label="Fixture ID" value={caseStudy.evidence.fixtureId} />
        <EvidenceRow label="Message ID" value={caseStudy.evidence.messageId} />
        <EvidenceRow label="Bookmaker" value={caseStudy.evidence.bookmaker} />
        <EvidenceRow label="Odds endpoint" value={caseStudy.evidence.endpointUsed} />
        <EvidenceRow label="Scoreline" value={scoresContext.scoreline} />
        <EvidenceRow label="Reliability" value={scoresContext.reliability} />
        <EvidenceRow label="H1 goals" value={scoreBreakdown.h1} />
        <EvidenceRow label="H2 goals" value={scoreBreakdown.h2} />
        <EvidenceRow label="Total goals" value={scoreBreakdown.total ?? scoreBreakdown.goals} />
        <EvidenceRow label="Corners" value={scoreBreakdown.corners} />
        <EvidenceRow label="Yellow cards" value={scoreBreakdown.yellowCards} />
        <EvidenceRow label="Red cards" value={scoreBreakdown.redCards} />
      </div>

      <EvidenceStamp
        rule={thresholdRule(caseStudy.severity)}
        delta={`Δ ${caseStudy.oddsChangePct}%`}
        reference={`#${caseStudy.evidence.fixtureId}`}
        tone={caseStudy.severity === "HIGH" ? "accent" : "neutral"}
      />
    </Card>
  );
}

export function VerifiedCaseStudiesPanel() {
  return (
    <Card id="verified-case-studies" className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-accent-soft">
            <ShieldCheck className="h-4 w-4" />
            Verified Case Studies — Permanent Record
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-stone-400">
            {PINNED_CASE_STUDIES_PROVENANCE}
          </p>
        </div>
        <StatusBadge label="Pinned, not live" tone="accent" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {PINNED_CASE_STUDIES.map((caseStudy) => (
          <CaseStudyCard key={caseStudy.id} caseStudy={caseStudy} />
        ))}
      </div>
    </Card>
  );
}
