/**
 * Standalone WebSocket relay server for the thos dashboard.
 *
 * Runs on port 9900 alongside Next.js. This is the entry point — it sets
 * up the WebSocket server, restores persisted state, and routes connections
 * to the appropriate handlers.
 *
 * ## Architecture
 *
 * Two WebSocket path families:
 * - `/browser`          — the React dashboard connects here (supports multiple tabs).
 * - `/claude/:agentId`  — each Claude CLI connects here (passed as `--sdk-url`).
 *
 * Server modules:
 * - `agent-state.ts`       — agent Map, lifecycle, persistence, dedup
 * - `broadcast.ts`         — browser socket management, broadcasting
 * - `handlers/browser.ts`  — browser message handler
 * - `handlers/claude.ts`   — Claude CLI message handler
 * - `session-store.ts`     — file-based agent persistence
 * - `task-store.ts`        — file-based task persistence
 * - `workspace-store.ts`   — file-based workspace persistence
 */

import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Task, Workspace, ClaudeMessage } from "../lib/types";
import {
  agents,
  store,
  toPersistedAgent,
  compactHistory,
  persistAgentSync,
  setAgentStatus,
  listAliveTmuxSessions,
  recordAndSend,
  buildAgentList,
  type AgentState,
} from "./agent-state";
import {
  browserSockets,
  browserWorkspaceScope,
  sendToBrowser,
  buildTaskList,
  broadcastTaskList,
} from "./broadcast";
import { handleBrowserMessage, initBrowserHandler } from "./handlers/browser";
import { handleClaudeMessage } from "./handlers/claude";
import { TaskStore } from "./task-store";
import { WorkspaceStore } from "./workspace-store";

const PORT = 9900;

/** Check if an IP is localhost or in the Tailscale CGNAT range (100.64.0.0/10). */
function isAllowedIP(ip: string | undefined): boolean {
  if (!ip) return false;
  const addr = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (addr === "127.0.0.1" || addr === "::1" || addr === "localhost") return true;
  const parts = addr.split(".");
  if (parts.length !== 4) return false;
  const first = parseInt(parts[0], 10);
  const second = parseInt(parts[1], 10);
  return first === 100 && second >= 64 && second <= 127;
}

const wss = new WebSocketServer({
  port: PORT,
  verifyClient: (info: { req: { socket: { remoteAddress?: string } } }) => {
    const ip = info.req.socket.remoteAddress;
    const allowed = isAllowedIP(ip);
    if (!allowed) console.log(`[ws] rejected connection from ${ip}`);
    return allowed;
  },
});

// ── Shared state ───────────────────────────────────────────────────────

const taskStore = new TaskStore();
const tasks = new Map<string, Task>();
const workspaceStore = new WorkspaceStore();
const workspaces = new Map<string, Workspace>();

function persistTasks() {
  taskStore.saveSync(Array.from(tasks.values()));
}

function persistWorkspaces() {
  workspaceStore.saveSync(Array.from(workspaces.values()));
}

// ── Restore from disk ──────────────────────────────────────────────────

function restoreAgents() {
  const persisted = store.loadAll();
  const aliveSessions = listAliveTmuxSessions();

  for (const p of persisted) {
    const agent: AgentState = {
      agentId: p.state.agentId,
      claudeSocket: null,
      tmuxSession: p.state.tmuxSession,
      pendingPrompt: null,
      status: p.state.status,
      label: p.state.label,
      createdAt: p.state.createdAt,
      sessionId: p.state.sessionId,
      workspaceId: p.state.workspaceId ?? null,
      model: p.state.model ?? null,
      pinned: p.state.pinned ?? false,
      iceboxed: p.state.iceboxed ?? false,
      pendingControlRequests: new Map(),
      messageHistory: compactHistory(p.messageHistory),
      pendingMessages: [],
    };

    if (agent.status !== "done" && agent.status !== "error") {
      const tmuxAlive = agent.tmuxSession ? aliveSessions.has(agent.tmuxSession) : false;
      if (tmuxAlive) {
        agent.status = "disconnected";
        console.log(`[restore] agent ${agent.agentId} — tmux alive, waiting for CLI reconnect`);
      } else {
        agent.status = "done";
        console.log(`[restore] agent ${agent.agentId} — tmux dead, archived`);
      }
    }

    agents.set(agent.agentId, agent);
    const originalCount = p.messageHistory.length;
    const compactedCount = agent.messageHistory.length;
    const saved = originalCount - compactedCount;
    console.log(`[restore] agent ${agent.agentId} (status=${agent.status}, ${compactedCount} messages${saved > 0 ? `, compacted from ${originalCount} (−${saved})` : ""})`);

    if (saved > 0) {
      persistAgentSync(agent);
    }
  }
  console.log(`[restore] loaded ${persisted.length} agents from disk`);
}

function restoreTasks() {
  const persisted = taskStore.loadAll();
  for (const t of persisted) {
    tasks.set(t.id, t);
  }
  console.log(`[restore] loaded ${persisted.length} tasks from disk`);
}

function restoreWorkspaces() {
  const persisted = workspaceStore.loadAll();
  for (const w of persisted) {
    workspaces.set(w.id, w);
  }
  console.log(`[restore] loaded ${persisted.length} workspaces from disk`);
}

restoreAgents();
restoreTasks();
restoreWorkspaces();

// ── Initialize browser handler ─────────────────────────────────────────

function sendHistoryToSocket(ws: WebSocket, agentId: string) {
  const agent = agents.get(agentId);
  if (!agent || ws.readyState !== WebSocket.OPEN) return;
  ws.send(
    JSON.stringify({
      type: "message_history",
      agentId: agent.agentId,
      messages: agent.messageHistory,
    })
  );
}

initBrowserHandler({
  tasks,
  workspaces,
  persistTasks,
  persistWorkspaces,
  sendHistoryToSocket,
});

// ── Send initial state to a newly connected browser ────────────────────

function sendFullStateToSocket(ws: WebSocket) {
  if (ws.readyState !== WebSocket.OPEN) return;

  ws.send(JSON.stringify({ type: "workspace_list", workspaces: Array.from(workspaces.values()) }));

  const scope = browserWorkspaceScope.get(ws) ?? null;
  ws.send(JSON.stringify({ type: "agent_list", agents: buildAgentList(scope) }));
  ws.send(JSON.stringify({ type: "task_list", tasks: buildTaskList(tasks, scope) }));
}

// ── Connection handler ─────────────────────────────────────────────────

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const path = req.url ?? "/";
  console.log(`[ws connected] path=${path}`);

  if (path === "/browser") {
    sendFullStateToSocket(ws);
    browserSockets.add(ws);

    ws.on("message", (data) => {
      handleBrowserMessage(data.toString(), ws);
    });

    ws.on("close", () => {
      console.log("[browser disconnected]");
      browserSockets.delete(ws);
      browserWorkspaceScope.delete(ws);
    });
  } else if (path.startsWith("/claude/")) {
    const agentId = path.slice("/claude/".length);
    const agent = agents.get(agentId);

    if (!agent) {
      console.log(`[ws] unknown agentId: ${agentId}, closing`);
      ws.close();
      return;
    }

    agent.claudeSocket = ws;
    console.log(`[claude:${agentId} CLI connected via WebSocket]`);
    sendToBrowser({ type: "cli_connected", agentId });

    // Flush pending messages
    if (agent.pendingMessages.length > 0) {
      console.log(`[flush] sending ${agent.pendingMessages.length} queued messages to agent ${agentId}`);
      for (const queued of agent.pendingMessages) {
        ws.send(queued + "\n");
      }
      agent.pendingMessages = [];
      persistAgentSync(agent);
    }

    // Send pending prompt immediately
    if (agent.pendingPrompt && ws.readyState === WebSocket.OPEN) {
      const promptContent = agent.pendingPrompt;
      const userMsg = JSON.stringify({
        type: "user",
        message: { role: "user", content: promptContent },
        parent_tool_use_id: null,
        session_id: agent.sessionId ?? "",
      });
      console.log(`[server → claude:${agentId}] sending pending prompt`);
      ws.send(userMsg + "\n");
      agent.pendingPrompt = null;
      setAgentStatus(agentId, "thinking");

      recordAndSend(agentId, {
        type: "relay",
        agentId,
        message: { type: "user", message: { role: "user", content: promptContent } } as ClaudeMessage,
      });
    }

    ws.on("message", (data) => {
      handleClaudeMessage(agentId, data.toString());
    });

    ws.on("close", () => {
      console.log(`[claude:${agentId} CLI disconnected]`);
      if (agent.claudeSocket === ws) {
        agent.claudeSocket = null;
        if (agent.status !== "error") {
          setAgentStatus(agentId, "done");
          sendToBrowser({ type: "cli_disconnected", agentId });

          for (const task of tasks.values()) {
            if (task.agentId === agentId && task.status !== "done") {
              task.status = "done";
              task.updatedAt = Date.now();
              persistTasks();
              broadcastTaskList(tasks);
              break;
            }
          }
        }
      }
    });
  } else {
    console.log(`[ws] unknown path: ${path}, closing`);
    ws.close();
  }
});

// ── Graceful shutdown ─────────────────────────────────────────────────

function shutdown() {
  console.log("[ws server] shutting down...");

  const allPersisted = Array.from(agents.values()).map(toPersistedAgent);
  store.flushAll(allPersisted);
  console.log(`[ws server] saved ${allPersisted.length} agents to disk (tmux sessions preserved)`);

  taskStore.flush(Array.from(tasks.values()));
  console.log(`[ws server] saved ${tasks.size} tasks to disk`);

  persistWorkspaces();
  console.log(`[ws server] saved ${workspaces.size} workspaces to disk`);

  wss.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log(`[ws server] listening on port ${PORT}`);
