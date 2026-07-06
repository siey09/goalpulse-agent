import { NextFunction, Request, Response } from "express";
import { config } from "../config";

/**
 * Protects mutating endpoints with a simple shared API key. Fail-closed: if
 * API_ACCESS_KEY is not configured on the server, the endpoint always
 * rejects rather than silently allowing access — unlike this codebase's
 * fail-open pattern for optional integrations (Discord alerts, on-chain
 * validation), this is a security control, not an optional bonus feature.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (!config.apiAccessKey) {
    res.status(401).json({ error: "API key not configured on the server." });
    return;
  }

  const providedKey = req.headers["x-api-key"];

  if (providedKey !== config.apiAccessKey) {
    res.status(401).json({ error: "Invalid or missing API key." });
    return;
  }

  next();
}
