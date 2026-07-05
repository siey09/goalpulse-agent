import dotenv from "dotenv";

dotenv.config({ quiet: true });
dotenv.config({ path: ".env.local", override: true, quiet: true });

export const config = {
  port: Number(process.env.PORT ?? 4000),
  agentIntervalMs: Number(process.env.AGENT_INTERVAL_MS ?? 3000),
  useSimulatedFeed: process.env.USE_SIMULATED_FEED !== "false",
  txlineApiBaseUrl:
    process.env.TXLINE_BASE_URL ??
    process.env.TXLINE_API_BASE_URL ??
    "https://txline.txodds.com",
  txlineApiKey:
    process.env.TXLINE_API_TOKEN ??
    process.env.TXLINE_API_KEY ??
    "",
};
