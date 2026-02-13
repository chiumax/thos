/**
 * Shared type definitions for the thos dashboard.
 *
 * Three categories:
 * 1. **Claude NDJSON protocol** — messages the Claude CLI sends over its
 *    `--sdk-url` WebSocket connection (CLI → WS server).
 * 2. **Browser ↔ Server** — messages exchanged between the React client
 *    and the standalone WS relay server.
 * 3. **UI state** — view-model types consumed by React components.
 */

// ── Claude NDJSON protocol messages (CLI → server) ────────────────────────

/**
 * Sent once after the first user prompt is received. Contains session
 * metadata like the model name, working directory, and available tools.
 */
export interface ClaudeSystemInit {
  type: "system";
  subtype: "init";
  session_id: string;
  tools: unknown[];
  mcp_servers: unknown[];
  model: string;
  cwd: string;
}

/**
 * An assistant turn. `message.content` is an array of content blocks
 * (text, tool_use, tool_result) that may arrive incrementally — each
 * NDJSON line is a complete snapshot of the message so far.
 */
export interface ClaudeAssistant {
  type: "assistant";
  message: {
    id: string;
    role: "assistant";
    content: AssistantContentBlock[];
    model: string;
    stop_reason: string | null;
  };
  session_id: string;
}

/** A single content block inside an assistant message. */
export type AssistantContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

/**
 * Terminal message for a session. Includes cost/duration metrics.
 * `is_error` is true when `subtype` is `"error"`.
 */
export interface ClaudeResult {
  type: "result";
  subtype: "success" | "error";
  result?: string;
  error?: string;
  session_id: string;
  cost_usd: number;
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  num_turns: number;
}

/**
 * Claude is requesting permission to execute a tool. The dashboard must
 * reply with a `control_response` (allow / deny) before the CLI proceeds.
 *
 * Wire format uses a nested `request` object with `request_id` at the
 * top level for correlation (matches Companion protocol docs).
 */
export interface ClaudeControlRequest {
  type: "control_request";
  request_id: string;
  request: {
    subtype: "can_use_tool";
    tool_name: string;
    input: Record<string, unknown>;
    tool_use_id?: string;
    description?: string;
  };
  session_id?: string;
}

/**
 * Hook lifecycle events emitted during CLI startup. `hook_response` is
 * the signal that the CLI is ready to receive the first user prompt.
 */
export interface ClaudeSystemHook {
  type: "system";
  subtype: "hook_started" | "hook_response";
  session_id?: string;
}

/** Discriminated union of all known Claude NDJSON message shapes. */
export type ClaudeMessage =
  | ClaudeSystemInit
  | ClaudeAssistant
  | ClaudeResult
  | ClaudeControlRequest
  | ClaudeSystemHook
  | { type: string; subtype?: string; [key: string]: unknown };

// ── Browser ↔ Server messages ─────────────────────────────────────────────

/** Browser asks the server to spawn a new Claude CLI process. */
export interface BrowserSpawn {
  type: "spawn";
  prompt: string;
}

/** Browser sends a follow-up message to an already-running Claude session. */
export interface BrowserSendMessage {
  type: "send_message";
  agentId: string;
  content: string;
}

/** Browser responds to a tool approval request (allow or deny). */
export interface BrowserControlResponse {
  type: "control_response";
  agentId: string;
  request_id: string;
  allow: boolean;
}

/** Union of all messages the browser can send to the WS server. */
export type BrowserMessage = BrowserSpawn | BrowserSendMessage | BrowserControlResponse;

/** Server relays a raw Claude NDJSON message to the browser. */
export interface ServerRelay {
  type: "relay";
  agentId: string;
  message: ClaudeMessage;
}

/** Server notifies the browser of an agent status change. */
export interface ServerStatus {
  type: "status";
  agentId: string;
  status: AgentStatus;
}

/** Server reports an error (e.g. no active session, process crash). */
export interface ServerError {
  type: "error";
  agentId: string;
  error: string;
}

/** Summary of an agent for the sidebar. */
export interface AgentInfo {
  agentId: string;
  status: AgentStatus;
  tmuxSession: string | null;
  label: string;
  createdAt: number;
}

/** Server sends the full list of agents after every state change. */
export interface ServerAgentList {
  type: "agent_list";
  agents: AgentInfo[];
}

/** Server confirms a new agent was spawned and assigns its ID. */
export interface ServerSpawned {
  type: "spawned";
  agentId: string;
}

/** Server replays full message history for an agent on browser connect. */
export interface ServerMessageHistory {
  type: "message_history";
  agentId: string;
  messages: ServerMessage[];
}

/** CLI WebSocket disconnected (process may have crashed or exited). */
export interface ServerCliDisconnected {
  type: "cli_disconnected";
  agentId: string;
}

/** CLI WebSocket reconnected (e.g. after relaunch with --resume). */
export interface ServerCliConnected {
  type: "cli_connected";
  agentId: string;
}

/** Union of all messages the WS server can send to the browser. */
export type ServerMessage =
  | ServerRelay
  | ServerStatus
  | ServerError
  | ServerAgentList
  | ServerSpawned
  | ServerMessageHistory
  | ServerCliDisconnected
  | ServerCliConnected;

// ── UI state ──────────────────────────────────────────────────────────────

/**
 * Lifecycle states of the Claude agent process:
 * - `idle`      — no process running, ready to spawn
 * - `spawning`  — process launched, waiting for CLI to connect via WS
 * - `connected` — CLI connected and `system/init` received
 * - `thinking`  — waiting for assistant response
 * - `done`      — `result` message received, process finished
 * - `error`     — process crashed or unexpected failure
 */
export type AgentStatus = "idle" | "spawning" | "connected" | "thinking" | "done" | "disconnected" | "error";

export type ChatMessageRole = "user" | "assistant" | "system";

/**
 * A single entry in the chat message list. System messages include
 * session init info and result summaries. Messages with a `controlRequest`
 * are rendered as tool-approval cards instead of plain bubbles.
 */
/** A single option in an AskUserQuestion question. */
export interface UserQuestionOption {
  label: string;
  description?: string;
}

/** A single question from AskUserQuestion. */
export interface UserQuestion {
  question: string;
  header?: string;
  options: UserQuestionOption[];
  multiSelect: boolean;
}

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  timestamp: number;
  /** Present when this message represents a tool approval request. */
  controlRequest?: {
    id: string;
    tool_name: string;
    input: Record<string, unknown>;
    /** Set to true after the user allows or denies. */
    resolved?: boolean;
  };
  /** Present when this message is an AskUserQuestion control request. */
  userQuestion?: {
    requestId: string;
    questions: UserQuestion[];
    resolved?: boolean;
  };
}
