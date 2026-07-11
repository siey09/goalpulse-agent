import { SignalArchivePanel } from "../../components/SignalArchivePanel";
import { SignalPerformancePanel } from "../../components/SignalPerformancePanel";
import { ConfidenceCalibrationPanel } from "../../components/ConfidenceCalibrationPanel";
import { VerifiedCaseStudiesPanel } from "../../components/VerifiedCaseStudiesPanel";

/**
 * Archive table first (the primary evidence), then aggregate
 * performance/calibration, then pinned case studies last - per the
 * blueprint: "Case studies are featured records, not the only evidence."
 */
export function ArchivePage() {
  return (
    <div className="space-y-4">
      <SignalArchivePanel />
      <SignalPerformancePanel />
      <ConfidenceCalibrationPanel />
      <VerifiedCaseStudiesPanel />
    </div>
  );
}
