"use client";

/**
 * Isometric "agent world" view — a cozy room where each agent is a little
 * character sitting at a desk. Status maps to character pose/animation.
 * Click an agent to select it (switches activeAgentId).
 */

import { useMemo } from "react";
import { ArrowLeft, Sun, CloudLightning, Monitor } from "lucide-react";
import { Tip } from "@/components/ui/tip";
import { cn } from "@/lib/utils";
import type { AgentStatus } from "@/lib/types";
import type { AgentClientState } from "@/hooks/use-websocket";

// ── Status → character animation class ────────────────────────────────

const STATUS_ANIM: Record<AgentStatus, string> = {
  idle: "animate-[iso-idle_6s_ease-in-out_infinite]",
  spawning: "animate-[iso-bounce_1s_ease-out_infinite]",
  connected: "animate-[iso-breathe_4s_ease-in-out_infinite]",
  thinking: "animate-[iso-typing_0.6s_ease-in-out_infinite]",
  done: "animate-[iso-stretch_4s_ease-in-out_infinite]",
  disconnected: "opacity-20",
  error: "animate-[iso-shake_0.5s_ease-in-out_infinite]",
};

const STATUS_DOT_COLOR: Record<AgentStatus, string> = {
  idle: "bg-muted-foreground",
  spawning: "bg-yellow-500",
  connected: "bg-green-500",
  thinking: "bg-blue-500",
  done: "bg-muted-foreground",
  disconnected: "bg-orange-500",
  error: "bg-red-500",
};

/** Map model name to lobster body hex color. */
function modelHex(model?: string | null): string {
  if (!model) return "#e8734a"; // classic claude coral
  const m = model.toLowerCase();
  if (m.includes("opus")) return "#a87cda";   // purple
  if (m.includes("sonnet")) return "#5b9bd5"; // blue
  if (m.includes("haiku")) return "#e8a84a";  // amber
  return "#e8734a"; // coral
}

/** Lighter tint for highlights. */
function modelHexLight(model?: string | null): string {
  if (!model) return "#f4a882";
  const m = model.toLowerCase();
  if (m.includes("opus")) return "#c9aaee";
  if (m.includes("sonnet")) return "#8fc0ee";
  if (m.includes("haiku")) return "#f4c882";
  return "#f4a882";
}

function modelColorBg(model?: string | null): string {
  if (!model) return "bg-orange-500/20";
  const m = model.toLowerCase();
  if (m.includes("opus")) return "bg-purple-500/20";
  if (m.includes("sonnet")) return "bg-blue-500/20";
  if (m.includes("haiku")) return "bg-amber-500/20";
  return "bg-orange-500/20";
}

// ── Desk grid layout ──────────────────────────────────────────────────

const DESK_W = 160;

// ── Sub-components ────────────────────────────────────────────────────

/** Cute lobster character — round blob body, eye stalks, claws, antennae. */
function Character({ status, model }: { status: AgentStatus; model?: string | null }) {
  const fill = modelHex(model);
  const light = modelHexLight(model);

  if (status === "disconnected") return null;

  return (
    <svg
      width="52"
      height="52"
      viewBox="0 0 52 52"
      className={cn("transition-all duration-300", STATUS_ANIM[status])}
    >
      {/* Shadow */}
      <ellipse cx="26" cy="49" rx="14" ry="2.5" fill="currentColor" opacity="0.04" />

      {/* Antennae */}
      <g style={{ transformOrigin: "26px 14px", animation: "iso-sway 4s ease-in-out infinite" }}>
        <path d={`M20 14 Q16 2 12 4`} stroke={fill} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <circle cx="12" cy="4" r="2" fill={light} />
        <path d={`M32 14 Q36 2 40 4`} stroke={fill} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <circle cx="40" cy="4" r="2" fill={light} />
      </g>

      {/* Claws — status-dependent pose */}
      {status === "thinking" ? (
        <>
          {/* Claws forward, typing */}
          <g style={{ transformOrigin: "8px 34px", animation: "iso-typing 0.6s ease-in-out infinite" }}>
            <ellipse cx="6" cy="34" rx="5" ry="3.5" fill={fill} />
            <path d="M3 31 Q1 29 3 28" stroke={fill} strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M5 31 Q4 28 6 27" stroke={fill} strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>
          <g style={{ transformOrigin: "44px 34px", animation: "iso-typing 0.6s ease-in-out 0.15s infinite" }}>
            <ellipse cx="46" cy="34" rx="5" ry="3.5" fill={fill} />
            <path d="M49 31 Q51 29 49 28" stroke={fill} strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M47 31 Q48 28 46 27" stroke={fill} strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>
        </>
      ) : status === "done" ? (
        <>
          {/* Claws raised, celebrating */}
          <g>
            <ellipse cx="6" cy="20" rx="5" ry="3.5" fill={fill} />
            <path d="M3 17 Q1 15 3 14" stroke={fill} strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M5 17 Q4 14 6 13" stroke={fill} strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>
          <g>
            <ellipse cx="46" cy="20" rx="5" ry="3.5" fill={fill} />
            <path d="M49 17 Q51 15 49 14" stroke={fill} strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M47 17 Q48 14 46 13" stroke={fill} strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>
        </>
      ) : (
        <>
          {/* Claws resting at sides */}
          <g style={{ transformOrigin: "8px 32px", animation: "iso-sway 5s ease-in-out 0.5s infinite" }}>
            <ellipse cx="6" cy="32" rx="5" ry="3.5" fill={fill} />
            <path d="M3 29 Q1 27 3 26" stroke={fill} strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M5 29 Q4 26 6 25" stroke={fill} strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>
          <g style={{ transformOrigin: "44px 32px", animation: "iso-sway 5s ease-in-out infinite" }}>
            <ellipse cx="46" cy="32" rx="5" ry="3.5" fill={fill} />
            <path d="M49 29 Q51 27 49 26" stroke={fill} strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M47 29 Q48 26 46 25" stroke={fill} strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>
        </>
      )}

      {/* Tail segments — three little bumps at the back/bottom */}
      <ellipse cx="20" cy="45" rx="3.5" ry="2.5" fill={fill} opacity="0.7" />
      <ellipse cx="26" cy="46" rx="4" ry="2.5" fill={fill} opacity="0.6" />
      <ellipse cx="32" cy="45" rx="3.5" ry="2.5" fill={fill} opacity="0.7" />

      {/* Body — big round blob */}
      <ellipse cx="26" cy="30" rx="15" ry="14" fill={fill} />
      {/* Belly highlight */}
      <ellipse cx="26" cy="32" rx="10" ry="9" fill={light} opacity="0.3" />

      {/* Eye stalks + eyes */}
      {status === "error" ? (
        <>
          {/* X X eyes on stalks */}
          <ellipse cx="18" cy="18" rx="3" ry="6" fill={fill} />
          <circle cx="18" cy="14" r="5" fill="white" />
          <g stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round">
            <line x1="15.5" y1="12" x2="20.5" y2="16" />
            <line x1="20.5" y1="12" x2="15.5" y2="16" />
          </g>
          <ellipse cx="34" cy="18" rx="3" ry="6" fill={fill} />
          <circle cx="34" cy="14" r="5" fill="white" />
          <g stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round">
            <line x1="31.5" y1="12" x2="36.5" y2="16" />
            <line x1="36.5" y1="12" x2="31.5" y2="16" />
          </g>
        </>
      ) : status === "done" ? (
        <>
          {/* Happy ^ ^ eyes */}
          <ellipse cx="18" cy="18" rx="3" ry="6" fill={fill} />
          <circle cx="18" cy="14" r="5" fill="white" />
          <path d="M15 14 Q18 11 21 14" stroke="#333" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <ellipse cx="34" cy="18" rx="3" ry="6" fill={fill} />
          <circle cx="34" cy="14" r="5" fill="white" />
          <path d="M31 14 Q34 11 37 14" stroke="#333" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          {/* Round eyes on stalks with blink + look */}
          <ellipse cx="18" cy="18" rx="3" ry="6" fill={fill} />
          <g style={{ transformOrigin: "18px 14px", animation: "iso-blink 5s ease-in-out infinite" }}>
            <circle cx="18" cy="14" r="5" fill="white" />
            <circle cx="18" cy="14" r="2.5" fill="#222" style={{ animation: status === "idle" ? "iso-look 8s ease-in-out infinite" : status === "thinking" ? "none" : "iso-look 6s ease-in-out infinite" }} />
            <circle cx="17" cy="13" r="1" fill="white" />
          </g>
          <ellipse cx="34" cy="18" rx="3" ry="6" fill={fill} />
          <g style={{ transformOrigin: "34px 14px", animation: "iso-blink 5s ease-in-out 0.15s infinite" }}>
            <circle cx="34" cy="14" r="5" fill="white" />
            <circle cx="34" cy="14" r="2.5" fill="#222" style={{ animation: status === "idle" ? "iso-look 8s ease-in-out infinite" : status === "thinking" ? "none" : "iso-look 6s ease-in-out infinite" }} />
            <circle cx="33" cy="13" r="1" fill="white" />
          </g>
        </>
      )}

      {/* Mouth */}
      {status === "error" ? (
        <path d="M22 36 Q26 33 30 36" stroke="#ef4444" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      ) : status === "done" ? (
        <path d="M21 34 Q26 39 31 34" stroke="white" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.6" />
      ) : status === "thinking" ? (
        <ellipse cx="26" cy="35" rx="2" ry="2.5" fill="white" opacity="0.25" />
      ) : (
        <path d="M22 34 Q26 37 30 34" stroke="white" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.4" />
      )}

      {/* Cheek blush */}
      <circle cx="16" cy="33" r="3" fill={light} opacity="0.35" />
      <circle cx="36" cy="33" r="3" fill={light} opacity="0.35" />
    </svg>
  );
}

/** Thought bubble for thinking agents. */
function ThoughtBubble() {
  return (
    <div className="absolute -top-10 left-1/2 -translate-x-1/2 animate-[thought-pulse_1.5s_ease-in-out_infinite]">
      <div className="rounded-full bg-muted border border-border/50 px-2.5 py-1 text-[10px] text-muted-foreground font-mono shadow-md">
        . . .
      </div>
      <div className="mx-auto mt-0.5 size-2 rounded-full bg-muted border border-border/30" />
      <div className="mx-auto mt-0.5 size-1 rounded-full bg-muted/80" />
    </div>
  );
}

/** Error exclamation mark floating above. */
function ErrorBang() {
  return (
    <div className="absolute -top-8 left-1/2 -translate-x-1/2 animate-[iso-float_1s_ease-in-out_infinite]">
      <div className="flex size-5 items-center justify-center rounded-full bg-red-500/20 border border-red-500/30">
        <span className="text-xs font-bold text-red-400">!</span>
      </div>
    </div>
  );
}

/** Zzz floating for idle agents. */
function SleepyZzz() {
  return (
    <div className="absolute -top-4 -right-2">
      <span className="text-[9px] font-bold text-muted-foreground/40 animate-[iso-zzz_3s_ease-out_infinite]">z</span>
      <span className="absolute top-0 left-2 text-[7px] font-bold text-muted-foreground/30 animate-[iso-zzz_3s_ease-out_0.8s_infinite]">z</span>
      <span className="absolute top-0 left-3.5 text-[6px] font-bold text-muted-foreground/20 animate-[iso-zzz_3s_ease-out_1.6s_infinite]">z</span>
    </div>
  );
}

/** Coffee cup for idle agents. */
function CoffeeCup() {
  return (
    <div className="absolute -right-4 top-2">
      <div className="relative">
        {/* Cup body */}
        <div className="h-3.5 w-3 rounded-b-md bg-amber-800/50 border border-amber-700/30" />
        {/* Handle */}
        <div className="absolute top-0.5 -right-1.5 h-2 w-1.5 rounded-r-full border border-amber-700/30 border-l-0" />
        {/* Steam wisps */}
        <div className="absolute -top-3 left-0 w-0.5 h-2.5 bg-muted-foreground/25 rounded-full animate-[iso-steam_2.5s_ease-out_infinite]" />
        <div className="absolute -top-2.5 left-1.5 w-0.5 h-2 bg-muted-foreground/15 rounded-full animate-[iso-steam_2.5s_ease-out_0.7s_infinite]" />
      </div>
    </div>
  );
}

/** A single desk + monitor + chair + character workstation. */
function Workstation({
  agent,
  agentId,
  active,
  onSelect,
}: {
  agent: AgentClientState;
  agentId: string;
  active: boolean;
  onSelect: () => void;
}) {
  const lastTool = agent.messages.at(-1)?.toolCalls?.at(-1)?.name;
  const elapsed = Math.floor((Date.now() - agent.createdAt) / 60000);
  const elapsedLabel = elapsed < 1 ? "<1m" : elapsed < 60 ? `${elapsed}m` : `${Math.floor(elapsed / 60)}h${elapsed % 60}m`;

  const tooltipText = [
    agent.label || "new agent",
    agent.model ? `model: ${agent.model}` : null,
    `status: ${agent.status}`,
    lastTool ? `tool: ${lastTool}` : null,
    `age: ${elapsedLabel}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <Tip text={tooltipText} side="top">
      <button
        onClick={onSelect}
        className={cn(
          "relative flex flex-col items-center rounded-lg p-3 transition-all duration-200",
          "hover:bg-muted/40 hover:scale-[1.02]",
          active && "ring-1 ring-primary/50 bg-muted/30",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        )}
        style={{ width: DESK_W }}
      >
        {/* Character area */}
        <div className="relative mb-2 flex items-end justify-center" style={{ height: 56 }}>
          <Character status={agent.status} model={agent.model} />
          {agent.status === "thinking" && <ThoughtBubble />}
          {agent.status === "error" && <ErrorBang />}
          {agent.status === "idle" && <CoffeeCup />}
          {agent.status === "idle" && <SleepyZzz />}
        </div>

        {/* Desk surface */}
        <div className={cn(
          "relative flex w-full items-center justify-center rounded-md border px-2 py-1.5",
          "bg-card/80 shadow-sm",
          agent.status === "disconnected" && "opacity-40"
        )}>
          {/* Monitor */}
          <div className="relative mr-2">
            <Monitor className={cn(
              "size-4",
              agent.status === "thinking"
                ? "text-blue-400 animate-[screen-flicker_2s_ease-in-out_infinite]"
                : agent.status === "disconnected"
                  ? "text-muted-foreground/30"
                  : "text-muted-foreground/60"
            )} />
            {agent.status === "thinking" && (
              <div className="absolute inset-0 rounded-sm bg-blue-500/10 blur-sm" />
            )}
          </div>

          {/* Active tool label */}
          {lastTool && (agent.status === "thinking" || agent.status === "connected") ? (
            <span className="truncate text-[9px] font-mono text-muted-foreground/70">
              {lastTool}
            </span>
          ) : (
            <span className="text-[9px] text-muted-foreground/40">
              {agent.status === "disconnected" ? "offline" : "desk"}
            </span>
          )}
        </div>

        {/* Chair (empty if disconnected) */}
        <div className={cn(
          "mt-1 h-1.5 w-8 rounded-full",
          agent.status === "disconnected"
            ? "bg-muted-foreground/10 rotate-12"
            : modelColorBg(agent.model)
        )} />

        {/* Name tag + status dot */}
        <div className="mt-2 flex items-center gap-1.5">
          <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT_COLOR[agent.status])} />
          <span className="max-w-[100px] truncate text-[10px] text-foreground/70">
            {agent.label || "new agent"}
          </span>
        </div>

        {/* Agent ID */}
        <span className="mt-0.5 text-[8px] font-mono text-muted-foreground/40">
          {agentId.slice(0, 8)}
        </span>
      </button>
    </Tip>
  );
}

// ── Office furniture ──────────────────────────────────────────────────

function PottedPlant({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? 0.7 : size === "lg" ? 1.4 : 1;
  return (
    <div className="flex flex-col items-center" style={{ transform: `scale(${s})` }}>
      <div className="relative animate-[iso-sway_5s_ease-in-out_infinite]">
        {/* Leaves */}
        <div className="size-6 rounded-full bg-green-700/50" />
        <div className="absolute -left-2 top-0.5 size-5 rounded-full bg-green-600/40" />
        <div className="absolute -right-2 top-0.5 size-5 rounded-full bg-green-800/40" />
        <div className="absolute -top-1 left-1 size-4 rounded-full bg-green-500/30" />
      </div>
      <div className="h-4 w-5 rounded-b-lg bg-amber-800/50 border border-amber-700/30 -mt-1" />
      <div className="h-0.5 w-6 rounded-b bg-amber-900/30" />
    </div>
  );
}

function Bookshelf() {
  return (
    <div className="flex flex-col gap-0.5 rounded-sm border border-muted-foreground/10 bg-muted-foreground/5 p-1">
      <div className="flex gap-[2px]">
        <div className="h-6 w-2.5 rounded-t-sm bg-blue-800/40" />
        <div className="h-6 w-2 rounded-t-sm bg-red-800/40" />
        <div className="h-6 w-2.5 rounded-t-sm bg-green-800/40" />
        <div className="h-6 w-2 rounded-t-sm bg-yellow-800/30" />
        <div className="h-6 w-2.5 rounded-t-sm bg-purple-800/40" />
        <div className="h-6 w-2 rounded-t-sm bg-orange-800/35" />
      </div>
      <div className="h-0.5 w-full bg-muted-foreground/15 rounded" />
      <div className="flex gap-[2px]">
        <div className="h-5 w-2 rounded-t-sm bg-indigo-800/40" />
        <div className="h-5 w-2.5 rounded-t-sm bg-teal-800/40" />
        <div className="h-5 w-2 rounded-t-sm bg-pink-800/30" />
        <div className="h-5 w-2.5 rounded-t-sm bg-cyan-800/40" />
        <div className="h-5 w-2 rounded-t-sm bg-amber-800/35" />
      </div>
      <div className="h-0.5 w-full bg-muted-foreground/15 rounded" />
    </div>
  );
}

function WaterCooler() {
  return (
    <div className="flex flex-col items-center">
      {/* Jug */}
      <div className="h-5 w-4 rounded-t-full bg-blue-400/20 border border-blue-400/15" />
      {/* Base */}
      <div className="h-7 w-5 rounded-b-sm bg-muted-foreground/15 border border-muted-foreground/10" />
      {/* Tap */}
      <div className="absolute bottom-2 -right-1 h-1 w-1.5 rounded-r bg-muted-foreground/20" />
    </div>
  );
}

function Whiteboard() {
  return (
    <div className="rounded border border-muted-foreground/15 bg-muted-foreground/5 p-1.5">
      <div className="h-10 w-16 rounded-sm bg-foreground/[0.03] border border-muted-foreground/10 p-1">
        {/* Scribbles */}
        <div className="h-0.5 w-8 rounded bg-muted-foreground/15 mb-1" />
        <div className="h-0.5 w-6 rounded bg-muted-foreground/10 mb-1" />
        <div className="h-0.5 w-10 rounded bg-muted-foreground/12 mb-1" />
        <div className="h-0.5 w-4 rounded bg-blue-500/15" />
      </div>
      {/* Marker tray */}
      <div className="flex gap-0.5 mt-1 justify-center">
        <div className="h-1.5 w-0.5 rounded-full bg-red-500/30" />
        <div className="h-1.5 w-0.5 rounded-full bg-blue-500/30" />
        <div className="h-1.5 w-0.5 rounded-full bg-green-500/30" />
      </div>
    </div>
  );
}

function Couch() {
  return (
    <div className="flex flex-col items-center">
      {/* Back */}
      <div className="h-4 w-14 rounded-t-lg bg-muted-foreground/12 border border-muted-foreground/8" />
      {/* Seat */}
      <div className="h-3 w-16 rounded-b-md bg-muted-foreground/10 border-x border-b border-muted-foreground/8" />
      {/* Cushions */}
      <div className="absolute top-0.5 left-1 h-3 w-5 rounded-sm bg-muted-foreground/6" />
      <div className="absolute top-0.5 right-1 h-3 w-5 rounded-sm bg-muted-foreground/6" />
    </div>
  );
}

function CoffeeMug() {
  return (
    <div className="relative">
      <div className="h-3 w-2.5 rounded-b-sm bg-muted-foreground/20 border border-muted-foreground/15" />
      <div className="absolute top-0.5 -right-1 h-1.5 w-1 rounded-r-full border border-muted-foreground/15 border-l-0" />
      <div className="absolute -top-2 left-0.5 w-0.5 h-1.5 bg-muted-foreground/15 rounded-full animate-[iso-steam_3s_ease-out_infinite]" />
    </div>
  );
}

function Rug() {
  return (
    <div className="h-3 w-28 rounded-full bg-primary/[0.04] border border-primary/[0.06]" />
  );
}

/** Chat bubble between agents when multiple are thinking. */
function AgentChat({ count }: { count: number }) {
  if (count < 2) return null;
  return (
    <div className="flex items-center gap-2 rounded-full bg-muted/60 border border-border/40 px-3 py-1.5 shadow-sm animate-[iso-breathe_3s_ease-in-out_infinite]">
      <div className="flex -space-x-1.5">
        {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
          <div key={i} className="size-3 rounded-full bg-blue-500/40 border border-background ring-1 ring-background" />
        ))}
      </div>
      <span className="text-[9px] text-muted-foreground font-mono">collaborating...</span>
    </div>
  );
}

// ── Resource bar ──────────────────────────────────────────────────────

function ResourceBar({ agents, onBack }: { agents: Map<string, AgentClientState>; onBack?: () => void }) {
  const stats = useMemo(() => {
    let active = 0;
    let thinking = 0;
    let errors = 0;
    let total = 0;
    agents.forEach((a) => {
      total++;
      if (a.status === "thinking" || a.status === "connected" || a.status === "spawning") active++;
      if (a.status === "thinking") thinking++;
      if (a.status === "error") errors++;
    });
    return { active, thinking, errors, total };
  }, [agents]);

  return (
    <div className="flex items-center gap-4 border-b px-4 py-2 text-xs">
      {onBack && (
        <button
          onClick={onBack}
          className="rounded p-1 transition-colors hover:bg-muted/50"
          title="Back to chat"
        >
          <ArrowLeft className="size-3.5" />
        </button>
      )}
      <span className="font-semibold text-foreground/70">agent world</span>
      <span className="text-muted-foreground">
        {stats.active} active / {stats.total} total
      </span>
      {stats.thinking > 0 && (
        <span className="flex items-center gap-1 text-blue-400">
          <span className="size-1.5 rounded-full bg-blue-500 animate-pulse" />
          {stats.thinking} thinking
        </span>
      )}
      <span className="ml-auto flex items-center gap-1">
        {stats.errors > 0 ? (
          <CloudLightning className="size-3.5 text-red-400" />
        ) : (
          <Sun className="size-3.5 text-yellow-500/70" />
        )}
        <span className={stats.errors > 0 ? "text-red-400" : "text-muted-foreground"}>
          {stats.errors > 0 ? `${stats.errors} error${stats.errors > 1 ? "s" : ""}` : "all clear"}
        </span>
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function AgentWorld({
  agents,
  agentOrder,
  activeAgentId,
  onSelect,
  onBack,
}: {
  agents: Map<string, AgentClientState>;
  agentOrder: string[];
  activeAgentId: string | null;
  onSelect: (agentId: string) => void;
  onBack?: () => void;
}) {
  // Only show active agents (not done/disconnected/error/iceboxed)
  const ACTIVE_STATUSES = new Set(["idle", "spawning", "connected", "thinking"]);
  const visibleIds = useMemo(
    () => agentOrder.filter((id) => {
      const a = agents.get(id);
      return a && !a.iceboxed && ACTIVE_STATUSES.has(a.status);
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agentOrder, agents]
  );

  const thinkingCount = useMemo(
    () => visibleIds.filter((id) => agents.get(id)?.status === "thinking").length,
    [visibleIds, agents]
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <ResourceBar agents={agents} onBack={onBack} />

      <div className="relative flex-1 overflow-auto">
        {/* Isometric floor grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `
              linear-gradient(to right, currentColor 1px, transparent 1px),
              linear-gradient(to bottom, currentColor 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
          }}
        />

        {visibleIds.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-muted-foreground">
              <div className="text-4xl mb-2">~</div>
              <p className="text-sm">No agents yet</p>
              <p className="text-xs mt-1">Spawn one from the chat view</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl p-6 md:p-10">
            {/* Office top wall — whiteboard + bookshelf + decorations */}
            <div className="flex items-end justify-between gap-6 mb-6 px-4 opacity-70">
              <PottedPlant size="lg" />
              <Whiteboard />
              <Bookshelf />
              <div className="relative">
                <WaterCooler />
              </div>
              <PottedPlant size="md" />
            </div>

            {/* Collaboration indicator */}
            {thinkingCount >= 2 && (
              <div className="flex justify-center mb-4">
                <AgentChat count={thinkingCount} />
              </div>
            )}

            {/* Desks area — main workspace grid */}
            <div className="flex flex-wrap justify-center gap-4 mb-6">
              {visibleIds.map((id) => {
                const agent = agents.get(id);
                if (!agent) return null;
                return (
                  <Workstation
                    key={id}
                    agent={agent}
                    agentId={id}
                    active={id === activeAgentId}
                    onSelect={() => onSelect(id)}
                  />
                );
              })}
            </div>

            {/* Break area — bottom of office */}
            <div className="flex items-center justify-center gap-8 opacity-50 mt-4">
              <Rug />
            </div>
            <div className="flex items-end justify-center gap-6 mt-2 opacity-50">
              <div className="relative">
                <Couch />
              </div>
              <CoffeeMug />
              <PottedPlant size="sm" />
            </div>
          </div>
        )}

        {/* Floor shadow gradient at bottom */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background/80 to-transparent" />
      </div>
    </div>
  );
}
