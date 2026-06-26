import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 4000),
  agentIntervalMs: Number(process.env.AGENT_INTERVAL_MS ?? 60000),
  useSimulatedFeed: process.env.USE_SIMULATED_FEED !== "false",
  txlineApiBaseUrl: process.env.TXLINE_API_BASE_URL ?? "https://txline.txodds.com",
  txlineApiKey: process.env.TXLINE_API_KEY ?? "",
};
