import { SignalIntelligencePanel } from "../../components/SignalIntelligencePanel";
import { SteamMoveDetectionPanel } from "../../components/SteamMoveDetectionPanel";
import { SignalCorrelationPanel } from "../../components/SignalCorrelationPanel";

/**
 * Composes three already-separate, self-fetching panels into one
 * destination. No panel's internal logic or props are touched - this is
 * pure placement, matching the blueprint's "keep component APIs
 * unchanged" rule for Phase 3.
 */
export function SignalsPage() {
  return (
    <div className="space-y-4">
      <SignalIntelligencePanel />
      <SteamMoveDetectionPanel />
      <SignalCorrelationPanel />
    </div>
  );
}
