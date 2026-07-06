import { AgentSignal } from "../types";

/**
 * Sends an autonomous Discord alert whenever the agent detects a HIGH
 * severity signal, without any human triggering it. This turns GoalPulse
 * from a passive dashboard into a tool that actually acts on what it finds,
 * strengthening the "fully automated, no manual intervention" bar for
 * autonomous operation.
 *
 * Configuration: set DISCORD_WEBHOOK_URL to a Discord channel webhook URL
 * (Server Settings -> Integrations -> Webhooks -> New Webhook -> Copy URL).
 * If it is not configured, this silently no-ops so the agent cycle never
 * fails or slows down because of a missing/invalid webhook.
 */
export type DiscordAlertStatus = "sent" | "failed" | "not_configured";

export async function sendHighSeverityAlert(
  signal: AgentSignal
): Promise<DiscordAlertStatus> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    return "not_configured";
  }

  const direction = signal.oddsAfter < signal.oddsBefore ? "compressed" : "drifted";
  const emoji = signal.signalType === "SHARP_MOVE" ? "🚨" : "📈";

  const payload = {
    username: "GoalPulse Agent",
    embeds: [
      {
        title: `${emoji} ${signal.signalType.replace("_", " ")} — ${signal.target}`,
        description: signal.explanation,
        color: signal.signalType === "SHARP_MOVE" ? 15548997 : 15105570,
        fields: [
          { name: "Match", value: signal.match, inline: true },
          { name: "Side", value: signal.target, inline: true },
          {
            name: "Odds",
            value: `${signal.oddsBefore.toFixed(2)} → ${signal.oddsAfter.toFixed(2)} (${direction} ${signal.oddsChangePct.toFixed(1)}%)`,
            inline: false,
          },
        ],
        footer: { text: "GoalPulse Agent · Analytics only, not betting advice" },
        timestamp: signal.createdAt,
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    return response.ok ? "sent" : "failed";
  } catch {
    // Alerts are best-effort. A delivery failure must never break the
    // agent cycle or signal generation.
    return "failed";
  }
}
