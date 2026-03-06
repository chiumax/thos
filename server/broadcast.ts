/**
 * Broadcasting helpers — send messages to connected browser WebSocket clients.
 *
 * Extracted from ws.ts. These are the core primitives used by all
 * server modules to communicate with the dashboard.
 */

import { WebSocket } from "ws";
import type { AgentInfo, ServerMessage, Task } from "../lib/types";

/** All active browser connections (supports multiple tabs). */
export const browserSockets = new Set<WebSocket>();

/** Per-browser workspace scope (null = show all). */
export const browserWorkspaceScope = new Map<WebSocket, string | null>();

/** Send a JSON message to all connected browsers. */
export function sendToBrowser(msg: ServerMessage) {
  const payload = JSON.stringify(msg);
  for (const ws of browserSockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

/**
 * Lazy-bound agent list builder. Set by agent-state.ts on import to
 * break the circular dependency between broadcast and agent-state.
 */
let _buildAgentList: (workspaceId?: string | null) => AgentInfo[] = () => [];

export function setBuildAgentList(fn: (workspaceId?: string | null) => AgentInfo[]) {
  _buildAgentList = fn;
}

/** Send the full agent list to all browsers (scoped per-browser workspace). */
export function broadcastAgentList() {
  for (const ws of browserSockets) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    const scope = browserWorkspaceScope.get(ws) ?? null;
    ws.send(JSON.stringify({ type: "agent_list", agents: _buildAgentList(scope) }));
  }
}

/** Build the full task list sorted by creation time (newest first), optionally filtered by workspace. */
export function buildTaskList(tasks: Map<string, Task>, workspaceId?: string | null): Task[] {
  let list = Array.from(tasks.values());
  if (workspaceId !== undefined && workspaceId !== null) {
    list = list.filter((t) => t.workspaceId === workspaceId);
  }
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

/** Send the full task list to all browsers (scoped per-browser workspace). */
export function broadcastTaskList(tasks: Map<string, Task>) {
  for (const ws of browserSockets) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    const scope = browserWorkspaceScope.get(ws) ?? null;
    ws.send(JSON.stringify({ type: "task_list", tasks: buildTaskList(tasks, scope) }));
  }
}

/** Send the full workspace list to all browsers. */
export function broadcastWorkspaceList(workspaces: Map<string, { id: string; name: string; cwd: string; createdAt: number }>) {
  const payload = JSON.stringify({ type: "workspace_list", workspaces: Array.from(workspaces.values()) });
  for (const ws of browserSockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}
