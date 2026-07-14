import { SignalArchivePanel } from "../../components/SignalArchivePanel";
import { SignalPerformancePanel } from "../../components/SignalPerformancePanel";
import { ConfidenceCalibrationPanel } from "../../components/ConfidenceCalibrationPanel";
import { VerifiedCaseStudiesPanel } from "../../components/VerifiedCaseStudiesPanel";
import type { AgentSignal } from "../../types";

export interface ArchivePageProps {
  onSelectSignal?: (signal: AgentSignal) => void;
}

/**
 * Archive table first (the primary evidence), then aggregate
 * performance/calibration, then pinned case studies last - case studies
 * are featured records, not the only evidence.
 */
export function ArchivePage({ onSelectSignal }: ArchivePageProps = {}) {
  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-proof">
            Trust / permanent record
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-white">
            Signal Archive
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-400">
            Search every recorded market signal, inspect its audit trail, and compare confidence with settled outcomes.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-stone-400">
          <span className="h-2 w-2 rounded-full bg-proof" aria-hidden="true" />
          Write-once evidence view
        </div>
      </header>

      <SignalArchivePanel onSelectSignal={onSelectSignal} />

      <section aria-label="Historical performance" className="grid items-start gap-4 xl:grid-cols-2">
        <SignalPerformancePanel />
        <ConfidenceCalibrationPanel />
      </section>

      <VerifiedCaseStudiesPanel />
    </div>
  );
}
