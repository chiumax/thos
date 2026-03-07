/**
 * UI state types — view-model types consumed by React components.
 */

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

/** Info about a single tool_use block in an assistant message. */
export interface ToolCallInfo {
  name: string;
  toolUseId?: string;
  /** Truncated one-line preview of the tool result, if available. */
  resultPreview?: string;
  /** Raw tool input data, preserved for file-modifying tools (Edit, Write, MultiEdit). */
  input?: Record<string, unknown>;
}

/**
 * A single entry in the chat message list. System messages include
 * session init info and result summaries. Messages with a `controlRequest`
 * are rendered as tool-approval cards instead of plain bubbles.
 */
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
    /** Tool description from the protocol, if available. */
    description?: string;
    /** Set to true after the user allows or denies. */
    resolved?: boolean;
    /** Whether the user allowed (true) or denied (false). */
    allowed?: boolean;
  };
  /** Present when this message is an AskUserQuestion control request. */
  userQuestion?: {
    requestId: string;
    questions: UserQuestion[];
    resolved?: boolean;
  };
  /** Tool calls found in this assistant message. */
  toolCalls?: ToolCallInfo[];
  /** True when this message has only tool_use/tool_result blocks and no text. */
  isToolOnly?: boolean;
}

// ── Notifications ──────────────────────────────────────────────────────

export type NotificationType = "done" | "error" | "control_request" | "question";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  agentId: string;
  agentLabel: string;
  message: string;
  timestamp: number;
  read: boolean;
}
