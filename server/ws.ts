/**
 * Standalone WebSocket relay server for the thos dashboard.
 *
 * Runs on port 9900 alongside Next.js (started via `concurrently` in the
 * `dev` script). It cannot be a Next.js API route because API routes don't
 * support persistent WebSocket connections.
 *
 * ## Architecture
 *
 * Two WebSocket path families:
 * - `/browser`          — the React dashboard connects here (supports multiple tabs).
 * - `/claude/:agentId`  — each Claude CLI connects here (passed as `--sdk-url`).
 *
 * The server supports multiple concurrent agents, each tracked in the
 * `agents` Map keyed by a short random ID.
 *
 * ## Connection flow (browser)
 *
 * On browser connect, the server sends two small messages:
 * 1. `agent_list`  — metadata for all agents (sidebar).
 * 2. `task_list`   — all tasks.
 *
 * Message histories are NOT sent eagerly. They are loaded lazily: the
 * browser sends `{ type: "request_history", agentId }` when the user
 * selects an agent, and the server responds with `message_history` for
 * that single agent. This avoids sending megabytes of JSON on connect,
 * which caused multi-minute loading times on mobile networks.
 *
 * Live messages for active agents are still broadcast to all browsers
 * via `relay` messages in real time.
 *
 * ## Message flow (spawning)
 *
 * 1. Browser sends `{ type: "spawn", prompt }`.
 * 2. Server creates agent entry, spawns `claude --sdk-url ws://localhost:9900/claude/<agentId>`.
 * 3. CLI connects on `/claude/<agentId>`, sends `system/hook_started` then `system/hook_response`.
 * 4. On `hook_response`, server forwards the pending prompt to the CLI.
 * 5. CLI sends `system/init`, then `assistant` messages, then `result`.
 * 6. All CLI messages are relayed to the browser as `{ type: "relay", agentId, message }`.
 * 7. `control_request` messages (tool approval) are relayed to the browser;
 *    the browser's `control_response` (with `agentId`) is forwarded back to the right CLI.
 *
 * ## Resilience features
 *
 * - **Server-side message history** — every relay message is stored per-agent.
 * - **File persistence** — agent state + history persisted to disk, survives restarts.
 * - **Multi-browser** — multiple tabs can connect simultaneously.
 * - **tmux survival** — tmux sessions are NOT killed on server restart; CLI processes
 *   can reconnect to the new server if they retry their WebSocket connection.
 * - **Message queuing** — messages sent while CLI is disconnected are queued and flushed on reconnect.
 * - **Disconnect notifications** — browser is notified of CLI disconnect/reconnect.
 * - **Lazy history** — message histories loaded on demand per agent, not on connect.
 */
import { WebSocketServer, WebSocket } from "ws";
import { execSync, spawn } from "child_process";
import { randomBytes } from "crypto";
import type { IncomingMessage } from "http";
import { readdirSync, statSync, existsSync, writeFileSync } from "fs";
import { join, dirname, basename } from "path";
import { tmpdir } from "os";
import type {
  BrowserMessage,
  ClaudeMessage,
  ServerMessage,
  AgentStatus,
  AgentInfo,
  Task,
  Workspace,
  DirectoryEntry,
} from "../lib/types";
import { SessionStore, type PersistedAgent } from "./session-store";
import { TaskStore } from "./task-store";
import { WorkspaceStore } from "./workspace-store";

const PORT = 9900;
const TMUX_SESSION_PREFIX = "thos-agent";

/** Check if an IP is localhost or in the Tailscale CGNAT range (100.64.0.0/10). */
function isAllowedIP(ip: string | undefined): boolean {
  if (!ip) return false;
  // Strip IPv6-mapped IPv4 prefix
  const addr = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (addr === "127.0.0.1" || addr === "::1" || addr === "localhost") return true;
  // Tailscale CGNAT: 100.64.0.0/10 → 100.64.0.0 – 100.127.255.255
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
const store = new SessionStore();

// ── Multi-agent state ──────────────────────────────────────────────────────

interface AgentState {
  agentId: string;
  claudeSocket: WebSocket | null;
  tmuxSession: string | null;
  pendingPrompt: string | null;
  status: AgentStatus;
  label: string;
  createdAt: number;
  /** Captured from system/init, used in subsequent user messages. */
  sessionId: string | null;
  /** Workspace this agent belongs to. */
  workspaceId: string | null;
  /** Model name from system/init or requested at spawn time. */
  model: string | null;
  /** Whether this agent is pinned to the top of the sidebar. */
  pinned: boolean;
  /** Whether this agent is in the icebox (parked for later). */
  iceboxed: boolean;
  /** Stores control_request inputs keyed by request_id, for building control_responses. */
  pendingControlRequests: Map<string, Record<string, unknown>>;
  /** All messages sent to the browser for this agent (source of truth). */
  messageHistory: ServerMessage[];
  /** Messages queued while CLI is disconnected, flushed on reconnect. */
  pendingMessages: string[];
}

const agents = new Map<string, AgentState>();
const taskStore = new TaskStore();
const tasks = new Map<string, Task>();
const workspaceStore = new WorkspaceStore();
const workspaces = new Map<string, Workspace>();

/** All active browser connections (supports multiple tabs). */
const browserSockets = new Set<WebSocket>();

/** Per-browser workspace scope (null = show all). */
const browserWorkspaceScope = new Map<WebSocket, string | null>();

/** Generate a short random agent ID. */
function newAgentId(): string {
  return randomBytes(4).toString("hex");
}

// ── tmux helpers ───────────────────────────────────────────────────────────

/** Return the set of currently alive tmux session names matching the thos prefix. */
function listAliveTmuxSessions(): Set<string> {
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

// ── Persistence helpers ────────────────────────────────────────────────────

/** Build a PersistedAgent snapshot from live state. */
function toPersistedAgent(agent: AgentState): PersistedAgent {
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

/**
 * Compact a message history by deduplicating cumulative snapshots.
 * Keeps only the last version of each assistant/user message ID.
 * Called on restore to shrink legacy bloated histories.
 */
function compactHistory(history: ServerMessage[]): ServerMessage[] {
  // Build a map of msgId → last index
  const lastIndex = new Map<string, number>();
  for (let i = 0; i < history.length; i++) {
    const id = getRelayMessageId(history[i]);
    if (id) lastIndex.set(id, i);
  }
  // Keep only messages that are either non-deduplicable or the last occurrence
  return history.filter((msg, i) => {
    const id = getRelayMessageId(msg);
    if (!id) return true; // non-relay or no message ID — always keep
    return lastIndex.get(id) === i;
  });
}

/** Persist agent state (debounced — use for streaming events). */
function persistAgent(agent: AgentState) {
  store.save(toPersistedAgent(agent));
}

/** Persist agent state immediately (use for critical state changes). */
function persistAgentSync(agent: AgentState) {
  store.saveSync(toPersistedAgent(agent));
}

// ── Restore from disk on startup ───────────────────────────────────────────

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

    // Determine status for agents that were active when the server last ran
    if (agent.status !== "done" && agent.status !== "error") {
      const tmuxAlive = agent.tmuxSession ? aliveSessions.has(agent.tmuxSession) : false;
      if (tmuxAlive) {
        // tmux session still alive — CLI may reconnect to this server
        agent.status = "disconnected";
        console.log(`[restore] agent ${agent.agentId} — tmux alive, waiting for CLI reconnect`);
      } else {
        // tmux session gone — agent is archived
        agent.status = "done";
        console.log(`[restore] agent ${agent.agentId} — tmux dead, archived`);
      }
    }

    agents.set(agent.agentId, agent);
    const originalCount = p.messageHistory.length;
    const compactedCount = agent.messageHistory.length;
    const saved = originalCount - compactedCount;
    console.log(`[restore] agent ${agent.agentId} (status=${agent.status}, ${compactedCount} messages${saved > 0 ? `, compacted from ${originalCount} (−${saved})` : ""})`);

    // Persist compacted history back to disk
    if (saved > 0) {
      persistAgentSync(agent);
    }
  }
  console.log(`[restore] loaded ${persisted.length} agents from disk`);
}

restoreAgents();

// ── Task restore + helpers ────────────────────────────────────────────────

function restoreTasks() {
  const persisted = taskStore.loadAll();
  for (const t of persisted) {
    tasks.set(t.id, t);
  }
  console.log(`[restore] loaded ${persisted.length} tasks from disk`);
}

restoreTasks();

// ── Workspace restore + helpers ──────────────────────────────────────────

function restoreWorkspaces() {
  const persisted = workspaceStore.loadAll();
  for (const w of persisted) {
    workspaces.set(w.id, w);
  }
  console.log(`[restore] loaded ${persisted.length} workspaces from disk`);
}

restoreWorkspaces();

/** Persist all workspaces to disk (sync). */
function persistWorkspaces() {
  workspaceStore.saveSync(Array.from(workspaces.values()));
}

/** Send the full workspace list to all browsers. */
function broadcastWorkspaceList() {
  const payload = JSON.stringify({ type: "workspace_list", workspaces: Array.from(workspaces.values()) });
  for (const ws of browserSockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

/** Build the full task list sorted by creation time (newest first), optionally filtered by workspace. */
function buildTaskList(workspaceId?: string | null): Task[] {
  let list = Array.from(tasks.values());
  if (workspaceId !== undefined && workspaceId !== null) {
    list = list.filter((t) => t.workspaceId === workspaceId);
  }
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

/** Send the full task list to all browsers (scoped per-browser workspace). */
function broadcastTaskList() {
  for (const ws of browserSockets) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    const scope = browserWorkspaceScope.get(ws) ?? null;
    ws.send(JSON.stringify({ type: "task_list", tasks: buildTaskList(scope) }));
  }
}

/** Persist all tasks to disk (sync). */
function persistTasks() {
  taskStore.saveSync(Array.from(tasks.values()));
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Send a JSON message to all connected browsers. */
function sendToBrowser(msg: ServerMessage) {
  const payload = JSON.stringify(msg);
  for (const ws of browserSockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

/** Build a snapshot of all agents for the sidebar, optionally filtered by workspace. */
function buildAgentList(workspaceId?: string | null): AgentInfo[] {
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

/** Send the full agent list to all browsers (scoped per-browser workspace). */
function broadcastAgentList() {
  for (const ws of browserSockets) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    const scope = browserWorkspaceScope.get(ws) ?? null;
    ws.send(JSON.stringify({ type: "agent_list", agents: buildAgentList(scope) }));
  }
}

/** Update an agent's status, notify browsers, broadcast list, and persist. */
function setAgentStatus(agentId: string, status: AgentStatus) {
  const agent = agents.get(agentId);
  if (!agent) return;
  agent.status = status;
  sendToBrowser({ type: "status", agentId, status });
  broadcastAgentList();
  persistAgentSync(agent);
}

/**
 * Extract a stable dedup key from a relay message, if present.
 *
 * Claude NDJSON sends cumulative snapshots for two message types:
 * - `assistant` — keyed by `message.id` (e.g. `msg_01VE1P7c...`)
 * - `user` (tool_result) — keyed by top-level `uuid` (e.g. `b217b852-...`)
 *
 * Additionally, one-per-session messages are deduplicated by session_id:
 * - `system/init` — keyed by `init:<session_id>`
 * - `result` — keyed by `result:<session_id>`
 *
 * We deduplicate by replacing the previous snapshot in `messageHistory`
 * instead of appending, reducing storage from O(n²) to O(n).
 */
function getRelayMessageId(msg: ServerMessage): string | null {
  if (msg.type !== "relay") return null;
  const inner = msg.message;
  if (inner.type === "assistant") {
    return (inner as { message?: { id?: string } }).message?.id ?? null;
  }
  if (inner.type === "user") {
    return (inner as { uuid?: string }).uuid ?? null;
  }
  // Dedup system/init and result by session_id so they don't stack on reload
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

/**
 * Record a message in the agent's history and send to all browsers.
 *
 * For cumulative snapshot messages (assistant, user/tool_result), replaces the
 * previous snapshot with the same message ID instead of appending. This keeps
 * only the final version of each message, dramatically reducing file sizes
 * (e.g. 38 MB → ~1 MB for a typical session).
 */
function recordAndSend(agentId: string, msg: ServerMessage) {
  const agent = agents.get(agentId);
  if (agent) {
    const msgId = getRelayMessageId(msg);
    if (msgId) {
      // Replace previous snapshot with same message ID (search from end for speed)
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
    persistAgent(agent); // debounced — streaming messages come fast
  }
  sendToBrowser(msg);
}

// ── Agent lifecycle ────────────────────────────────────────────────────────

/**
 * Stop a running agent by killing its tmux session and closing the CLI socket.
 * The agent remains in the Map (status set to "done") so it can be viewed/deleted later.
 */
function stopAgent(agentId: string) {
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

/**
 * Permanently delete an agent: stop it, remove from Map, remove from disk.
 */
function deleteAgent(agentId: string) {
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
 *
 * Creates a new agent entry, spawns the CLI with `--sdk-url` pointing to
 * `/claude/<agentId>`, and sends a `spawned` message to the browser.
 * If `workspaceId` is provided, the tmux session starts in that workspace's cwd.
 */
function spawnClaude(prompt: string, workspaceId?: string | null, model?: string | null, systemPrompt?: string | null): string {
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

  // Notify browsers
  sendToBrowser({ type: "spawned", agentId });
  broadcastAgentList();
  persistAgentSync(agent);

  // Build the claude command with CLAUDECODE unset to bypass nesting protection.
  // tmux new-session runs detached (-d) so spawn() returns immediately.
  const modelFlag = model ? ` --model ${model}` : "";
  let systemPromptFlag = "";
  if (systemPrompt) {
    // Write system prompt to a temp file to avoid shell escaping issues
    const spFile = join(tmpdir(), `thos-sp-${agentId}`);
    writeFileSync(spFile, systemPrompt, "utf-8");
    systemPromptFlag = ` --append-system-prompt "$(cat ${spFile})"`;
  }
  const claudeCmd = `unset CLAUDECODE; exec claude --dangerously-skip-permissions${modelFlag}${systemPromptFlag} --sdk-url ws://localhost:${PORT}/claude/${agentId}`;

  // If the agent belongs to a workspace, start tmux in that workspace's cwd
  const workspace = workspaceId ? workspaces.get(workspaceId) : null;
  const tmuxArgs = ["new-session", "-d", "-s", sessionName];
  if (workspace) {
    tmuxArgs.push("-c", workspace.cwd);
  }
  tmuxArgs.push("bash", "-c", claudeCmd);

  const tmux = spawn("tmux", tmuxArgs, {
    stdio: "ignore",
  });

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

// ── Message handlers ───────────────────────────────────────────────────────

/**
 * Process an incoming NDJSON message from a specific Claude CLI.
 *
 * Status flow matches the Companion protocol:
 * - hook_response → send pending prompt → "thinking"
 * - system/init   → "connected" + capture session_id
 * - assistant      → "thinking"
 * - result         → "connected" (CLI stays alive for multi-turn)
 * - CLI disconnect → "done" (handled in connection close handler)
 */
function handleClaudeMessage(agentId: string, raw: string) {
  const agent = agents.get(agentId);
  if (!agent) return;

  let msg: ClaudeMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    console.error(`[claude:${agentId}] invalid JSON:`, raw);
    return;
  }

  // Silently ignore keep_alive messages
  if (msg.type === "keep_alive") return;

  console.log(`[claude:${agentId} →]`, msg.type, (msg as { subtype?: string }).subtype ?? "");

  // After hook_response, send the pending prompt
  if (
    msg.type === "system" &&
    (msg as { subtype?: string }).subtype === "hook_response" &&
    agent.pendingPrompt &&
    agent.claudeSocket?.readyState === WebSocket.OPEN
  ) {
    const promptContent = agent.pendingPrompt;
    const userMsg = JSON.stringify({
      type: "user",
      message: { role: "user", content: promptContent },
      parent_tool_use_id: null,
      session_id: agent.sessionId ?? "",
    });
    console.log(`[server → claude:${agentId}]`, userMsg);
    agent.claudeSocket.send(userMsg + "\n");
    agent.pendingPrompt = null;
    setAgentStatus(agentId, "thinking");

    // Record the initial user message so it appears in chat and persists across reloads
    recordAndSend(agentId, {
      type: "relay",
      agentId,
      message: { type: "user", message: { role: "user", content: promptContent } } as ClaudeMessage,
    });
  }

  // Track status based on message type
  if (msg.type === "system" && (msg as { subtype?: string }).subtype === "init") {
    // Capture session_id and model for subsequent user messages
    agent.sessionId = (msg as { session_id?: string }).session_id ?? null;
    agent.model = (msg as { model?: string }).model ?? agent.model;
    setAgentStatus(agentId, "connected");
  } else if (msg.type === "assistant") {
    setAgentStatus(agentId, "thinking");
  } else if (msg.type === "result") {
    // CLI stays alive after result — ready for the next turn.
    // Status only goes to "done" when the CLI WebSocket actually closes.
    setAgentStatus(agentId, "connected");
  }

  // Store control_request inputs for building proper responses later
  if (msg.type === "control_request") {
    const cr = msg as { request_id?: string; request?: { input?: Record<string, unknown> } };
    if (cr.request_id && cr.request?.input) {
      agent.pendingControlRequests.set(cr.request_id, cr.request.input);
    }
  }

  // Record in history and relay to browsers
  recordAndSend(agentId, { type: "relay", agentId, message: msg });
}

/**
 * Process an incoming JSON message from the browser.
 * - `spawn`: create a new agent (does NOT kill others).
 * - `send_message`: forward a follow-up user message to the specified agent.
 * - `control_response`: forward a tool allow/deny decision to the specified agent.
 * - `kill_agent`: stop the CLI and tmux session.
 * - `delete_agent`: permanently remove an agent.
 * - `rename_agent`: update an agent's label.
 * - `clear_history`: wipe an agent's message history.
 * - `request_history`: send message history for a single agent (lazy loading).
 * - `create_task` / `update_task` / `delete_task` / `delegate_task`: task CRUD.
 */
function handleBrowserMessage(raw: string, senderWs: WebSocket) {
  let msg: BrowserMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    console.error("[browser] invalid JSON:", raw);
    return;
  }

  console.log("[browser →]", msg.type);

  switch (msg.type) {
    case "spawn": {
      const scope = browserWorkspaceScope.get(senderWs) ?? msg.workspaceId ?? null;
      spawnClaude(msg.prompt, scope, msg.model, msg.systemPrompt);
      break;
    }

    case "send_message": {
      const agent = agents.get(msg.agentId);
      if (!agent) {
        sendToBrowser({ type: "error", agentId: msg.agentId, error: "Unknown agent" });
        break;
      }

      // Record the user message in history so it persists across reloads.
      // Do NOT broadcast — the sending browser already has it optimistically,
      // and other browsers will get it when they request_history.
      agent.messageHistory.push({
        type: "relay",
        agentId: msg.agentId,
        message: { type: "user", message: { role: "user", content: msg.content } },
      } as ServerMessage);
      persistAgent(agent);

      if (agent.claudeSocket?.readyState === WebSocket.OPEN) {
        const userMsg = JSON.stringify({
          type: "user",
          message: { role: "user", content: msg.content },
          parent_tool_use_id: null,
          session_id: agent.sessionId ?? "",
        });
        agent.claudeSocket.send(userMsg + "\n");
        setAgentStatus(msg.agentId, "thinking");
      } else {
        // Queue message for delivery when CLI reconnects
        const userMsg = JSON.stringify({
          type: "user",
          message: { role: "user", content: msg.content },
          parent_tool_use_id: null,
          session_id: agent.sessionId ?? "",
        });
        agent.pendingMessages.push(userMsg);
        console.log(`[queue] queued message for agent ${msg.agentId} (${agent.pendingMessages.length} pending)`);
        persistAgentSync(agent);
      }
      break;
    }

    case "control_response": {
      const agent = agents.get(msg.agentId);
      if (agent?.claudeSocket?.readyState === WebSocket.OPEN) {
        // Retrieve the original tool input to include as updatedInput (required by protocol)
        const originalInput = agent.pendingControlRequests.get(msg.request_id) ?? {};
        agent.pendingControlRequests.delete(msg.request_id);

        // If the browser sent answers (from AskUserQuestion), merge them into the input
        const answers = (msg as { answers?: Record<string, string> }).answers;
        const updatedInput = answers
          ? { ...originalInput, answers }
          : originalInput;

        const response = JSON.stringify({
          type: "control_response",
          response: {
            subtype: "success",
            request_id: msg.request_id,
            response: msg.allow
              ? { behavior: "allow", updatedInput }
              : { behavior: "deny", message: "Denied by user" },
          },
        });
        agent.claudeSocket.send(response + "\n");
      }
      break;
    }

    case "kill_agent":
      stopAgent(msg.agentId);
      break;

    case "delete_agent":
      deleteAgent(msg.agentId);
      break;

    case "rename_agent": {
      const agent = agents.get(msg.agentId);
      if (!agent) break;
      agent.label = msg.label;
      broadcastAgentList();
      persistAgentSync(agent);
      break;
    }

    case "clear_history": {
      const agent = agents.get(msg.agentId);
      if (!agent) break;
      agent.messageHistory = [];
      persistAgentSync(agent);
      sendToBrowser({ type: "history_cleared", agentId: msg.agentId });
      break;
    }

    case "pin_agent": {
      const agent = agents.get(msg.agentId);
      if (!agent) break;
      agent.pinned = msg.pinned;
      broadcastAgentList();
      persistAgentSync(agent);
      break;
    }

    case "icebox_agent": {
      const agent = agents.get(msg.agentId);
      if (!agent) break;
      agent.iceboxed = msg.iceboxed;
      broadcastAgentList();
      persistAgentSync(agent);
      break;
    }

    case "move_agent": {
      const agent = agents.get(msg.agentId);
      if (!agent) break;
      agent.workspaceId = msg.workspaceId;
      broadcastAgentList();
      persistAgentSync(agent);
      break;
    }

    case "request_history": {
      console.log(`[browser] request_history for ${msg.agentId}`);
      sendHistoryToSocket(senderWs, msg.agentId);
      break;
    }

    case "create_task": {
      const taskId = randomBytes(4).toString("hex");
      const task: Task = {
        id: taskId,
        title: msg.title,
        description: msg.description,
        status: "todo",
        priority: msg.priority,
        agentId: null,
        workspaceId: browserWorkspaceScope.get(senderWs) ?? null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      tasks.set(taskId, task);
      persistTasks();
      broadcastTaskList();
      break;
    }

    case "update_task": {
      const task = tasks.get(msg.taskId);
      if (!task) break;
      Object.assign(task, msg.updates, { updatedAt: Date.now() });
      persistTasks();
      broadcastTaskList();

      // Archive the linked agent when a task is marked as done
      if (task.status === "done" && task.agentId) {
        const linkedAgent = agents.get(task.agentId);
        if (linkedAgent && linkedAgent.status !== "done") {
          stopAgent(task.agentId);
        }
      }
      break;
    }

    case "delete_task": {
      tasks.delete(msg.taskId);
      persistTasks();
      broadcastTaskList();
      break;
    }

    case "delegate_task": {
      const task = tasks.get(msg.taskId);
      if (!task) break;
      const prompt = `Task: ${task.title}\n\n${task.description}`;
      const agentId = spawnClaude(prompt, task.workspaceId);
      task.agentId = agentId;
      task.status = "in-progress";
      task.updatedAt = Date.now();
      persistTasks();
      broadcastTaskList();
      break;
    }

    // ── Workspace messages ──────────────────────────────────────────────

    case "set_workspace": {
      browserWorkspaceScope.set(senderWs, msg.workspaceId);
      // Re-send scoped agent list and task list to this browser
      const scope = msg.workspaceId;
      senderWs.send(JSON.stringify({ type: "agent_list", agents: buildAgentList(scope) }));
      senderWs.send(JSON.stringify({ type: "task_list", tasks: buildTaskList(scope) }));
      break;
    }

    case "create_workspace": {
      const id = randomBytes(4).toString("hex");
      const workspace: Workspace = {
        id,
        name: msg.name,
        cwd: msg.cwd,
        createdAt: Date.now(),
      };
      workspaces.set(id, workspace);
      persistWorkspaces();
      broadcastWorkspaceList();
      break;
    }

    case "rename_workspace": {
      const workspace = workspaces.get(msg.workspaceId);
      if (!workspace) break;
      workspace.name = msg.name;
      persistWorkspaces();
      broadcastWorkspaceList();
      break;
    }

    case "delete_workspace": {
      workspaces.delete(msg.workspaceId);
      // Unlink agents and tasks from the deleted workspace
      for (const agent of agents.values()) {
        if (agent.workspaceId === msg.workspaceId) {
          agent.workspaceId = null;
          persistAgentSync(agent);
        }
      }
      for (const task of tasks.values()) {
        if (task.workspaceId === msg.workspaceId) {
          task.workspaceId = null;
        }
      }
      persistTasks();
      persistWorkspaces();
      broadcastWorkspaceList();
      broadcastAgentList();
      broadcastTaskList();
      break;
    }

    case "browse_directory": {
      const dirPath = msg.path;
      try {
        if (!existsSync(dirPath)) {
          senderWs.send(JSON.stringify({ type: "directory_listing", path: dirPath, entries: [] }));
          break;
        }
        const entries: DirectoryEntry[] = [];
        // Add parent directory entry
        const parent = dirname(dirPath);
        if (parent !== dirPath) {
          entries.push({ name: "..", path: parent });
        }
        // List subdirectories only
        const items = readdirSync(dirPath);
        for (const item of items) {
          if (item.startsWith(".")) continue; // skip dotfiles
          const fullPath = join(dirPath, item);
          try {
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
              entries.push({ name: item, path: fullPath });
            }
          } catch {
            // skip inaccessible entries
          }
        }
        // Sort: ".." first, then alphabetical
        entries.sort((a, b) => {
          if (a.name === "..") return -1;
          if (b.name === "..") return 1;
          return a.name.localeCompare(b.name);
        });
        senderWs.send(JSON.stringify({ type: "directory_listing", path: dirPath, entries }));
      } catch (err) {
        console.error(`[browse_directory] error reading ${dirPath}:`, err);
        senderWs.send(JSON.stringify({ type: "directory_listing", path: dirPath, entries: [] }));
      }
      break;
    }
  }
}

// ── Send message history to a single browser socket ────────────────────────

/** Send initial state (workspaces, agent list, tasks) to a newly connected browser. */
function sendFullStateToSocket(ws: WebSocket) {
  if (ws.readyState !== WebSocket.OPEN) return;

  // Workspace list
  ws.send(JSON.stringify({ type: "workspace_list", workspaces: Array.from(workspaces.values()) }));

  // Agent list (sidebar metadata) — scoped if browser has a workspace set
  const scope = browserWorkspaceScope.get(ws) ?? null;
  ws.send(JSON.stringify({ type: "agent_list", agents: buildAgentList(scope) }));

  // Task list — scoped if browser has a workspace set
  ws.send(JSON.stringify({ type: "task_list", tasks: buildTaskList(scope) }));
}

/** Send message history for a single agent to a specific browser socket. */
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

// ── Connection handler — route by URL path ────────────────────────────────
wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const path = req.url ?? "/";
  console.log(`[ws connected] path=${path}`);

  if (path === "/browser") {
    // Send full state BEFORE adding to browserSockets so that live
    // relay broadcasts don't interleave with the history replay.
    sendFullStateToSocket(ws);
    browserSockets.add(ws);

    ws.on("message", (data) => {
      handleBrowserMessage(data.toString(), ws);
    });

    ws.on("close", () => {
      console.log("[browser disconnected]");
      browserSockets.delete(ws);
      browserWorkspaceScope.delete(ws);
      // Do NOT kill agents — keep them alive for reconnect
    });
  } else if (path.startsWith("/claude/")) {
    // Parse agentId from /claude/<agentId>
    const agentId = path.slice("/claude/".length);
    const agent = agents.get(agentId);

    if (!agent) {
      console.log(`[ws] unknown agentId: ${agentId}, closing`);
      ws.close();
      return;
    }

    agent.claudeSocket = ws;
    console.log(`[claude:${agentId} CLI connected via WebSocket]`);

    // Notify browsers that CLI is connected
    sendToBrowser({ type: "cli_connected", agentId });

    // Flush any pending messages queued while CLI was disconnected
    if (agent.pendingMessages.length > 0) {
      console.log(`[flush] sending ${agent.pendingMessages.length} queued messages to agent ${agentId}`);
      for (const queued of agent.pendingMessages) {
        ws.send(queued + "\n");
      }
      agent.pendingMessages = [];
      persistAgentSync(agent);
    }

    // Send the pending prompt immediately — CLI 2.1.42+ waits for the
    // server to send the first user message rather than emitting
    // hook_started/hook_response on connect.
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

      // Record the initial user message so it appears in chat and persists across reloads
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

          // Auto-complete any task linked to this agent
          for (const task of tasks.values()) {
            if (task.agentId === agentId && task.status !== "done") {
              task.status = "done";
              task.updatedAt = Date.now();
              persistTasks();
              broadcastTaskList();
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

// ── Graceful shutdown ─────────────────────────────────────────────────────

function shutdown() {
  console.log("[ws server] shutting down...");

  // Persist all agents synchronously before exit — do NOT kill tmux sessions
  // so CLI processes can reconnect if the server restarts.
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
