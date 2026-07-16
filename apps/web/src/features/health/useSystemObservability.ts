import { useEffect, useRef, useState } from "react";
import type { FeedHealth, SystemMetrics } from "./systemHealthModel";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://goalpulse-agent-api.onrender.com";
const POLL_INTERVAL_MS = 10_000;

export type ObservabilitySourceState = "loading" | "fresh" | "stale" | "unavailable";

export interface SystemObservabilityState {
  metrics: SystemMetrics | null;
  feedHealth: FeedHealth | null;
  metricsState: ObservabilitySourceState;
  feedHealthState: ObservabilitySourceState;
  lastSuccessfulRefreshAt: string | null;
}

async function fetchData<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { signal });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  const payload = await response.json() as { data: T };
  return payload.data;
}

export function useSystemObservability(): SystemObservabilityState {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [feedHealth, setFeedHealth] = useState<FeedHealth | null>(null);
  const [metricsState, setMetricsState] = useState<ObservabilitySourceState>("loading");
  const [feedHealthState, setFeedHealthState] = useState<ObservabilitySourceState>("loading");
  const [lastSuccessfulRefreshAt, setLastSuccessfulRefreshAt] = useState<string | null>(null);
  const metricsRef = useRef<SystemMetrics | null>(null);
  const feedHealthRef = useRef<FeedHealth | null>(null);

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;

    const poll = async () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;

      const [metricsResult, feedHealthResult] = await Promise.allSettled([
        fetchData<SystemMetrics>("/api/metrics", signal),
        fetchData<FeedHealth>("/api/feed-health", signal),
      ]);

      if (!active || signal.aborted) return;
      let refreshed = false;

      if (metricsResult.status === "fulfilled") {
        metricsRef.current = metricsResult.value;
        setMetrics(metricsResult.value);
        setMetricsState("fresh");
        refreshed = true;
      } else {
        setMetricsState(metricsRef.current ? "stale" : "unavailable");
      }

      if (feedHealthResult.status === "fulfilled") {
        feedHealthRef.current = feedHealthResult.value;
        setFeedHealth(feedHealthResult.value);
        setFeedHealthState("fresh");
        refreshed = true;
      } else {
        setFeedHealthState(feedHealthRef.current ? "stale" : "unavailable");
      }

      if (refreshed) setLastSuccessfulRefreshAt(new Date().toISOString());
    };

    void poll();
    const interval = window.setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(interval);
      controller?.abort();
    };
  }, []);

  return {
    metrics,
    feedHealth,
    metricsState,
    feedHealthState,
    lastSuccessfulRefreshAt,
  };
}
