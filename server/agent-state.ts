/**
 * Agent state management — types, Map, lifecycle, and persistence helpers.
 *
 * Extracted from ws.ts for single-responsibility. This module owns the
 * in-memory agent state and provides functions to mutate and persist it.
 */

import { WebSocket } from "ws";
import { execSync, spawn } from "child_process";
import { randomBytes } from "crypto";
import { writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { AgentStatus, AgentInfo, ServerMessage } from "../lib/types";
import { SessionStore, type PersistedAgent } from "./session-store";
import { sendToBrowser, broadcastAgentList, setBuildAgentList } from "./broadcast";

const PORT = 9900;
const TMUX_SESSION_PREFIX = "thos-agent";

// ── State ──────────────────────────────────────────────────────────────

export interface AgentState {
  agentId: string;
  claudeSocket: WebSocket | null;
  tmuxSession: string | null;
  pendingPrompt: string | null;
  status: AgentStatus;
  label: string;
  createdAt: number;
  sessionId: string | null;
  workspaceId: string | null;
  model: string | null;
  pinned: boolean;
  iceboxed: boolean;
  pendingControlRequests: Map<string, Record<string, unknown>>;
  messageHistory: ServerMessage[];
  pendingMessages: string[];
}

export const agents = new Map<string, AgentState>();
export const store = new SessionStore();

/** Generate a short random agent ID. */
export function newAgentId(): string {
  return randomBytes(4).toString("hex");
}

// ── Persistence ────────────────────────────────────────────────────────

export function toPersistedAgent(agent: AgentState): PersistedAgent {
  return {
    id: agent.agentId,
    state: {
      agentId: agent.agentId,
      status: agent.status,
      tmuxSession: agent.tmuxSession,
      label: agent.label,
      createdAt: agent.createdAt,
      sessionId: agent.sessionId,
      workspaceId: agent.workspaceId,
      model: agent.model,
      pinned: agent.pinned || undefined,
      iceboxed: agent.iceboxed || undefined,
    },
    messageHistory: agent.messageHistory,
  };
}

/** Persist agent state (debounced — use for streaming events). */
export function persistAgent(agent: AgentState) {
  store.save(toPersistedAgent(agent));
}

/** Persist agent state immediately (use for critical state changes). */
export function persistAgentSync(agent: AgentState) {
  store.saveSync(toPersistedAgent(agent));
}

// ── Message deduplication ──────────────────────────────────────────────

/**
 * Extract a stable dedup key from a relay message, if present.
 * Claude NDJSON sends cumulative snapshots — we deduplicate by replacing
 * the previous snapshot instead of appending.
 */
export function getRelayMessageId(msg: ServerMessage): string | null {
  if (msg.type !== "relay") return null;
  const inner = msg.message;
  if (inner.type === "assistant") {
    return (inner as { message?: { id?: string } }).message?.id ?? null;
  }
  if (inner.type === "user") {
    return (inner as { uuid?: string }).uuid ?? null;
  }
  if (inner.type === "system" && (inner as { subtype?: string }).subtype === "init") {
    const sid = (inner as { session_id?: string }).session_id;
    return sid ? `init:${sid}` : null;
  }
  if (inner.type === "result") {
    const sid = (inner as { session_id?: string }).session_id;
    return sid ? `result:${sid}` : null;
  }
  return null;
}

/** Compact a message history by keeping only the last version of each message ID. */
export function compactHistory(history: ServerMessage[]): ServerMessage[] {
  const lastIndex = new Map<string, number>();
  for (let i = 0; i < history.length; i++) {
    const id = getRelayMessageId(history[i]);
    if (id) lastIndex.set(id, i);
  }
  return history.filter((msg, i) => {
    const id = getRelayMessageId(msg);
    if (!id) return true;
    return lastIndex.get(id) === i;
  });
}

/**
 * Record a message in the agent's history and send to all browsers.
 * For cumulative snapshot messages, replaces the previous snapshot.
 */
export function recordAndSend(agentId: string, msg: ServerMessage) {
  const agent = agents.get(agentId);
  if (agent) {
    const msgId = getRelayMessageId(msg);
    if (msgId) {
      let replaced = false;
      for (let i = agent.messageHistory.length - 1; i >= 0; i--) {
        if (getRelayMessageId(agent.messageHistory[i]) === msgId) {
          agent.messageHistory[i] = msg;
          replaced = true;
          break;
        }
      }
      if (!replaced) {
        agent.messageHistory.push(msg);
      }
    } else {
      agent.messageHistory.push(msg);
    }
    persistAgent(agent);
  }
  sendToBrowser(msg);
}

// ── Status helpers ─────────────────────────────────────────────────────

/** Update an agent's status, notify browsers, broadcast list, and persist. */
export function setAgentStatus(agentId: string, status: AgentStatus) {
  const agent = agents.get(agentId);
  if (!agent) return;
  agent.status = status;
  sendToBrowser({ type: "status", agentId, status });
  broadcastAgentList();
  persistAgentSync(agent);
}

// ── tmux helpers ───────────────────────────────────────────────────────

/** Return the set of currently alive tmux session names matching the thos prefix. */
export function listAliveTmuxSessions(): Set<string> {
  try {
    const output = execSync("tmux list-sessions -F '#{session_name}'", {
      encoding: "utf-8",
    }).trim();
    if (!output) return new Set();
    return new Set(output.split("\n").filter((s) => s.startsWith(TMUX_SESSION_PREFIX)));
  } catch {
    return new Set();
  }
}

// ── Agent lifecycle ────────────────────────────────────────────────────

/** Stop a running agent by killing its tmux session and closing the CLI socket. */
export function stopAgent(agentId: string) {
  const agent = agents.get(agentId);
  if (!agent) return;

  if (agent.tmuxSession) {
    try {
      execSync(`tmux kill-session -t ${agent.tmuxSession}`, { stdio: "ignore" });
      console.log(`[tmux] killed session ${agent.tmuxSession}`);
    } catch {
      // Session may already be dead
    }
  }
  if (agent.claudeSocket?.readyState === WebSocket.OPEN) {
    agent.claudeSocket.close();
  }
  agent.claudeSocket = null;
  setAgentStatus(agentId, "done");
}

/** Permanently delete an agent: stop it, remove from Map, remove from disk. */
export function deleteAgent(agentId: string) {
  const agent = agents.get(agentId);
  if (!agent) return;

  if (agent.tmuxSession) {
    try {
      execSync(`tmux kill-session -t ${agent.tmuxSession}`, { stdio: "ignore" });
    } catch {}
  }
  if (agent.claudeSocket?.readyState === WebSocket.OPEN) {
    agent.claudeSocket.close();
  }
  agents.delete(agentId);
  store.remove(agentId);
  broadcastAgentList();
}

/**
 * Spawn a new Claude CLI process inside a tmux session.
 * If `workspaceId` is provided, the tmux session starts in that workspace's cwd.
 */
export function spawnClaude(
  prompt: string,
  workspaceId: string | null | undefined,
  model?: string | null,
  systemPrompt?: string | null,
  workspaces?: Map<string, { cwd: string }>
): string {
  const agentId = newAgentId();
  const sessionName = `${TMUX_SESSION_PREFIX}-${agentId}`;
  const label = prompt.length > 60 ? prompt.slice(0, 57) + "..." : prompt;

  const agent: AgentState = {
    agentId,
    claudeSocket: null,
    tmuxSession: null,
    pendingPrompt: prompt,
    status: "spawning",
    label,
    createdAt: Date.now(),
    sessionId: null,
    workspaceId: workspaceId ?? null,
    model: model ?? null,
    pinned: false,
    iceboxed: false,
    pendingControlRequests: new Map(),
    messageHistory: [],
    pendingMessages: [],
  };
  agents.set(agentId, agent);

  sendToBrowser({ type: "spawned", agentId });
  broadcastAgentList();
  persistAgentSync(agent);

  const modelFlag = model ? ` --model ${model}` : "";
  let systemPromptFlag = "";
  if (systemPrompt) {
    const spFile = join(tmpdir(), `thos-sp-${agentId}`);
    writeFileSync(spFile, systemPrompt, "utf-8");
    systemPromptFlag = ` --append-system-prompt "$(cat ${spFile})"`;
  }
  const claudeCmd = `unset CLAUDECODE; exec claude --dangerously-skip-permissions${modelFlag}${systemPromptFlag} --sdk-url ws://localhost:${PORT}/claude/${agentId}`;

  const workspace = workspaceId && workspaces ? workspaces.get(workspaceId) : null;
  const tmuxArgs = ["new-session", "-d", "-s", sessionName];
  if (workspace) {
    tmuxArgs.push("-c", workspace.cwd);
  }
  tmuxArgs.push("bash", "-c", claudeCmd);

  const tmux = spawn("tmux", tmuxArgs, { stdio: "ignore" });

  tmux.on("error", (err) => {
    console.error("[tmux spawn error]", err);
    setAgentStatus(agentId, "error");
    recordAndSend(agentId, { type: "error", agentId, error: `tmux error: ${err.message}` });
  });

  tmux.on("exit", (code) => {
    if (code !== 0) {
      console.error(`[tmux] new-session exited with code ${code}`);
      setAgentStatus(agentId, "error");
      recordAndSend(agentId, { type: "error", agentId, error: `tmux exited with code ${code}` });
      return;
    }
    console.log(`[tmux] session ${sessionName} created — attach with: tmux attach -t ${sessionName}`);
    agent.tmuxSession = sessionName;
    broadcastAgentList();
    persistAgentSync(agent);
  });

  return agentId;
}

/** Build a snapshot of all agents for the sidebar, optionally filtered by workspace. */
export function buildAgentList(workspaceId?: string | null): AgentInfo[] {
  let list = Array.from(agents.values());
  if (workspaceId !== undefined && workspaceId !== null) {
    list = list.filter((a) => a.workspaceId === workspaceId);
  }
  return list.map((a) => ({
    agentId: a.agentId,
    status: a.status,
    tmuxSession: a.tmuxSession,
    label: a.label,
    createdAt: a.createdAt,
    workspaceId: a.workspaceId,
    model: a.model,
    pinned: a.pinned || undefined,
    iceboxed: a.iceboxed || undefined,
  }));
}

// Register buildAgentList with broadcast to break circular dependency
setBuildAgentList(buildAgentList);
