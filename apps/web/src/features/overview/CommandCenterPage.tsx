import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Radio, Signal as SignalIcon, Wallet } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { MetricCard } from "../../components/ui/MetricCard";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { EmptyState } from "../../components/ui/EmptyState";

export interface CommandCenterKpis {
  liveFixtures: number;
  feedFreshnessLabel: string;
  signalsInWindow: number;
  /** From the already-fetched /api/pnl endpoint's own openPositions count - a real
   * count of currently-pending simulated positions, not the Arena's per-strategy
   * count (that lives behind a separate, not-yet-centrally-fetched endpoint). */
  openSimulatedPositions: number;
}

export interface CommandCenterChartPoint {
  name: string;
  home?: number;
  away?: number;
}

export interface CommandCenterDecisionStep {
  title: string;
  detail: string;
  time: string;
}

export interface CommandCenterLatestSignal {
  severityLabel: string;
  target: string;
  priceMoveLabel: string;
}

export interface CommandCenterPageProps {
  kpis: CommandCenterKpis;
  selectedFixtureLabel: string;
  chartData: CommandCenterChartPoint[];
  decisionFeed: CommandCenterDecisionStep[];
  latestSignal: CommandCenterLatestSignal | null;
  systemHealthLabel: string;
}

/**
 * Command Center Phase 2: composed entirely from data App.tsx already
 * fetches on its normal 5s poll - no new API calls. Two of the blueprint's
 * five above-fold summary cards (Strategy Leader, Verification) need data
 * that currently only exists behind ArenaPanel/verification-specific
 * fetches, not App.tsx's central state; rather than add new fetching in
 * this phase or fabricate placeholder numbers, they're honestly shown as
 * not-yet-available here and left for Phase 3 when those destinations
 * exist and can own their own data.
 */
export function CommandCenterPage({
  kpis,
  selectedFixtureLabel,
  chartData,
  decisionFeed,
  latestSignal,
  systemHealthLabel,
}: CommandCenterPageProps) {
  return (
    <div id="guide-command-center-overview" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Live fixtures"
          value={kpis.liveFixtures}
          icon={<Radio className="h-4 w-4 text-info" />}
        />
        <MetricCard
          label="Feed freshness"
          value={kpis.feedFreshnessLabel}
          icon={<Activity className="h-4 w-4 text-positive" />}
        />
        <MetricCard
          label="Signals in window"
          value={kpis.signalsInWindow}
          icon={<SignalIcon className="h-4 w-4 text-accent-soft" />}
        />
        <MetricCard
          label="Open simulated positions"
          value={kpis.openSimulatedPositions}
          icon={<Wallet className="h-4 w-4 text-warning" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Card className="p-4 xl:col-span-8">
          <SectionHeader eyebrow="Selected fixture" title="Market Pulse" />
          <p className="mb-3 text-xs text-stone-500">{selectedFixtureLabel}</p>
          {chartData.length >= 2 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" stroke="#78716c" fontSize={10} />
                  <YAxis stroke="#78716c" fontSize={10} />
                  <Tooltip
                    contentStyle={{ background: "#15191d", border: "1px solid rgba(255,255,255,0.08)" }}
                  />
                  <Area type="monotone" dataKey="home" stroke="#f97316" fill="#f97316" fillOpacity={0.15} />
                  <Area type="monotone" dataKey="away" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.1} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState reason="Fewer than two comparable odds points yet - the chart will populate once the next tick arrives." />
          )}
        </Card>

        <Card id="guide-decision-feed" className="p-4 xl:col-span-4">
          <SectionHeader eyebrow="Autonomous flow" title="Decision Feed" />
          <ol className="space-y-3">
            {decisionFeed.map((step) => (
              <li key={step.title} className="border-l-2 border-accent/30 pl-3">
                <p className="text-[10px] uppercase tracking-[0.1em] text-stone-500">{step.time}</p>
                <p className="text-sm font-semibold text-white">{step.title}</p>
                <p className="text-xs text-stone-400">{step.detail}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Card className="p-4">
          <SectionHeader eyebrow="Autonomous decision" title="Latest Signal" />
          {latestSignal ? (
            <div>
              <p className="text-sm font-semibold text-white">
                {latestSignal.severityLabel} · {latestSignal.target}
              </p>
              <p className="text-xs text-stone-400">{latestSignal.priceMoveLabel}</p>
            </div>
          ) : (
            <EmptyState reason="No signal crossed the deterministic threshold in this window." />
          )}
        </Card>

        <Card className="p-4">
          <SectionHeader eyebrow="Strategy snapshot" title="Strategy Leader" />
          <EmptyState reason="Not available in this Phase 2 preview - Agent Arena has its own data source, wired in Phase 3." />
        </Card>

        <Card className="p-4">
          <SectionHeader eyebrow="Trust" title="Verification" />
          <EmptyState reason="Not available in this Phase 2 preview - Verification has its own data source, wired in Phase 3." />
        </Card>

        <Card className="p-4">
          <SectionHeader eyebrow="Trust" title="System Health" />
          <p className="text-sm font-semibold text-white">{systemHealthLabel}</p>
        </Card>
      </div>
    </div>
  );
}
