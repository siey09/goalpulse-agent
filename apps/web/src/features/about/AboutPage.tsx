import {
  BookOpenText,
  ExternalLink,
  FileCode2,
  GitFork,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import {
  FEATURE_CATEGORY_LABELS,
  GOALPULSE_FEATURES,
  type FeatureCategory,
} from "../../lib/goalPulseFeatureCatalog";

const REPO_URL = "https://github.com/siey09/goalpulse-agent";

const LIVE_LINKS = [
  { label: "Frontend", href: "https://goalpulse-agent.vercel.app", description: "This dashboard" },
  { label: "Backend API", href: "https://goalpulse-agent-api.onrender.com/api/docs", description: "Interactive Swagger docs for the live API" },
  { label: "Health check", href: "https://goalpulse-agent-api.onrender.com/health", description: "Live agent + feed status" },
  { label: "API docs", href: "https://goalpulse-agent-api.onrender.com/api/docs", description: "Interactive OpenAPI / Swagger" },
  { label: "Repository", href: REPO_URL, description: "Source code on GitHub" },
  { label: "Discord community", href: "https://discord.gg/vCsA8Wuwh", description: "Alerts + discussion" },
];

const DOC_LINKS = [
  {
    label: "README",
    href: `${REPO_URL}/blob/main/README.md`,
    description: "Product overview, feature list, and live links.",
  },
  {
    label: "Technical documentation",
    href: `${REPO_URL}/blob/main/TECHNICAL_DOCS.md`,
    description: "Architecture, formulas, endpoints, and known limitations.",
  },
  {
    label: "Demo checklist",
    href: `${REPO_URL}/blob/main/DEMO_CHECKLIST.md`,
    description: "The judge-facing demo flow.",
  },
  {
    label: "OpenAPI spec",
    href: `${REPO_URL}/blob/main/openapi.yaml`,
    description: "Full REST API schema, source for the interactive docs.",
  },
];

const CASE_STUDIES = [
  {
    match: "Colombia vs Ghana",
    label: "Validated move",
    tone: "positive" as const,
    detail:
      "SHARP_MOVE and MOMENTUM_SHIFT signals on Colombia were both confirmed correct after the match ended 1-0.",
  },
  {
    match: "Canada vs Morocco",
    label: "Outcome-rejected move",
    tone: "warning" as const,
    detail:
      "A 55.13% and a 52.7% odds compression on Canada were both rejected by the final result (Canada lost 0-3). The Outcome Audit layer classified both as OUTCOME_REJECTED_MOVE with EXTREME_REVERSAL risk, backed by a local SHA-256 audit fingerprint.",
  },
];

const TECH_STACK = [
  { group: "Frontend", items: "React, TypeScript, Vite, Tailwind CSS, Recharts, lucide-react" },
  { group: "Backend", items: "Node.js, Express, TypeScript, TSX" },
  { group: "Deployment", items: "Vercel (frontend), Render (backend), GitHub Actions CI" },
  { group: "On-chain", items: "Solana devnet (write-anchor) and Solana mainnet (read-only Merkle proof)" },
];

const FEATURE_CATEGORY_ORDER: FeatureCategory[] = ["live-intelligence", "strategy", "trust", "operations"];

const EXAMPLE_PROOF = {
  network: "Solana devnet",
  signature: "5EYe21B3JaJwMrvuvcqkkdrzk8ZQxhVR6w4mC1rKpMntsB2gH8jDKgSJwz6ewTU75yuMKwMZjyNR7qDyVNS3r82c",
  explorerUrl:
    "https://explorer.solana.com/tx/5EYe21B3JaJwMrvuvcqkkdrzk8ZQxhVR6w4mC1rKpMntsB2gH8jDKgSJwz6ewTU75yuMKwMZjyNR7qDyVNS3r82c?cluster=devnet",
};

function LinkRow({
  href,
  label,
  description,
  icon,
}: {
  href: string;
  label: string;
  description: string;
  icon?: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-3 px-3 py-2.5 transition-colors hover:border-accent/40 hover:bg-white/5"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="text-stone-500" aria-hidden="true">{icon}</span>}
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-stone-100">{label}</p>
          <p className="truncate text-[11px] text-stone-500">{description}</p>
        </div>
      </div>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-stone-600" aria-hidden="true" />
    </a>
  );
}

/**
 * A static, judge- and newcomer-facing overview of what GoalPulse is,
 * what it can prove about itself, and where the underlying docs live.
 * Content is sourced from README.md / TECHNICAL_DOCS.md and the same
 * feature catalog Ask GoalPulse uses, so this page can never drift into
 * claims the rest of the product doesn't back up.
 */
export function AboutPage() {
  return (
    <div className="space-y-4">
      <Card elevated className="relative overflow-hidden p-5">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/12 via-transparent to-transparent"
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">About</p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-white">GoalPulse Agent</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-300">
              An autonomous TxLINE-powered sports market intelligence dashboard. GoalPulse monitors live football
              match markets, detects meaningful odds movement, enriches each signal with TXODDS Scores event
              context, and explains whether a market move is field-backed or market-only.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge label="Analytics only" tone="positive" />
              <StatusBadge label="Live TxLINE data" tone="accent" />
              <StatusBadge label="On-chain verifiable" tone="proof" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-black/20 px-4 py-3">
            <ShieldCheck className="h-5 w-5 text-positive" aria-hidden="true" />
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-stone-500">Compliance</p>
              <p className="text-xs font-semibold text-stone-200">Never places wagers or custodies funds</p>
            </div>
          </div>
        </div>
      </Card>

      <section aria-labelledby="about-links-title">
        <h2 id="about-links-title" className="mb-2 font-display text-base font-bold text-white">
          Live links
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {LIVE_LINKS.map((link) => (
            <LinkRow key={link.href} {...link} />
          ))}
        </div>
      </section>

      <section aria-labelledby="about-proof-title">
        <div className="mb-2 flex items-center gap-2">
          <h2 id="about-proof-title" className="font-display text-base font-bold text-white">
            On-chain proof
          </h2>
          <StatusBadge label="Live example" tone="proof" />
        </div>
        <Card className="p-4">
          <p className="text-xs leading-5 text-stone-400">
            GoalPulse backs its evidence with two independent Solana checks: a real devnet write that anchors a
            local SHA-256 outcome-audit hash in a Memo-program transaction (proving the hash existed at a given
            time), and a read-only Solana mainnet Merkle-proof simulation against TxLINE's own on-chain program.
            Neither transfers funds or requires a wallet from the visitor.
          </p>
          <div className="mt-3 rounded-lg border border-proof/25 bg-proof/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-stone-500">
                {EXAMPLE_PROOF.network} anchor transaction
              </span>
              <StatusBadge label="Anchored" tone="proof" />
            </div>
            <p className="mt-2 truncate font-mono text-[11px] text-stone-300" title={EXAMPLE_PROOF.signature}>
              {EXAMPLE_PROOF.signature}
            </p>
            <a
              href={EXAMPLE_PROOF.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-info underline decoration-info/40 underline-offset-2"
            >
              View on Solana Explorer (devnet)
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-stone-500">
            Every signal in Replay Lab and Verification can produce its own anchor or Merkle-proof check — this is
            a real transaction from GoalPulse's own devnet demo wallet, not a mock.
          </p>
        </Card>
      </section>

      <section aria-labelledby="about-validated-title">
        <h2 id="about-validated-title" className="mb-2 font-display text-base font-bold text-white">
          Validated against live data
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {CASE_STUDIES.map((study) => (
            <Card key={study.match} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-stone-100">{study.match}</p>
                <StatusBadge label={study.label} tone={study.tone} />
              </div>
              <p className="mt-2 text-[11px] leading-5 text-stone-400">{study.detail}</p>
            </Card>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-stone-600">
          Pinned, git-committed case studies from live production data — immune to backend restarts. Small sample
          size; see the Signal Archive for the full, growing history.
        </p>
      </section>

      <section aria-labelledby="about-features-title">
        <h2 id="about-features-title" className="mb-2 flex items-center gap-2 font-display text-base font-bold text-white">
          <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
          What GoalPulse can do
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {FEATURE_CATEGORY_ORDER.map((category) => (
            <Card key={category} className="p-4">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-stone-500">
                {FEATURE_CATEGORY_LABELS[category]}
              </p>
              <ul className="mt-2 space-y-2.5">
                {GOALPULSE_FEATURES.filter((feature) => feature.category === category).map((feature) => (
                  <li key={feature.id}>
                    <p className="text-xs font-semibold text-stone-200">{feature.shortName}</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-stone-500">{feature.summary}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-stone-600">
          The same catalog powers the in-app Ask GoalPulse analyst — try{" "}
          <span className="font-mono text-stone-400">/features</span> from the chat widget for formulas and
          evidence sources behind each item.
        </p>
      </section>

      <section aria-labelledby="about-stack-title">
        <h2 id="about-stack-title" className="mb-2 font-display text-base font-bold text-white">
          Tech stack
        </h2>
        <Card className="p-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            {TECH_STACK.map((row) => (
              <div key={row.group}>
                <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-stone-600">{row.group}</dt>
                <dd className="mt-1 text-[11px] leading-5 text-stone-300">{row.items}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </section>

      <section aria-labelledby="about-docs-title">
        <h2 id="about-docs-title" className="mb-2 font-display text-base font-bold text-white">
          Documentation
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {DOC_LINKS.map((doc) => (
            <LinkRow key={doc.href} {...doc} icon={<FileCode2 className="h-4 w-4" />} />
          ))}
        </div>
      </section>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2 text-stone-400">
          <BookOpenText className="h-4 w-4" aria-hidden="true" />
          <p className="text-[11px]">
            Built for the TxLINE Trading Tools and Agents track. MIT licensed, open source.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-3 px-3 py-1.5 text-[11px] font-semibold text-stone-200 hover:bg-white/5"
          >
            <GitFork className="h-3.5 w-3.5" aria-hidden="true" />
            GitHub
          </a>
          <a
            href="https://discord.gg/vCsA8Wuwh"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-3 px-3 py-1.5 text-[11px] font-semibold text-stone-200 hover:bg-white/5"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Discord
          </a>
        </div>
      </Card>
    </div>
  );
}
