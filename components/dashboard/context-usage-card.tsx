"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Clock, Cpu, DollarSign, FileText, RotateCw, Zap } from "lucide-react";
import type { ClaudeMessage, ClaudeResult, ClaudeSystemInit } from "@/lib/types";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────

interface ResultUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface ContextStats {
  model: string;
  cwd: string;
  totalCost: number;
  totalDurationMs: number;
  totalTurns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalMessages: number;
  toolUseCount: number;
}

// ── Stats computation ────────────────────────────────────────────────────

function computeContextStats(rawMessages: ClaudeMessage[], activeModel?: string | null): ContextStats {
  let model = activeModel ?? "";
  let cwd = "";
  let totalCost = 0;
  let totalDurationMs = 0;
  let totalTurns = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let toolUseCount = 0;

  for (const msg of rawMessages) {
    if (msg.type === "system" && (msg as { subtype?: string }).subtype === "init") {
      const init = msg as ClaudeSystemInit;
      if (!model) model = init.model;
      cwd = init.cwd;
    }

    if (msg.type === "result") {
      const result = msg as ClaudeResult & { usage?: ResultUsage };
      totalCost = result.total_cost_usd ?? result.cost_usd ?? totalCost;
      totalDurationMs += result.duration_ms ?? 0;
      totalTurns += result.num_turns ?? 0;
      const u = result.usage;
      if (u) {
        inputTokens += u.input_tokens ?? 0;
        outputTokens += u.output_tokens ?? 0;
        cacheReadTokens += u.cache_read_input_tokens ?? 0;
        cacheCreationTokens += u.cache_creation_input_tokens ?? 0;
      }
    }

    if (msg.type === "assistant") {
      const content = (msg as { message?: { content?: { type: string; name?: string }[] } }).message?.content;
      if (Array.isArray(content)) {
        toolUseCount += content.filter((b) => b.type === "tool_use").length;
      }
    }
  }

  return {
    model,
    cwd,
    totalCost,
    totalDurationMs,
    totalTurns,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    totalMessages: rawMessages.length,
    toolUseCount,
  };
}

// ── Formatting helpers ───────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

// ── Token breakdown bar colors ───────────────────────────────────────────

const TOKEN_CATEGORIES = [
  { key: "input", label: "Input tokens", color: "bg-blue-400" },
  { key: "output", label: "Output tokens", color: "bg-green-400" },
  { key: "cacheRead", label: "Cache read", color: "bg-purple-400" },
  { key: "cacheCreation", label: "Cache write", color: "bg-orange-400" },
] as const;

// ── Collapsible section ──────────────────────────────────────────────────

function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen,
  children,
}: {
  title: string;
  icon: typeof FileText;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <Icon className="size-3" />
        <span>{title}</span>
      </button>
      {open && <div className="mt-1.5 space-y-1 pl-5">{children}</div>}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────

export function ContextUsageCard({
  rawMessages,
  activeModel,
}: {
  rawMessages: ClaudeMessage[];
  activeModel?: string | null;
}) {
  const stats = useMemo(() => computeContextStats(rawMessages, activeModel), [rawMessages, activeModel]);

  const totalTokens = stats.inputTokens + stats.outputTokens + stats.cacheReadTokens + stats.cacheCreationTokens;

  const tokenBreakdown = [
    { ...TOKEN_CATEGORIES[0], value: stats.inputTokens },
    { ...TOKEN_CATEGORIES[1], value: stats.outputTokens },
    { ...TOKEN_CATEGORIES[2], value: stats.cacheReadTokens },
    { ...TOKEN_CATEGORIES[3], value: stats.cacheCreationTokens },
  ].filter((t) => t.value > 0);

  return (
    <div className="max-w-[90%] md:max-w-[80%] rounded-lg border bg-card px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Cpu className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Context Usage</span>
        </div>
        {stats.model && (
          <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
            {stats.model}
          </span>
        )}
      </div>

      {/* Token summary */}
      {totalTokens > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-semibold tabular-nums">{formatTokens(totalTokens)}</span>
            <span className="text-xs text-muted-foreground">total tokens used</span>
          </div>

          {/* Stacked bar */}
          {tokenBreakdown.length > 0 && (
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
              {tokenBreakdown.map((cat) => (
                <div
                  key={cat.key}
                  className={cn("h-full first:rounded-l-full last:rounded-r-full", cat.color)}
                  style={{ width: `${(cat.value / totalTokens) * 100}%` }}
                  title={`${cat.label}: ${formatTokens(cat.value)}`}
                />
              ))}
            </div>
          )}

          {/* Token breakdown legend */}
          <div className="space-y-1">
            {tokenBreakdown.map((cat) => (
              <div key={cat.key} className="flex items-center gap-2 text-xs">
                <div className={cn("size-2 rounded-full shrink-0", cat.color)} />
                <span className="flex-1 text-muted-foreground">{cat.label}</span>
                <span className="tabular-nums text-foreground/80">{formatTokens(cat.value)}</span>
                <span className="w-12 text-right tabular-nums text-muted-foreground/60">
                  {((cat.value / totalTokens) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-2">
          <DollarSign className="size-3.5 text-muted-foreground" />
          <div>
            <div className="text-xs text-muted-foreground">Cost</div>
            <div className="text-sm font-medium tabular-nums">{formatCost(stats.totalCost)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-2">
          <Clock className="size-3.5 text-muted-foreground" />
          <div>
            <div className="text-xs text-muted-foreground">Duration</div>
            <div className="text-sm font-medium tabular-nums">{formatDuration(stats.totalDurationMs)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-2">
          <RotateCw className="size-3.5 text-muted-foreground" />
          <div>
            <div className="text-xs text-muted-foreground">Turns</div>
            <div className="text-sm font-medium tabular-nums">{stats.totalTurns}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-2">
          <Zap className="size-3.5 text-muted-foreground" />
          <div>
            <div className="text-xs text-muted-foreground">Tool calls</div>
            <div className="text-sm font-medium tabular-nums">{stats.toolUseCount}</div>
          </div>
        </div>
      </div>

      {/* Working directory */}
      {stats.cwd && (
        <CollapsibleSection title="Session info" icon={FileText}>
          <div className="text-[11px]">
            <span className="text-muted-foreground">cwd: </span>
            <span className="font-mono text-muted-foreground">{stats.cwd}</span>
          </div>
          <div className="text-[11px]">
            <span className="text-muted-foreground">Messages: </span>
            <span className="tabular-nums">{stats.totalMessages}</span>
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}
