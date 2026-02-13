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
 * ## Resilience features
 *
 * - **Server-side message history** — every relay message is stored per-agent.
 * - **File persistence** — agent state + history persisted to disk, survives restarts.
 * - **Multi-browser** — multiple tabs can connect simultaneously.
 * - **CLI relaunch** — dead agents with a sessionId are relaunched with `--resume`.
 * - **Message queuing** — messages sent while CLI is disconnected are queued and flushed on reconnect.
 * - **Disconnect notifications** — browser is notified of CLI disconnect/reconnect.
 *
 * ## Message flow
 *
 * 1. Browser sends `{ type: "spawn", prompt }`.
 * 2. Server creates agent entry, spawns `claude --sdk-url ws://localhost:9900/claude/<agentId>`.
 * 3. CLI connects on `/claude/<agentId>`, sends `system/hook_started` then `system/hook_response`.
 * 4. On `hook_response`, server forwards the pending prompt to the CLI.
 * 5. CLI sends `system/init`, then `assistant` messages, then `result`.
 * 6. All CLI messages are relayed to the browser as `{ type: "relay", agentId, message }`.
 * 7. `control_request` messages (tool approval) are relayed to the browser;
 *    the browser's `control_response` (with `agentId`) is forwarded back to the right CLI.
 */
import { WebSocketServer, WebSocket } from "ws";
import { execSync, spawn } from "child_process";
import { randomBytes } from "crypto";
import type { IncomingMessage } from "http";
import type {
  BrowserMessage,
  ClaudeMessage,
  ServerMessage,
  AgentStatus,
  AgentInfo,
} from "../lib/types";
import { SessionStore, type PersistedAgent } from "./session-store";

const PORT = 9900;
const TMUX_SESSION_PREFIX = "thos-agent";
const wss = new WebSocketServer({ port: PORT });
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
  /** Captured from system/init, used in subsequent user messages and --resume. */
  sessionId: string | null;
  /** Stores control_request inputs keyed by request_id, for building control_responses. */
  pendingControlRequests: Map<string, Record<string, unknown>>;
  /** All messages sent to the browser for this agent (source of truth). */
  messageHistory: ServerMessage[];
  /** Messages queued while CLI is disconnected, flushed on reconnect. */
  pendingMessages: string[];
}

const agents = new Map<string, AgentState>();

/** All active browser connections (supports multiple tabs). */
const browserSockets = new Set<WebSocket>();

/** Generate a short random agent ID. */
function newAgentId(): string {
  return randomBytes(4).toString("hex");
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
    },
    messageHistory: agent.messageHistory,
  };
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
      pendingControlRequests: new Map(),
      messageHistory: p.messageHistory,
      pendingMessages: [],
    };

    // Agents that weren't "done" or "error" when the server died are now disconnected
    if (agent.status !== "done" && agent.status !== "error") {
      agent.status = "disconnected";
    }

    agents.set(agent.agentId, agent);
    console.log(`[restore] agent ${agent.agentId} (status=${agent.status}, ${agent.messageHistory.length} messages)`);
  }
  console.log(`[restore] loaded ${persisted.length} agents from disk`);
}

restoreAgents();

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

/** Build a snapshot of all agents for the sidebar. */
function buildAgentList(): AgentInfo[] {
  return Array.from(agents.values()).map((a) => ({
    agentId: a.agentId,
    status: a.status,
    tmuxSession: a.tmuxSession,
    label: a.label,
    createdAt: a.createdAt,
  }));
}

/** Send the full agent list to all browsers. */
function broadcastAgentList() {
  sendToBrowser({ type: "agent_list", agents: buildAgentList() });
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
 * Record a message in the agent's history and send to all browsers.
 * This is used for relay messages so that message history is the source of truth.
 */
function recordAndSend(agentId: string, msg: ServerMessage) {
  const agent = agents.get(agentId);
  if (agent) {
    agent.messageHistory.push(msg);
    persistAgent(agent); // debounced — streaming messages come fast
  }
  sendToBrowser(msg);
}

// ── Agent lifecycle ────────────────────────────────────────────────────────

/**
 * Terminate a specific agent by killing its tmux session.
 * Closes the Claude WebSocket and removes the agent from the Map.
 */
function killAgent(agentId: string) {
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
  agents.delete(agentId);
  store.remove(agentId);
  broadcastAgentList();
}

/**
 * Spawn a new Claude CLI process inside a tmux session.
 *
 * Creates a new agent entry, spawns the CLI with `--sdk-url` pointing to
 * `/claude/<agentId>`, and sends a `spawned` message to the browser.
 */
function spawnClaude(prompt: string): string {
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
  const claudeCmd = `unset CLAUDECODE; exec claude --sdk-url ws://localhost:${PORT}/claude/${agentId}`;

  const tmux = spawn("tmux", ["new-session", "-d", "-s", sessionName, "bash", "-c", claudeCmd], {
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

/**
 * Attempt to relaunch a dead agent's CLI with --resume.
 * Only works if the agent has a sessionId from a previous system/init.
 */
function relaunchAgent(agent: AgentState) {
  if (!agent.sessionId) {
    console.log(`[relaunch] agent ${agent.agentId} has no sessionId, cannot resume`);
    return;
  }

  const sessionName = agent.tmuxSession ?? `${TMUX_SESSION_PREFIX}-${agent.agentId}`;
  console.log(`[relaunch] attempting --resume for agent ${agent.agentId} (session=${agent.sessionId})`);

  setAgentStatus(agent.agentId, "spawning");

  // Kill any lingering tmux session with the same name
  try {
    execSync(`tmux kill-session -t ${sessionName}`, { stdio: "ignore" });
  } catch {
    // fine if it doesn't exist
  }

  const claudeCmd = `unset CLAUDECODE; exec claude --resume --sdk-url ws://localhost:${PORT}/claude/${agent.agentId}`;

  const tmux = spawn("tmux", ["new-session", "-d", "-s", sessionName, "bash", "-c", claudeCmd], {
    stdio: "ignore",
  });

  tmux.on("error", (err) => {
    console.error(`[relaunch] tmux error for ${agent.agentId}:`, err);
    setAgentStatus(agent.agentId, "error");
    recordAndSend(agent.agentId, { type: "error", agentId: agent.agentId, error: `relaunch error: ${err.message}` });
  });

  tmux.on("exit", (code) => {
    if (code !== 0) {
      console.error(`[relaunch] tmux exited with code ${code} for ${agent.agentId}`);
      setAgentStatus(agent.agentId, "error");
      recordAndSend(agent.agentId, { type: "error", agentId: agent.agentId, error: `relaunch tmux exited with code ${code}` });
      return;
    }
    agent.tmuxSession = sessionName;
    broadcastAgentList();
    persistAgentSync(agent);
    console.log(`[relaunch] tmux session ${sessionName} created for agent ${agent.agentId}`);
  });
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
 * - CLI disconnect → "disconnected" (handled in connection close handler)
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
    const userMsg = JSON.stringify({
      type: "user",
      message: { role: "user", content: agent.pendingPrompt },
      parent_tool_use_id: null,
      session_id: agent.sessionId ?? "",
    });
    console.log(`[server → claude:${agentId}]`, userMsg);
    agent.claudeSocket.send(userMsg + "\n");
    agent.pendingPrompt = null;
    setAgentStatus(agentId, "thinking");
  }

  // Track status based on message type
  if (msg.type === "system" && (msg as { subtype?: string }).subtype === "init") {
    // Capture session_id for subsequent user messages
    agent.sessionId = (msg as { session_id?: string }).session_id ?? null;
    setAgentStatus(agentId, "connected");
  } else if (msg.type === "assistant") {
    setAgentStatus(agentId, "thinking");
  } else if (msg.type === "result") {
    // CLI stays alive after result — ready for the next turn.
    // Status only goes to "disconnected" when the CLI WebSocket actually closes.
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
 */
function handleBrowserMessage(raw: string) {
  let msg: BrowserMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    console.error("[browser] invalid JSON:", raw);
    return;
  }

  console.log("[browser →]", msg.type);

  switch (msg.type) {
    case "spawn":
      spawnClaude(msg.prompt);
      break;

    case "send_message": {
      const agent = agents.get(msg.agentId);
      if (!agent) {
        sendToBrowser({ type: "error", agentId: msg.agentId, error: "Unknown agent" });
        break;
      }
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
  }
}

// ── Send message history to a single browser socket ────────────────────────

/** Send full state to a newly connected browser: agent list + message history per agent. */
function sendFullStateToSocket(ws: WebSocket) {
  if (ws.readyState !== WebSocket.OPEN) return;

  // 1. Agent list
  ws.send(JSON.stringify({ type: "agent_list", agents: buildAgentList() }));

  // 2. Message history per agent
  for (const agent of agents.values()) {
    if (agent.messageHistory.length > 0) {
      ws.send(
        JSON.stringify({
          type: "message_history",
          agentId: agent.agentId,
          messages: agent.messageHistory,
        })
      );
    }
  }
}

// ── Connection handler — route by URL path ────────────────────────────────
wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const path = req.url ?? "/";
  console.log(`[ws connected] path=${path}`);

  if (path === "/browser") {
    browserSockets.add(ws);

    // Send full state to this browser
    sendFullStateToSocket(ws);

    // Attempt to relaunch any disconnected agents
    for (const agent of agents.values()) {
      if (agent.status === "disconnected" && !agent.claudeSocket) {
        relaunchAgent(agent);
      }
    }

    ws.on("message", (data) => {
      handleBrowserMessage(data.toString());
    });

    ws.on("close", () => {
      console.log("[browser disconnected]");
      browserSockets.delete(ws);
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

    ws.on("message", (data) => {
      handleClaudeMessage(agentId, data.toString());
    });

    ws.on("close", () => {
      console.log(`[claude:${agentId} CLI disconnected]`);
      if (agent.claudeSocket === ws) {
        agent.claudeSocket = null;
        if (agent.status !== "error" && agent.status !== "done") {
          setAgentStatus(agentId, "disconnected");
          // Notify browsers that CLI disconnected
          sendToBrowser({ type: "cli_disconnected", agentId });
        }
      }
    });
  } else {
    console.log(`[ws] unknown path: ${path}, closing`);
    ws.close();
  }
});

// ── tmux cleanup ──────────────────────────────────────────────────────────

/** Kill all tmux sessions matching the thos-agent prefix. */
function killAllAgentSessions() {
  try {
    const sessions = execSync("tmux list-sessions -F '#{session_name}'", {
      encoding: "utf-8",
    })
      .trim()
      .split("\n")
      .filter((s) => s.startsWith(TMUX_SESSION_PREFIX));

    for (const s of sessions) {
      try {
        execSync(`tmux kill-session -t ${s}`, { stdio: "ignore" });
        console.log(`[tmux] cleaned up stale session ${s}`);
      } catch {}
    }
  } catch {
    // tmux server not running or no sessions — fine
  }
}

function shutdown() {
  console.log("[ws server] shutting down...");

  // Persist all agents synchronously before exit
  const allPersisted = Array.from(agents.values()).map(toPersistedAgent);
  store.flushAll(allPersisted);
  console.log(`[ws server] saved ${allPersisted.length} agents to disk`);

  killAllAgentSessions();
  wss.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Clean up any orphaned tmux sessions from previous runs
killAllAgentSessions();

console.log(`[ws server] listening on port ${PORT}`);
