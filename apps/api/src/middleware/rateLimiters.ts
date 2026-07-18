import { rateLimit } from "express-rate-limit";

/**
 * Generous general-purpose limit applied to every route. A single open
 * dashboard tab generates ~132 GET requests/minute in steady state (measured
 * across App.tsx and its polling panels); 1200/min leaves wide headroom for
 * multiple judges/devices sharing an IP while still blocking blatant abuse.
 * Deliberately generous: for a hackathon demo, accidentally rate-limiting a
 * judge during live evaluation is far worse than being slightly less strict
 * against abuse.
 */
export const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 1200,
  message: { error: "Too many requests. Please slow down and try again shortly." },
});

/**
 * Strict limit for POST /api/agent/run-once, stacked in front of its existing
 * API key check as defense-in-depth. This endpoint is never called by the
 * live dashboard, so this number has zero judge-facing risk either way.
 */
export const runOnceLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  message: { error: "Too many requests to this endpoint. Please wait before trying again." },
});

/**
 * Strict limit for POST /api/replay/anchor-proof. Each successful call
 * submits a real (fee-less devnet) Solana transaction, so this is capped
 * tightly to avoid needlessly draining the demo wallet's devnet SOL faucet
 * balance from repeated clicks or abuse.
 */
export const anchorProofLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  message: { error: "Too many anchoring requests. Please wait before trying again." },
});

