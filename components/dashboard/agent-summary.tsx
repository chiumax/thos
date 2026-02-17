"use client";

/**
 * Compact summary bar showing cost, duration, turn count, and token usage
 * for an agent.
 *
 * Extracts stats from the raw Claude NDJSON message stream by scanning for
 * `result` type messages. For multi-turn sessions:
 * - **Cost**: last result's `total_cost_usd` (cumulative across the session)
 * - **Duration**: sum of all `duration_ms` values (per-interaction wall clock)
 * - **Turns**: sum of all `num_turns` values (per-interaction)
 * - **Tokens**: sum of `input_tokens` + `output_tokens` from each result's
 *   `usage` object (includes cache read/creation counts in the tooltip)
 */

import { useMemo } from "react";
import { Clock, DollarSign, RotateCw, Zap } from "lucide-react";
import type { ClaudeMessage, ClaudeResult } from "@/lib/types";

interface ResultUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface AgentStats {
  totalCost: number;
  totalDurationMs: number;
  totalTurns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

function computeStats(rawMessages: ClaudeMessage[]): AgentStats | null {
  const results: (ClaudeResult & { usage?: ResultUsage })[] = [];
  for (const msg of rawMessages) {
    if (msg.type === "result") {
      results.push(msg as ClaudeResult & { usage?: ResultUsage });
    }
  }
  if (results.length === 0) return null;

  const lastResult = results[results.length - 1];
  const totalCost = lastResult.total_cost_usd ?? lastResult.cost_usd ?? 0;
  const totalDurationMs = results.reduce((sum, r) => sum + (r.duration_ms ?? 0), 0);
  const totalTurns = results.reduce((sum, r) => sum + (r.num_turns ?? 0), 0);

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  for (const r of results) {
    const u = r.usage;
    if (!u) continue;
    inputTokens += u.input_tokens ?? 0;
    outputTokens += u.output_tokens ?? 0;
    cacheReadTokens += u.cache_read_input_tokens ?? 0;
    cacheCreationTokens += u.cache_creation_input_tokens ?? 0;
  }

  return { totalCost, totalDurationMs, totalTurns, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

export function AgentSummary({ rawMessages }: { rawMessages: ClaudeMessage[] }) {
  const stats = useMemo(() => computeStats(rawMessages), [rawMessages]);

  if (!stats) return null;

  const totalTokens = stats.inputTokens + stats.outputTokens + stats.cacheReadTokens + stats.cacheCreationTokens;
  const tokenTooltip = [
    `Input: ${formatTokens(stats.inputTokens)}`,
    `Output: ${formatTokens(stats.outputTokens)}`,
    `Cache read: ${formatTokens(stats.cacheReadTokens)}`,
    `Cache write: ${formatTokens(stats.cacheCreationTokens)}`,
  ].join("\n");

  return (
    <div className="flex items-center gap-3 border-b px-4 py-1.5 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1" title="Total cost">
        <DollarSign className="size-3" />
        {formatCost(stats.totalCost)}
      </span>
      <span className="flex items-center gap-1" title="Total duration">
        <Clock className="size-3" />
        {formatDuration(stats.totalDurationMs)}
      </span>
      <span className="flex items-center gap-1" title="Total turns">
        <RotateCw className="size-3" />
        {stats.totalTurns} {stats.totalTurns === 1 ? "turn" : "turns"}
      </span>
      <span className="flex items-center gap-1" title={tokenTooltip}>
        <Zap className="size-3" />
        {formatTokens(totalTokens)} tokens
      </span>
    </div>
  );
}
