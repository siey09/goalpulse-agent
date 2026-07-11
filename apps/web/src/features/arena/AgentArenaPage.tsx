import { ArenaPanel } from "../../components/ArenaPanel";

export interface AgentArenaPageProps {
  onSelectSignalId?: (signalId: string) => void;
}

export function AgentArenaPage({ onSelectSignalId }: AgentArenaPageProps = {}) {
  return (
    <div className="space-y-4">
      <ArenaPanel onSelectSignalId={onSelectSignalId} />
    </div>
  );
}
