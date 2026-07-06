import { Fingerprint, ShieldCheck } from "lucide-react";
import {
  PINNED_CASE_STUDIES,
  PINNED_CASE_STUDIES_PROVENANCE,
  type PinnedCaseStudy,
} from "../data/pinnedCaseStudies";

function resultBadgeClass(resultStatus: PinnedCaseStudy["resultStatus"]) {
  return resultStatus === "correct"
    ? "bg-emerald-400/10 text-emerald-200"
    : "bg-rose-400/10 text-rose-200";
}

function EvidenceRow({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="rounded-xl bg-black/25 p-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-stone-500">{label}</p>
      <p className="mt-1 break-words text-xs font-semibold text-stone-200">
        {value !== undefined && value !== "" ? String(value) : "—"}
      </p>
    </div>
  );
}

function CaseStudyCard({ caseStudy }: { caseStudy: PinnedCaseStudy }) {
  const scoresContext = caseStudy.evidence.scoresContext;
  const scoreBreakdown = scoresContext.scoreBreakdown;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            {caseStudy.match} → {caseStudy.target}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            {caseStudy.signalType.replaceAll("_", " ")} · {caseStudy.severity}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${resultBadgeClass(
            caseStudy.resultStatus
          )}`}
        >
          {caseStudy.resultStatus === "correct" ? "Correct" : "Incorrect"}
        </span>
      </div>

      <p className="mb-3 text-xs leading-5 text-stone-400">{caseStudy.explanation}</p>

      <div className="mb-3 grid grid-cols-3 gap-2 text-[11px]">
        <div className="rounded-lg bg-black/25 p-2 text-center">
          <p className="text-stone-500">Before</p>
          <p className="mt-1 font-semibold text-stone-100">{caseStudy.oddsBefore}</p>
        </div>
        <div className="rounded-lg bg-black/25 p-2 text-center">
          <p className="text-stone-500">After</p>
          <p className="mt-1 font-semibold text-stone-100">{caseStudy.oddsAfter}</p>
        </div>
        <div className="rounded-lg bg-black/25 p-2 text-center">
          <p className="text-stone-500">Move</p>
          <p className="mt-1 font-semibold text-orange-200">{caseStudy.oddsChangePct}%</p>
        </div>
      </div>

      {caseStudy.trapStatus && (
        <div className="mb-3 rounded-xl border border-red-400/20 bg-red-400/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-red-200/70">
              Smart Money Trap Detector
            </p>
            <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-red-100">
              Trap score {caseStudy.trapScore ?? 0}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-semibold text-purple-200">
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
    </div>
  );
}

export function VerifiedCaseStudiesPanel() {
  return (
    <section
      id="verified-case-studies"
      className="rounded-[28px] border border-amber-400/20 bg-[#15100c] p-5 shadow-2xl shadow-black/30"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">
            <ShieldCheck className="h-4 w-4" />
            Verified Case Studies — Permanent Record
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-stone-400">
            {PINNED_CASE_STUDIES_PROVENANCE}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-[11px] font-semibold text-amber-200">
          <Fingerprint className="h-3.5 w-3.5" />
          Pinned, not live
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {PINNED_CASE_STUDIES.map((caseStudy) => (
          <CaseStudyCard key={caseStudy.id} caseStudy={caseStudy} />
        ))}
      </div>
    </section>
  );
}
