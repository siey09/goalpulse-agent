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
      <SignalArchivePanel onSelectSignal={onSelectSignal} />
      <SignalPerformancePanel />
      <ConfidenceCalibrationPanel />
      <VerifiedCaseStudiesPanel />
    </div>
  );
}
