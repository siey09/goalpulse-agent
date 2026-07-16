import { ArenaPanel } from "../../components/ArenaPanel";

export interface AgentArenaPageProps {
  onSelectSignalId?: (signalId: string) => void;
}

export function AgentArenaPage({ onSelectSignalId }: AgentArenaPageProps = {}) {
  return (
    <div id="guide-agent-arena" className="space-y-4">
      <ArenaPanel onSelectSignalId={onSelectSignalId} />
    </div>
  );
}
